const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = require('../src/model.js');

const source = fs.readFileSync(path.join(__dirname, '../src/content.js'), 'utf8');

function setup() {
  class Element {
    constructor(className = '') {
      this.className = className;
      this.children = [];
      this.dataset = {};
      this.attributes = {};
      this.listeners = {};
      this.style = {setProperty() {}};
      this.hidden = true;
      this.isConnected = true;
      this.scrollTop = 0;
      this.clientHeight = 900;
      this.scrollHeight = 2000;
      this.classList = {
        contains: name => this.className.split(' ').includes(name),
        toggle: (name, enabled) => {
          const classes = new Set(this.className.split(' ').filter(Boolean));
          if (enabled) classes.add(name); else classes.delete(name);
          this.className = [...classes].join(' ');
        }
      };
    }
    addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
    removeEventListener() {}
    emit(name) { for (const listener of this.listeners[name] || []) listener({}); }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name]; }
    removeAttribute(name) { delete this.attributes[name]; }
    append(child) { this.children.push(child); child.parentElement = this; child.isConnected = true; }
    insertBefore(child, before) {
      if (child.parentElement) child.remove();
      const index = before ? this.children.indexOf(before) : this.children.length;
      this.children.splice(index, 0, child);
      child.parentElement = this;
      child.isConnected = true;
    }
    remove() {
      if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
      this.parentElement = null;
      this.isConnected = false;
    }
    replaceChildren() { for (const child of [...this.children]) child.remove(); }
    contains(element) { return element === this || this.children.some(child => child.contains(element)); }
    matches(selector) { return selector.startsWith('.') && this.classList.contains(selector.slice(1)); }
    querySelectorAll(selector) {
      return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() { return {left: 0, right: 1600, top: 0, bottom: 900, width: 1600, height: 900}; }
    focus() {}
  }

  const controls = new Map(['rail', 'toc', 'tree', 'preview', 'open', 'bookmark-toggle', 'fold-all', 'collapse', 'status'].map(name => [`.${name}`, new Element(name)]));
  const host = new Element();
  host.attachShadow = () => ({querySelector: selector => controls.get(selector), activeElement: null});
  const main = new Element();
  const documentElement = new Element();
  const document = new Element();
  Object.assign(document, {
    hidden: false, documentElement, scrollingElement: new Element(),
    getElementById: () => null,
    createElement: tag => tag === 'canvas' ? {getContext: () => null} : tag === 'div' && !host.id ? host : new Element(),
    querySelectorAll: () => []
  });
  const window = new Element();
  let route = '/c/a', current, scans = 0, nextTimer = 0, nextFrame = 0;
  const timers = new Map(), frames = new Map(), intervals = [], observers = [];
  const motionPreference = {matches: true, addEventListener() {}};
  const scrollCalls = [];
  document.scrollingElement.scrollTo = options => scrollCalls.push(options);
  const messages = ['u1', 'a1', 'u2', 'a2'].map((id, index) => ({
    id, role: index % 2 ? 'assistant' : 'user', text: id,
    element: new Element(),
    headings: index % 2 ? [{id: `${id}:h`, level: 2, text: `${id}目录`, element: new Element()}] : []
  }));
  const liveSnapshot = key => ({key, main, messages, scrollRoot: document.scrollingElement, streaming: false, routeConfirmed: true});
  current = liveSnapshot(route);
  const adapter = {
    getKey: () => route, isDraftKey: () => false,
    scan: () => { scans++; return current; },
    selectors: {main: 'main', sidePanel: 'aside', contentColumn: '.column'},
    getContentRect: () => ({left: 300, right: 1000}),
    getRightPanel: () => null
  };
  vm.runInNewContext(source, {
    document, window, AbortController, console: {info() {}},
    DualNav: {adapter, ...model},
    ResizeObserver: class { observe() {} disconnect() {} },
    MutationObserver: class { constructor(callback) { observers.push(callback); } observe() {} disconnect() {} },
    matchMedia: () => motionPreference,
    getComputedStyle: () => ({}), innerWidth: 1600, innerHeight: 900,
    setInterval: callback => { intervals.push(callback); return intervals.length; }, clearInterval() {},
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; }, clearTimeout: id => timers.delete(id),
    requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id)
  });
  return {
    controls, host, document, window, messages, motionPreference, scrollCalls,
    scans: () => scans,
    poll: () => intervals[0](),
    flush: () => { const pending = [...timers.values()]; timers.clear(); for (const callback of pending) callback(); },
    flushFrames: () => { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(); },
    loseMain: () => { current = {...current, main: null, messages: []}; window.emit('resize'); },
    restoreMain: () => { current = liveSnapshot(route); },
    changeRoute: key => { route = key; current = {...liveSnapshot(key), messages: []}; },
    removeHost: () => { host.remove(); observers[0]([]); }
  };
}

