const {expect}=require('@playwright/test');
const path=require('node:path');

module.exports=async function questionNavigation(browser) {
  const page=await browser.newPage({viewport:{width:1600,height:900}});
  try {
    await page.route('https://chatgpt.com/**',route=>route.fulfill({path:path.join(__dirname,'fixture.html'),contentType:'text/html'}));
    await page.goto('https://chatgpt.com/c/virtual-question');
    await page.evaluate(()=>{
      document.documentElement.style.overflowAnchor='none';
      const thread=document.querySelector('#thread');
      thread.replaceChildren();
      for(let i=0;i<3;i++) {
        addTurn(i,'<p>回答正文</p>');
        const wrapper=document.createElement('div');
        wrapper.dataset.virtualizedTurn='';
        wrapper.style.height=i===0?'3000px':'1500px';
        wrapper.append(...Array.from(thread.children).slice(-2));
        thread.append(wrapper);
      }
      const extra=document.createElement('article');
      extra.dataset.testid='conversation-turn-6';
      extra.innerHTML='<div data-message-author-role="assistant" data-message-id="extra-answer">回答片段</div>';
      thread.append(extra);
    });
    for(const script of ['adapter','model','content'])await page.addScriptTag({path:path.join(__dirname,`../src/${script}.js`)});
    const root=page.locator('#dual-navigator-host');
    const tick=id=>root.locator(`.tick[data-id="${id}"]`);
    const question=id=>page.locator(`[data-message-id="${id}"]`);
    await expect(root.locator('.tick')).toHaveCount(3);
    await expect(tick('extra-answer')).toHaveCount(0);
    await tick('u2').click();
    await expect.poll(()=>question('u2').evaluate(el=>Math.round(el.getBoundingClientRect().top))).toBe(90);
    // No DOM anchor survives unloading. Shrinking the preceding answer makes the
    // old coordinate land deep in a different response, outside the mount window.
    await page.evaluate(()=>{
      const wrappers=document.querySelectorAll('[data-virtualized-turn]');
      const target=wrappers[1], spacer=document.createElement('div');
      spacer.style.height=target.style.height;
      target.replaceWith(spacer);wrappers[0].style.height='800px';
      const mount=()=>{
        if(Math.abs(spacer.getBoundingClientRect().top)>180)return;
        spacer.replaceWith(target);window.removeEventListener('scroll',mount);
      };
      window.addEventListener('scroll',mount);
    });
    await tick('u1').click();
    await expect.poll(()=>question('u1').evaluateAll(es=>es.length?Math.abs(es[0].getBoundingClientRect().top-90):Infinity)).toBeLessThanOrEqual(1);
    await expect(tick('u1')).toHaveAttribute('aria-current','step');

    // React can swap the message nodes before the extension's next scan.
    await page.evaluate(()=>{
      const target=document.querySelector('[data-message-id="u1"]');
      const other=document.querySelector('[data-message-id="u2"]');
      const replacement=target.cloneNode(true);
      target.replaceWith(replacement);other.replaceWith(target);target.dataset.messageId='u2';
      document.querySelector('#dual-navigator-host').shadowRoot.querySelector('[data-id="u1"]').click();
    });
    await expect.poll(()=>question('u1').evaluate(el=>Math.round(el.getBoundingClientRect().top))).toBe(90);
    await tick('u0').click();
    await page.evaluate(()=>document.querySelector('[data-message-id="u1"]').remove());
    const original=await page.evaluate(()=>window.scrollY);
    await tick('u1').click();
    await expect(root.locator('.status')).toContainText('已返回跳转前的位置',{timeout:7000});
    expect(await page.evaluate(()=>window.scrollY)).toBe(original);
    await expect(tick('u1')).not.toHaveAttribute('aria-current','step');
    console.log('PASS 历史坐标失效、节点复用及未找到提问时恢复原位');
  } finally {await page.close();}
};
