const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/block-export.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function setup({value = true, get, storageAvailable = true} = {}) {
  const events = {}, intervals = [], storageListeners = new Set();
  let scans = 0, clipboardWrites = 0;
  const copy = {dataset: {}, style: {}, offsetWidth: 30, offsetHeight: 30, listeners: {}, setAttribute() {}, removeAttribute() {}, addEventListener(name, listener) { this.listeners[name] = listener; }};
  const status = {textContent: ''};
  const shadow = {activeElement: null, querySelector: selector => selector === '.copy' ? copy : status};
  class Element {
    constructor() { this.style = {setProperty() {}}; this.isConnected = true; }
    attachShadow() { return shadow; }
    addEventListener() {}
    remove() { this.isConnected = false; }
  }
  const host = new Element();
  const body = {contains: element => element === block};
  const message = {
    closest: () => null,
    getAttribute: () => 'assistant',
    querySelector: () => body,
    contains: element => element === block
  };
  const block = Object.assign(new Element(), {
    parentElement: body,
    textContent: 'A static card',
    closest: selector => selector === '.message' ? message : null,
    matches: () => true,
    querySelector: () => null,
    getBoundingClientRect: () => ({width: 240, height: 120, left: 100, right: 340, top: 100, bottom: 220})
  });
  const chrome = {
    runtime: {id: 'test-extension'},
    ...(storageAvailable && {storage: {
      local: {get: get || (async defaults => ({...defaults, blockCopyEnabled: value}))},
      onChanged: {addListener: listener => storageListeners.add(listener), removeListener: listener => storageListeners.delete(listener)}
    }})
  };
  const document = {
    getElementById: () => null,
    createElement: () => host,
    documentElement: {append() {}},
    addEventListener: (name, listener) => { events[name] = listener; }
  };
  const adapter = {getKey: () => 'conversation', selectors: {message: '.message', sidePanel: '.side-panel', body: '.body'}, scan: () => { scans++; return {messages: [{role: 'assistant', element: message}]}; }};
  vm.runInNewContext(source, {
    document, chrome, Element, AbortController,
    DualNav: {adapter},
    navigator: {clipboard: {writeText: async () => { clipboardWrites++; }}},
    ResizeObserver: class { observe() {} disconnect() {} },
    getComputedStyle: () => ({visibility: 'visible', color: 'rgb(240,240,240)'}),
    innerWidth: 1200, innerHeight: 800,
    setInterval: callback => { intervals.push(callback); return intervals.length; }, clearInterval() {},
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    window: {addEventListener() {}}
  });
  return {
    host, copy, chrome, storageListeners,
    hover: () => events.pointerover({target: block, composedPath: () => [block]}),
    change: (newValue, area = 'local') => { for (const listener of storageListeners) listener({blockCopyEnabled: {newValue}}, area); },
    invalidate: () => { chrome.runtime.id = null; intervals[0](); },
    scans: () => scans,
    clipboardWrites: () => clipboardWrites
  };
}

test('已关闭图块复制时不识别图块或显示按钮，开启后可恢复悬停入口', async () => {
  const page = setup({value: false});
  await flush();
  page.hover();
  assert.equal(page.host.hidden, true);
  assert.equal(page.scans(), 0);
  page.change(true);
  page.hover();
  assert.equal(page.host.hidden, false);
  assert.equal(page.scans(), 1);
});

test('关闭开关会立即隐藏现有按钮，旧的点击不会触发复制', async () => {
  const page = setup();
  await flush();
  page.hover();
  assert.equal(page.host.hidden, false);
  page.change(false);
  assert.equal(page.host.hidden, true);
  await page.copy.listeners.click();
  assert.equal(page.clipboardWrites(), 0);
});

test('读取设置之前不闪现按钮，读取结果不覆盖更新的开关状态', async () => {
  for (const enabled of [true, false]) {
    let complete;
    const read = new Promise(resolve => { complete = resolve; });
    const page = setup({get: () => read});
    page.hover();
    assert.equal(page.host.hidden, true);
    page.change(enabled);
    complete({blockCopyEnabled: !enabled});
    await flush();
    page.hover();
    assert.equal(page.host.hidden, !enabled);
  }
});

test('忽略其他存储区域；删除设置后恢复默认开启', async () => {
  const page = setup({value: false});
  await flush();
  page.change(true, 'sync');
  page.hover();
  assert.equal(page.host.hidden, true);
  page.change(undefined);
  page.hover();
  assert.equal(page.host.hidden, false);
});

test('读取设置失败时保持关闭，无存储 API 的独立页面保持原有行为', async () => {
  const failed = setup({get: async () => { throw new Error('Storage unavailable'); }});
  await flush();
  failed.hover();
  assert.equal(failed.host.hidden, true);
  const standalone = setup({storageAvailable: false});
  standalone.hover();
  assert.equal(standalone.host.hidden, false);
});

test('扩展上下文失效时清理设置监听和复制入口', async () => {
  const page = setup();
  await flush();
  page.hover();
  assert.equal(page.storageListeners.size, 1);
  page.invalidate();
  assert.equal(page.storageListeners.size, 0);
  assert.equal(page.host.isConnected, false);
});
