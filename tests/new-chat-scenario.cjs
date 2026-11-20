const {expect} = require('@playwright/test');

module.exports = async function newChatScenario(page) {
  await page.goto('https://chatgpt.com/c/new-tab-test');
  await expect(page.locator('#dual-navigator-host')).toHaveCount(1);
  await page.evaluate(() => {
    const nav = document.createElement('nav');
    nav.setAttribute('data-app-shell-frame', '');
    nav.style.cssText = 'position:fixed;inset:0 auto auto 0;z-index:1000';
    nav.innerHTML = '<div data-app-shell-workspace style="border-radius:var(--app-shell-rail-corner-radius,16px)"><button aria-label="新聊天" style="border-radius:8px"><span>＋</span></button><a href="/" data-testid="create-new-chat-button">New chat</a><button>搜索</button></div>';
    nav.addEventListener('click', event => {
      event.preventDefault();
      nav.dataset.clicked = event.target.textContent;
    });
    document.body.append(nav);
  });
  const nav = page.locator('nav[data-app-shell-frame]');
  const icon = nav.locator('button span');
  await expect(nav.locator('[data-app-shell-workspace]')).toHaveCSS('border-top-left-radius', '0px');
  await expect(nav.getByLabel('新聊天')).toHaveCSS('border-top-left-radius', '8px');
  const context = page.context();
  for (const entry of [icon, nav.getByText('New chat')]) {
    const opened = context.waitForEvent('page', {timeout:5000});
    const [chat] = await Promise.all([opened, entry.click({modifiers:['Control']})]);
    // A tab opened by the service worker can navigate before Playwright attaches
    // its fixture route. Check the requested address even when running offline.
    const session = await context.newCDPSession(chat);
    await expect.poll(async () => {
      const history = await session.send('Page.getNavigationHistory');
      return history.entries[history.currentIndex]?.url;
    }).toBe('https://chatgpt.com/');
    const worker = context.serviceWorkers().find(worker => worker.url().endsWith('/src/background.js'));
    const backgroundChat = await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({currentWindow:true});
      const current = tabs.find(tab => tab.active);
      return tabs.filter(tab => !tab.active && tab.openerTabId === current?.id).length;
    });
    expect(backgroundChat).toBe(1);
    await expect(page).toHaveURL('https://chatgpt.com/c/new-tab-test');
    expect(await nav.getAttribute('data-clicked')).toBeNull();
    await chat.close();
  }
  await icon.click();
  await expect(nav).toHaveAttribute('data-clicked', '＋');
  await nav.getByText('搜索').click({modifiers:['Control']});
  await expect(nav).toHaveAttribute('data-clicked', '搜索');
};