test('后台扫描暂时找不到主体后，切回同一地址恢复小地图及目录', () => {
  const page = setup();
  const rail = page.controls.get('.rail'), toc = page.controls.get('.toc');
  assert.equal(rail.hidden, false);
  assert.equal(toc.hidden, false);
  page.document.hidden = true;
  page.document.emit('visibilitychange');
  page.loseMain(); page.flush();
  assert.equal(rail.hidden, true);
  assert.equal(toc.hidden, true);
  page.restoreMain();
  page.document.hidden = false;
  page.document.emit('visibilitychange'); page.flush();
  assert.equal(rail.hidden, false);
  assert.equal(rail.children.length, 2);
  assert.equal(toc.hidden, false);
  assert.equal(page.controls.get('.tree').querySelector('.heading').textContent, 'a2目录');
});

test('小地图近跳平滑滚动，远跳双向平滑收尾，减少动态效果时直接定位', () => {
  const page = setup();
  const root = page.document.scrollingElement;
  const [first, second] = page.controls.get('.rail').children;
  root.scrollHeight = 7000;
  page.motionPreference.matches = false;
  page.messages[2].element.getBoundingClientRect = () => ({top: 840});
  second.emit('click');
  root.scrollTop = 750;
  page.messages[2].element.getBoundingClientRect = () => ({top: 6600 - root.scrollTop});
  second.emit('click');
  root.scrollTop = 6100;
  page.messages[0].element.getBoundingClientRect = () => ({top: 60 - root.scrollTop});
  first.emit('click');
  root.scrollTop = 0;
  page.motionPreference.matches = true;
  second.emit('click');
  assert.deepEqual(page.scrollCalls.map(({top, behavior}) => [top, behavior]), [
    [750, 'smooth'], [5800, 'instant'], [6100, 'smooth'],
    [300, 'instant'], [0, 'smooth'], [6100, 'instant']
  ]);
});

test('跳转期间的滚动帧不重复更新小地图刻度', () => {
  const page = setup();
  const [first, second] = page.controls.get('.rail').children;
  first.emit('click');
  assert.equal(first.getAttribute('aria-current'), 'step');
  let labelWrites = 0;
  for (const tick of [first, second]) {
    const setAttribute = tick.setAttribute.bind(tick);
    tick.setAttribute = (name, value) => {
      if (name === 'aria-label') labelWrites++;
      setAttribute(name, value);
    };
  }
  page.flushFrames();
  page.document.scrollingElement.emit('scroll');
  page.flushFrames();
  assert.equal(labelWrites, 0);
  page.window.emit('wheel');
  page.document.scrollingElement.emit('scroll');
  page.flushFrames();
  assert.equal(second.getAttribute('aria-current'), 'step');
  assert.equal(labelWrites, 2);
});

test('页面恢复和重新获得焦点会重新同步，保留用户手动收起状态', () => {
  for (const event of ['pageshow', 'focus']) {
    const page = setup();
    page.controls.get('.collapse').emit('click');
    page.loseMain(); page.flush();
    page.restoreMain();
    const scans = page.scans();
    page.window.emit(event); page.flush();
    assert.ok(page.scans() > scans, event);
    assert.equal(page.controls.get('.rail').hidden, false);
    assert.equal(page.controls.get('.toc').hidden, true);
    assert.equal(page.controls.get('.open').hidden, false);
  }
});

test('恢复事件早于会话主体就绪时，同地址轮询可补回同步且后台不反复扫描', () => {
  const page = setup();
  page.loseMain(); page.flush();
  page.document.hidden = true;
  const scans = page.scans();
  page.poll(); page.flush();
  assert.equal(page.scans(), scans);
  page.document.hidden = false;
  page.window.emit('pageshow'); page.flush();
  page.restoreMain();
  page.poll(); page.flush();
  assert.equal(page.controls.get('.rail').hidden, false);
  assert.equal(page.controls.get('.toc').hidden, false);
});

test('恢复时地址已改变，仍清理旧会话内容；宿主被移除后仍能重新挂载', () => {
  const page = setup();
  page.removeHost(); page.flush();
  assert.equal(page.host.isConnected, true);
  page.changeRoute('/c/b');
  page.window.emit('pageshow'); page.flush();
  assert.equal(page.controls.get('.rail').children.length, 0);
  assert.equal(page.controls.get('.tree').children.length, 0);
  assert.equal(page.controls.get('.toc').hidden, true);
});
