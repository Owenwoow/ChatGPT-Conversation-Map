const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../popup/index.html'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, '../popup/settings.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return {promise, resolve, reject};
}

function openSettings({language = 'en-US', fallbackLanguage = 'en-US', settings = {}, get, set} = {}) {
  const elements = Array.from(html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi), match => {
    const attributes = Object.fromEntries(Array.from(match[2].matchAll(/([\w-]+)="([^"]*)"/g), item => [item[1], item[2]]));
    return {
      id: attributes.id,
      type: attributes.type,
      dataset: {
        ...(attributes['data-i18n'] && {i18n: attributes['data-i18n']})
      },
      textContent: '',
      checked: false,
      value: '',
      disabled: /\bdisabled\b/.test(match[2]),
      listeners: {},
      addEventListener(event, callback) { this.listeners[event] = callback; }
    };
  });
  const document = {
    documentElement: {lang: 'en'},
    title: '',
    getElementById: id => elements.find(element => element.id === id),
    querySelectorAll: () => elements.filter(element => element.dataset.i18n)
  };
  const writes = [];
  const chrome = {
    i18n: language === null ? undefined : {getUILanguage: () => language},
    storage: {local: {
      get: get || (async defaults => ({...defaults, ...settings})),
      set: async values => { writes.push({...values}); if (set) await set(values); }
    }}
  };
  vm.runInNewContext(script, {document, chrome, navigator: {language: fallbackLanguage}});
  return {document, elements, writes, input: document.getElementById, status: document.getElementById('status')};
}

test('设置页跟随浏览器界面语言，中文地区变体使用简体中文，其他语言回退英文', async () => {
  for (const language of ['zh-CN', 'zh-TW', 'zh-HK', 'ZH-cn', 'zh', 'en-US', 'fr-FR']) {
    const page = openSettings({language, fallbackLanguage: language.startsWith('zh') ? 'en-US' : 'zh-CN'});
    await flush();
    const chinese = /^zh/i.test(language);
    assert.equal(page.document.documentElement.lang, chinese ? 'zh-CN' : 'en');
    assert.equal(page.input('leftLabel').textContent, chinese ? '对话小地图' : 'Conversation map');
    assert.equal(page.input('blockCopyLabel').textContent, chinese ? '图块复制' : 'Copy content blocks');
    assert.match(page.document.title, chinese ? /设置/ : /Settings/);
    for (const element of page.elements.filter(element => element.dataset.i18n)) {
      assert.equal(typeof element.textContent, 'string');
      assert.ok(element.textContent.length, `缺失翻译：${element.dataset.i18n}`);
    }
    assert.equal(page.status.dataset.state, 'ready');
  }
});

test('无浏览器语言 API 时使用 navigator.language', async () => {
  const page = openSettings({language: null, fallbackLanguage: 'zh-CN'});
  await flush();
  assert.equal(page.document.documentElement.lang, 'zh-CN');
});

test('读取期间禁用控件，读取后恢复已有设置并为无效数据使用默认值', async () => {
  const read = deferred();
  const page = openSettings({get: () => read.promise});
  assert.equal(page.input('leftEnabled').disabled, true);
  read.resolve({leftEnabled: false, rightEnabled: 'false', autoExpand: true, autoCollapse: true, outlineWidth: 'invalid', immersiveMode: true});
  await flush();
  assert.equal(page.input('leftEnabled').checked, false);
  assert.equal(page.input('rightEnabled').checked, true);
  assert.equal(page.input('autoCollapse').checked, true);
  assert.equal(page.input('immersiveMode').checked, true);
  assert.equal(page.input('blockCopyEnabled').checked, true);
  assert.equal(page.input('outlineWidth').value, 'auto');
  assert.equal(page.input('leftEnabled').disabled, false);
});

test('修改开关和宽度时保存对应字段并给出本地化反馈', async () => {
  const page = openSettings({language: 'zh-CN', settings: {outlineWidth: 'wide'}});
  await flush();
  assert.equal(page.input('outlineWidth').value, 'wide');
  page.input('leftEnabled').checked = false;
  await page.input('leftEnabled').listeners.change();
  page.input('outlineWidth').value = 'narrow';
  await page.input('outlineWidth').listeners.change();
  assert.deepEqual(page.writes, [{leftEnabled: false}, {outlineWidth: 'narrow'}]);
  assert.equal(page.status.dataset.state, 'saved');
  assert.match(page.status.textContent, /已保存/);
});

test('并行保存时不提前显示成功，失败还原控件，重试可以恢复', async () => {
  const saves = [deferred(), deferred()];
  let attempt = 0;
  const page = openSettings({set: () => saves[attempt++]?.promise});
  await flush();
  page.input('leftEnabled').checked = false;
  page.input('outlineWidth').value = 'wide';
  const first = page.input('leftEnabled').listeners.change();
  const second = page.input('outlineWidth').listeners.change();
  assert.equal(page.status.dataset.state, 'saving');
  saves[0].resolve();
  await first;
  assert.equal(page.status.dataset.state, 'saving');
  saves[1].reject(new Error('Storage unavailable'));
  await second;
  assert.equal(page.input('leftEnabled').checked, false);
  assert.equal(page.input('outlineWidth').value, 'auto');
  assert.equal(page.input('outlineWidth').disabled, false);
  assert.equal(page.status.dataset.state, 'error');
  assert.match(page.status.textContent, /Could not save/);
  page.input('outlineWidth').value = 'wide';
  await page.input('outlineWidth').listeners.change();
  assert.equal(page.status.dataset.state, 'saved');
});

test('读取失败时保留禁用状态并提示重新打开扩展', async () => {
  const page = openSettings({language: 'zh-CN', get: async () => { throw new Error('Storage unavailable'); }});
  await flush();
  assert.equal(page.status.dataset.state, 'error');
  assert.match(page.status.textContent, /无法读取设置/);
  assert.equal(page.input('leftEnabled').disabled, true);
  assert.deepEqual(page.writes, []);
});

test('连续调整同一设置时按顺序保存，较早的失败不覆盖较新的选择', async () => {
  const firstWrite = deferred();
  const secondWrite = deferred();
  let attempt = 0;
  const page = openSettings({set: () => [firstWrite, secondWrite][attempt++].promise});
  await flush();
  const input = page.input('outlineWidth');
  input.value = 'narrow';
  const first = input.listeners.change();
  input.value = 'wide';
  const second = input.listeners.change();
  await flush();
  assert.equal(input.disabled, false);
  assert.deepEqual(page.writes, [{outlineWidth: 'narrow'}]);
  firstWrite.reject(new Error('First write failed'));
  await first;
  assert.equal(input.value, 'wide');
  secondWrite.resolve();
  await second;
  assert.deepEqual(page.writes, [{outlineWidth: 'narrow'}, {outlineWidth: 'wide'}]);
  assert.equal(input.value, 'wide');
  assert.equal(page.status.dataset.state, 'error');
});

test('图块复制默认开启，可关闭并恢复已保存状态', async () => {
  const page = openSettings();
  await flush();
  assert.equal(page.input('blockCopyEnabled').checked, true);
  page.input('blockCopyEnabled').checked = false;
  await page.input('blockCopyEnabled').listeners.change();
  assert.deepEqual(page.writes, [{blockCopyEnabled: false}]);
  const reopened = openSettings({settings: page.writes[0]});
  await flush();
  assert.equal(reopened.input('blockCopyEnabled').checked, false);
});
