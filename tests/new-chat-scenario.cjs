const {expect} = require('@playwright/test');

module.exports = async function newChatScenario(page) {
  // A page-level navigation listener may already exist when the extension loads.
  await page.addInitScript(() => {
    document.addEventListener('click', event => {
      if (event.ctrlKey && event.target.closest('[aria-label="新会话"], [data-testid="create-new-chat-button"]')) {
        history.pushState(null, '', '/');
        document.querySelector('#test-draft').value = '';
      }
    }, true);
  });
  await page.goto('https://chatgpt.com/c/new-tab-test');
  await expect(page.locator('#dual-navigator-host')).toHaveCount(1);
  await page.evaluate(() => {
    const nav = document.createElement('nav');
    nav.setAttribute('data-app-shell-frame', '');
    nav.style.cssText = 'position:fixed;inset:0 auto auto 0;z-index:1000';
    nav.innerHTML = '<div data-app-shell-workspace style="border-radius:var(--app-shell-rail-corner-radius,16px)"><button aria-label="新会话" style="border-radius:8px"><span>＋</span></button><a href="/" data-testid="create-new-chat-button">New chat</a><button>搜索</button></div>';
    nav.addEventListener('click', event => {
      event.preventDefault();
      nav.dataset.clicked = event.target.textContent;
    });
    document.body.append(nav);
    const draft = document.createElement('textarea');
    draft.id = 'test-draft';
    draft.value = '保留这条未发送的草稿';
    document.body.append(draft);
  });
  const nav = page.locator('nav[data-app-shell-frame]');
  const icon = nav.locator('button span');
  await expect(nav.locator('[data-app-shell-workspace]')).toHaveCSS('border-top-left-radius', '0px');
  await expect(nav.getByLabel('新会话')).toHaveCSS('border-top-left-radius', '8px');
  const context = page.context();
  await page.bringToFront();
  const worker = context.serviceWorkers().find(worker => worker.url().endsWith('/src/background.js')) ||
    await context.waitForEvent('serviceworker', worker => worker.url().endsWith('/src/background.js'));
  const listTabs = () => worker.evaluate(async () =>
    (await chrome.tabs.query({currentWindow:true})).map(({id, active, openerTabId}) => ({id, active, openerTabId})));
  const before = await listTabs();
  const originalId = before.find(tab => tab.active).id;
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
    const tabs = await listTabs();
    const added = tabs.filter(tab => !before.some(old => old.id === tab.id));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({active:true, openerTabId:originalId});
    expect(tabs.find(tab => tab.id === originalId)).toMatchObject({active:false});
    await expect(page).toHaveURL('https://chatgpt.com/c/new-tab-test');
    await expect(page.locator('#test-draft')).toHaveValue('保留这条未发送的草稿');
    expect(await nav.getAttribute('data-clicked')).toBeNull();
    await chat.close();
  }
  await icon.click();
  await expect(nav).toHaveAttribute('data-clicked', '＋');
  await nav.getByText('搜索').click({modifiers:['Control']});
  await expect(nav).toHaveAttribute('data-clicked', '搜索');
};
