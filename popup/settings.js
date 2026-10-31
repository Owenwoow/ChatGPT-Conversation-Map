const defaults = {leftEnabled:true,rightEnabled:true,autoExpand:true,autoCollapse:false};
chrome.storage.local.get(defaults).then(settings => {
  for (const key of Object.keys(defaults)) {
    const input = document.getElementById(key);
    input.checked = settings[key];
    input.addEventListener('change', async () => {
      try { await chrome.storage.local.set({[key]:input.checked}); document.getElementById('status').textContent='已保存，即时生效'; }
      catch { document.getElementById('status').textContent='保存失败，请重新打开设置'; }
    });
  }
}).catch(() => {document.getElementById('status').textContent='无法读取设置，请重新打开扩展';});
