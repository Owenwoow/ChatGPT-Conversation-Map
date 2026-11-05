(() => {
  const defaults = {leftEnabled:true,rightEnabled:true,autoExpand:true,autoCollapse:false,outlineWidth:'auto',immersiveMode:false,blockCopyEnabled:true};
  const messages = {
    en: {
      pageTitle: 'ChatGPT Conversation Map · Settings',
      appName: 'Conversation Map',
      tagline: 'Find your way through long conversations.',
      navigationTitle: 'Navigation',
      leftLabel: 'Conversation map',
      leftHint: 'Jump between turns on the left.',
      rightLabel: 'Response outline',
      rightHint: 'Browse response headings on the right.',
      widthLabel: 'Outline width',
      widthHint: 'Adapts to the available space.',
      widthAuto: 'Auto',
      widthNarrow: 'Narrow · 240 px',
      widthMedium: 'Medium · 320 px',
      widthWide: 'Wide · 400 px',
      behaviorTitle: 'Outline behavior',
      expandLabel: 'Auto-expand while generating',
      expandHint: 'Show the outline as new headings appear.',
      collapseLabel: 'Auto-collapse',
      collapseHint: 'Collapse when you leave. Manually opened outlines stay open.',
      focusTitle: 'Focused reading',
      immersiveLabel: 'Immersive mode',
      immersiveHint: 'Hide the ChatGPT sidebar after you send a message.',
      toolsTitle: 'Content tools',
      blockCopyLabel: 'Copy content blocks',
      blockCopyHint: 'Show a copy button on static diagrams and cards.',
      loading: 'Loading settings…',
      ready: 'Changes save automatically and apply immediately.',
      saving: 'Saving…',
      saved: 'Saved · Applied immediately',
      saveError: 'Could not save. Try changing the setting again.',
      loadError: 'Could not load settings. Please reopen the extension.'
    },
    zh: {
      pageTitle: 'ChatGPT 对话地图 · 设置',
      appName: '对话地图',
      tagline: '长对话，也能轻松找到方向。',
      navigationTitle: '导航显示',
      leftLabel: '对话小地图',
      leftHint: '在页面左侧定位历史提问',
      rightLabel: '回答目录',
      rightHint: '在页面右侧浏览章节结构',
      widthLabel: '目录宽度',
      widthHint: '空间不足时自动收窄',
      widthAuto: '自动',
      widthNarrow: '窄 · 240 像素',
      widthMedium: '中 · 320 像素',
      widthWide: '宽 · 400 像素',
      behaviorTitle: '目录行为',
      expandLabel: '生成时自动展开',
      expandHint: '跟随新回答的标题更新',
      collapseLabel: '自动收起',
      collapseHint: '离开自动展开的目录后收起；手动展开则保持',
      focusTitle: '专注阅读',
      immersiveLabel: '沉浸模式',
      immersiveHint: '每次发送消息后自动收起 ChatGPT 侧边栏',
      toolsTitle: '内容工具',
      blockCopyLabel: '图块复制',
      blockCopyHint: '悬停静态图表或卡片时显示复制按钮',
      loading: '正在读取设置…',
      ready: '设置自动保存，即时生效',
      saving: '正在保存…',
      saved: '已保存，即时生效',
      saveError: '保存失败，请重新调整此项设置',
      loadError: '无法读取设置，请重新打开扩展'
    }
  };

  const browserLanguage = globalThis.chrome?.i18n?.getUILanguage?.() || navigator.language || 'en';
  const locale = /^zh\b/i.test(browserLanguage) ? 'zh' : 'en';
  const text = messages[locale];
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  document.title = text.pageTitle;
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = text[element.dataset.i18n];
  }

  const status = document.getElementById('status');
  const controls = Object.keys(defaults).map(key => document.getElementById(key));
  const persisted = {...defaults};
  const latestChanges = new Map();
  let saveQueue = Promise.resolve();
  let pending = 0, failed = false;

  function showStatus(key, state) {
    status.textContent = text[key];
    status.dataset.state = state;
  }

  function save(input) {
    const key = input.id;
    const value = input.type === 'checkbox' ? input.checked : input.value;
    const change = {};
    latestChanges.set(key, change);
    if (!pending) failed = false;
    pending++;
    showStatus('saving', 'saving');
    // Keep controls focusable while serializing writes in the user's change order.
    saveQueue = saveQueue.then(async () => {
      try {
        await chrome.storage.local.set({[key]:value});
        persisted[key] = value;
      } catch {
        failed = true;
        if (latestChanges.get(key) === change) {
          if (input.type === 'checkbox') input.checked = persisted[key];
          else input.value = persisted[key];
        }
      } finally {
        if (latestChanges.get(key) === change) latestChanges.delete(key);
        pending--;
        if (!pending) showStatus(failed ? 'saveError' : 'saved', failed ? 'error' : 'saved');
      }
    });
    return saveQueue;
  }

  async function load() {
    try {
      const settings = await chrome.storage.local.get(defaults);
      for (const input of controls) {
        const key = input.id;
        const valid = input.type === 'checkbox'
          ? typeof settings[key] === 'boolean'
          : ['auto','narrow','medium','wide'].includes(settings[key]);
        persisted[key] = valid ? settings[key] : defaults[key];
        if (input.type === 'checkbox') input.checked = persisted[key];
        else input.value = persisted[key];
        input.addEventListener('change', () => save(input));
        input.disabled = false;
      }
      showStatus('ready', 'ready');
    } catch {
      showStatus('loadError', 'error');
    }
  }

  load();
})();
