chrome.runtime.onMessage.addListener((message, sender) => {
  if (message !== 'open-new-chat' || !sender.tab || sender.frameId !== 0 ||
      sender.origin !== 'https://chatgpt.com') return;
  chrome.tabs.create({
    url: 'https://chatgpt.com/',
    windowId: sender.tab.windowId,
    openerTabId: sender.tab.id,
    active: false
  });
});
