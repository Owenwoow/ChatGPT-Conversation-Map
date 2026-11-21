const {expect} = require('@playwright/test');
const path = require('node:path');

module.exports = async function quoteReturnScenario(browser) {
  const page = await browser.newPage({viewport: {width: 1200, height: 900}, reducedMotion: 'reduce'});
  try {
    await page.route('https://chatgpt.com/**', route => route.fulfill({
      path: path.join(__dirname, 'fixture.html'), contentType: 'text/html'
    }));
    await page.goto('https://chatgpt.com/c/quote-return-test');
    await page.evaluate(() => {
      document.documentElement.style.overflowAnchor = 'none';
      const thread = document.querySelector('#thread');
      thread.replaceChildren();
      thread.style.paddingTop = '600px';
      addTurn(0, '<p>前文 共同句子 后文甲。</p><p>别处 共同句子 后文乙。</p><p>另外一段 独立引用 内容。</p>');
      document.querySelector('.composer').innerHTML = `
        <form data-chatgpt-composer>
          <div id="preview"></div>
          <div id="prompt-textarea" contenteditable="true"></div>
          <button type="submit" data-testid="send-button">发送</button>
        </form>
        <button type="button" id="ask">Ask ChatGPT</button>`;
      const form = document.querySelector('form');
      const preview = document.querySelector('#preview');
      const editor = document.querySelector('#prompt-textarea');
      document.querySelector('#ask').addEventListener('click', () => {
        preview.textContent = window.selectedQuote;
      });
      editor.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          form.requestSubmit();
        }
      });
      window.nextTurn = 1;
      form.addEventListener('submit', event => {
        event.preventDefault();
        const id = window.nextTurn++;
        addTurn(id, `<p>回答 ${id}</p>`);
        document.querySelector(`[data-message-id="u${id}"]`).textContent = editor.textContent;
        preview.textContent = '';
        editor.textContent = '';
      });
    });
    await page.addStyleTag({path: path.join(__dirname, '../src/shell.css')});
    for (const script of ['adapter', 'model', 'quote-return', 'content']) {
      await page.addScriptTag({path: path.join(__dirname, `../src/${script}.js`)});
    }
    const root = page.locator('#dual-navigator-host');
    await expect(root.locator('.tick')).toHaveCount(1);

    const select = async (index, text) => page.evaluate(({index, text}) => {
      const node = document.querySelectorAll('[data-message-id="a0"] .markdown p')[index].firstChild;
      const start = node.data.indexOf(text);
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + text.length);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      window.selectedQuote = text;
      document.dispatchEvent(new PointerEvent('pointerup', {bubbles: true}));
    }, {index, text});
    const send = async (id, method) => {
      const editor = page.locator('#prompt-textarea');
      await editor.fill('问题 ' + id);
      if (method === 'click') await page.locator('[data-testid="send-button"]').click();
      else if (method === 'enter') await editor.press('Enter');
      else await page.locator('form').evaluate(form => form.requestSubmit());
      await expect(root.locator('.tick')).toHaveCount(id + 1);
    };
    const ask = () => page.locator('#ask').click();
    const button = id => page.locator(`[data-message-id="a${id}"] .dual-nav-quote-return`);

    await select(0, '共同句子');
    await send(1, 'click');
    await expect(button(1)).toHaveCount(0);

    await select(0, '共同句子');
    await ask();
    await page.locator('#preview').evaluate(element => { element.textContent = ''; });
    await send(2, 'enter');
    await expect(button(2)).toHaveCount(0);

    await select(1, '共同句子');
    await ask();
    await send(3, 'submit');
    await expect(button(3)).toHaveCount(1);

    await select(2, '独立引用');
    await ask();
    await send(4, 'click');
    await expect(button(4)).toHaveCount(1);

    await page.evaluate(() => {
      const body = document.querySelector('[data-message-id="a0"] .markdown');
      body.innerHTML = body.innerHTML;
    });
    await page.locator('[data-message-id="a4"]').scrollIntoViewIfNeeded();
    await button(3).click();
    await expect.poll(() => page.evaluate(() => {
      const highlight = CSS.highlights.get('dual-nav-quote');
      if (!highlight) return null;
      const range = [...highlight][0];
      return {text: range.toString(), parent: range.startContainer.parentElement.textContent};
    })).toEqual({text: '共同句子', parent: '别处 共同句子 后文乙。'});
    const top = await page.evaluate(() => Math.round(
      [...CSS.highlights.get('dual-nav-quote')][0].getBoundingClientRect().top
    ));
    expect(Math.abs(top - 300)).toBeLessThan(5);

    await page.locator('[data-message-id="a4"]').scrollIntoViewIfNeeded();
    await button(4).click();
    await expect.poll(() => page.evaluate(() => {
      const highlight = CSS.highlights.get('dual-nav-quote');
      return highlight && [...highlight][0].toString();
    })).toBe('独立引用');

    await page.evaluate(() => {
      const body = document.querySelector('[data-message-id="a0"] .markdown');
      body.querySelectorAll('p')[1].textContent = '别处 已修改的句子 后文乙。';
    });
    await button(3).click();
    await expect(root.locator('.status')).toContainText('未能确认原句，已回到原回答。');
    console.log('PASS 划选、发送方式、引用返回、重渲染与原句变化回退');
  } finally {
    await page.close();
  }
};
