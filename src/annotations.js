(() => {
  'use strict';
  const {adapter, notebookModel: model, mindMapModel: {appendedTurn}} = globalThis.DualNav;
  const formSelector = 'form[data-chatgpt-composer], form:has(#prompt-textarea)';
  const editorSelector = '[data-composer-markdown], #prompt-textarea, textarea, [contenteditable="true"]';
  const editorText = editor => editor.value ?? editor.innerText ?? editor.textContent;

  function createAnnotations({shadow, signal, getSnapshot, getTurns, navigate, notify, hasStorage}) {
    if (!hasStorage()) return;
    const surface = document.createElement('div');
    surface.innerHTML = [
      '<style>',
      '.dn-annotation{position:fixed;z-index:5;pointer-events:auto;background:var(--dn-bg);color:var(--dn-strong);border:1px solid var(--dn-line);border-radius:12px;box-shadow:var(--dn-shadow);font-size:13px}',
      '.dn-annotation button{padding:5px 9px;border-radius:7px;white-space:nowrap}.dn-annotation button:hover{background:var(--dn-hover)}',
      '.dn-annotation button:disabled{opacity:.55;cursor:wait}',
      '.dn-annotate{z-index:6;display:flex;align-items:center;gap:4px;width:min(348px,calc(100vw - 20px));padding:5px 7px}',
      '.dn-annotate textarea{resize:none;flex:1;min-width:0;padding:5px 4px;background:transparent;border:0;color:inherit;font:inherit}',
      '.dn-annotation-chip{padding:1px 3px}.dn-annotation-list{width:min(400px,calc(100vw - 20px));overflow:auto;overscroll-behavior:contain;padding:10px 12px}',
      '.dn-annotation-list header,.dn-annotation-row nav,.dn-annotation-list footer{display:flex;gap:4px;align-items:center}',
      '.dn-annotation-list header{justify-content:space-between}.dn-annotation-list footer{margin-top:8px;justify-content:flex-end}',
      '.dn-annotation-row{padding:8px 0;border-top:1px solid var(--dn-line)}',
      '.dn-annotation-row p{margin:3px 0;white-space:pre-wrap;overflow-wrap:anywhere;max-height:9em;overflow:auto}',
      '.dn-annotation-source{color:var(--dn-text)}.dn-annotation-list .dn-annotation-insert{border:1px solid var(--dn-line);background:var(--dn-hover)}',
      '</style>',
      '<form class="dn-annotation dn-annotate" hidden><textarea rows="1" maxlength="4000" aria-label="想追问的问题" placeholder="写下想追问的问题…"></textarea>',
      '<button type="submit" aria-label="保存注释">✓</button><button type="button" class="dn-annotate-cancel" aria-label="关闭注释">×</button></form>',
      '<div class="dn-annotation dn-annotation-chip" hidden><button type="button" aria-expanded="false" aria-controls="dn-annotation-list"></button></div>',
      '<section id="dn-annotation-list" class="dn-annotation dn-annotation-list" aria-label="待发送注释" hidden><header><strong>待发送注释</strong>',
      '<button class="dn-annotation-close" type="button">收起</button></header><div class="dn-annotation-items"></div>',
      '<footer><button class="dn-annotation-copy" type="button">复制组合</button><button class="dn-annotation-insert" type="button">合并到输入框</button></footer></section>'
    ].join('');
    shadow.append(surface);
    const $ = selector => surface.querySelector(selector);
    const editor = $('.dn-annotate'), field = editor.querySelector('textarea'), confirm = editor.querySelector('[type="submit"]');
    const dock = $('.dn-annotation-chip'), chip = dock.querySelector('button'), panel = $('.dn-annotation-list');
    const list = $('.dn-annotation-items');
    let route = null, queue = [], selection = null, editing = null, pending = null, version = 0, selectionFrame = 0;

    function currentRoute() {
      const key = adapter.getKey(), snapshot = getSnapshot();
      return snapshot?.key === key && snapshot.main?.isConnected && model.validRoute(key, location.search) ? key : null;
    }

    function composer() {
      return Array.from(document.querySelectorAll(formSelector)).find(form =>
        form.getClientRects().length && !form.closest(adapter.selectors.turn + ',' + adapter.selectors.message) &&
        form.querySelector(editorSelector));
    }

    function position() {
      const form = queue.length && route && composer();
      dock.hidden = !form;
      if (!form) {closeList(); return;}
      const rect = form.getBoundingClientRect();
      const top = Math.max(8, rect.top - 35);
      dock.style.right = Math.max(10, innerWidth - rect.right) + 'px';
      dock.style.top = top + 'px';
      panel.style.right = dock.style.right;
      panel.style.bottom = Math.max(10, innerHeight - top + 7) + 'px';
      panel.style.maxHeight = Math.max(0, top - 17) + 'px';
    }

    function closeList() {
      panel.hidden = true;
      chip.setAttribute('aria-expanded', 'false');
    }

    function closeEditor() {
      selection = editing = null;
      field.value = '';
      editor.hidden = true;
    }

    function showEditor(rect, question = '') {
      editor.hidden = false;
      editor.style.left = Math.max(10, Math.min(rect.left, innerWidth - editor.offsetWidth - 10)) + 'px';
      editor.style.top = Math.max(8, Math.min(rect.bottom + 7, innerHeight - editor.offsetHeight - 10)) + 'px';
      field.value = question;
    }

    function inspectSelection() {
      selectionFrame = 0;
      if (!route || editing || shadow.activeElement && editor.contains(shadow.activeElement)) return;
      const selected = document.getSelection();
      if (!selected || selected.isCollapsed || selected.rangeCount !== 1) {closeEditor(); return;}
      const range = selected.getRangeAt(0), quote = selected.toString().trim();
      if (!quote) {closeEditor(); return;}
      const source = getTurns().find(turn => turn.user?.stableId && [turn.user, turn.assistant].some(message =>
        message?.body?.isConnected && message.body.contains(range.startContainer) && message.body.contains(range.endContainer)));
      if (!source) {closeEditor(); return;}
      selection = {turnId: source.id, ordinal: source.ordinal, quote};
      showEditor(range.getBoundingClientRect(), field.value);
    }

    function labelButton(label, action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', action);
      return button;
    }

    function renderQueue() {
      chip.textContent = queue.length + ' 条注释';
      list.replaceChildren(...queue.map(item => {
        const row = document.createElement('article');
        row.className = 'dn-annotation-row';
        const nav = document.createElement('nav');
        const source = labelButton('第 ' + item.ordinal + ' 轮 · 查看出处', () => {
          closeList();
          if (getTurns().some(turn => turn.id === item.turnId)) void navigate(item.turnId);
          else notify('向上浏览以加载出处');
        });
        source.className = 'dn-annotation-source';
        nav.append(source, labelButton('编辑', event => {
          editing = item;
          showEditor(event.currentTarget.getBoundingClientRect(), item.question);
          field.focus();
        }), labelButton('删除', () => void update(items => items.filter(current => current.id !== item.id))));
        const quote = document.createElement('p');
        quote.textContent = item.quote;
        row.append(nav, quote);
        if (item.question) {
          const question = document.createElement('p');
          question.textContent = '问题：' + item.question;
          row.append(question);
        }
        return row;
      }));
      position();
    }

    async function load() {
      if (!route) return;
      const key = model.annotationKey(route), loading = ++version;
      try {
        const data = await chrome.storage.local.get(key);
        if (signal.aborted || loading !== version) return;
        queue = data[key] || [];
        renderQueue();
      } catch {if (!signal.aborted) notify('无法读取本地注释');}
    }

    async function update(change, forRoute = route) {
      if (!forRoute) return false;
      const key = model.annotationKey(forRoute);
      const write = async () => {
        const data = await chrome.storage.local.get(key);
        const items = change(data[key] || []);
        if (items.length) await chrome.storage.local.set({[key]: items});
        else await chrome.storage.local.remove(key);
      };
      try {
        if (navigator.locks) await navigator.locks.request(key, write);
        else await write();
        if (forRoute === route) await load();
        return true;
      } catch {
        if (!signal.aborted) notify('注释保存失败，请重试');
        return false;
      }
    }

    async function save(event) {
      event.preventDefault();
      const item = editing || selection;
      if (!item || !route || confirm.disabled) return;
      const key = route;
      const next = {...item, id: item.id || crypto.randomUUID(), question: field.value.trim()};
      confirm.disabled = true;
      const saved = await update(items => item.id
        ? items.map(current => current.id === item.id ? next : current)
        : items.concat(next), key);
      confirm.disabled = false;
      if (saved && route === key && (item === editing || item === selection)) {
        closeEditor();
        closeList();
        document.getSelection()?.removeAllRanges();
      }
    }

    async function copyBlock(text) {
      try {await navigator.clipboard.writeText(text);}
      catch {notify('无法复制，请在列表中手动复制'); return;}
      closeList();
      notify('已复制「出处和问题」，可粘贴到输入框');
    }

    function insertBlock() {
      const input = composer()?.querySelector(editorSelector);
      if (!input) {void copyBlock(model.annotationBlock(queue)); return;}
      const original = editorText(input);
      const existing = new Set(model.includedAnnotations(original, queue));
      const block = model.annotationBlock(queue.filter(item => !existing.has(item)));
      closeList();
      input.focus({preventScroll: true});
      if (!block) return;
      if (typeof input.setSelectionRange === 'function') input.setSelectionRange(original.length, original.length);
      else {
        const range = document.createRange(), selected = document.getSelection();
        range.selectNodeContents(input);
        range.collapse(false);
        selected.removeAllRanges();
        selected.addRange(range);
      }
      const inserted = document.execCommand('insertText', false, (original.trim() ? '\n\n' : '') + block);
      if (!inserted || model.includedAnnotations(editorText(input), queue).length !== queue.length) {
        const missing = new Set(model.includedAnnotations(editorText(input), queue));
        const remaining = model.annotationBlock(queue.filter(item => !missing.has(item)));
        if (remaining) void copyBlock(remaining);
      }
    }

    function captureSend(event) {
      if (!queue.length || !route || route !== currentRoute()) return;
      if (event.type === 'keydown' && (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.isComposing)) return;
      const form = event.target.closest?.(formSelector);
      if (!form || form.closest(adapter.selectors.turn + ',' + adapter.selectors.message)) return;
      const input = form.querySelector(editorSelector);
      if (!input || event.type === 'keydown' && !input.contains(event.target)) return;
      if (event.type === 'click' && !(adapter.isSendButton(event.target) || event.target.closest('button[type="submit"]:enabled'))) return;
      if (event.type === 'submit' && pending && Date.now() - pending.at < 200) return;
      const entries = model.includedAnnotations(editorText(input), queue);
      pending = null;
      if (!entries.length) return;
      const users = getTurns().map(turn => turn.user).filter(Boolean);
      if (!users.length) return;
      const mounted = adapter.scan().messages.filter(message => message.role === 'user');
      const baseline = users.concat(mounted);
      pending = {at: Date.now(), tail: users.at(-1).id, entries,
        ids: new Set(baseline.map(user => user.id)), slots: new Set(baseline.map(user => user.slotId).filter(Boolean))};
    }

    function refresh() {
      const key = currentRoute();
      if (key !== route) {
        route = key;
        version++;
        queue = [];
        pending = null;
        closeEditor();
        closeList();
        renderQueue();
        if (key) void load();
      }
      if (!pending) return;
      if (Date.now() - pending.at > 15000) {pending = null; return;}
      const next = appendedTurn(getTurns(), pending);
      if (!next) return;
      const sent = model.includedAnnotations(next.user.body?.innerText ?? next.user.text, pending.entries);
      if (!sent.length) return;
      pending = null;
      const versions = new Map(sent.map(item => [item.id, model.formatAnnotation(item)]));
      void update(items => items.filter(item => versions.get(item.id) !== model.formatAnnotation(item)), key);
    }

    editor.addEventListener('submit', save);
    $('.dn-annotate-cancel').addEventListener('click', closeEditor);
    chip.addEventListener('click', () => {
      if (!panel.hidden) closeList();
      else {panel.hidden = false; chip.setAttribute('aria-expanded', 'true');}
    });
    $('.dn-annotation-close').addEventListener('click', () => {closeList(); chip.focus();});
    $('.dn-annotation-copy').addEventListener('click', () => void copyBlock(model.annotationBlock(queue)));
    $('.dn-annotation-insert').addEventListener('click', insertBlock);
    surface.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (!editor.hidden) closeEditor();
      else {closeList(); chip.focus();}
    });
    document.addEventListener('selectionchange', () => {
      if (route && !selectionFrame) selectionFrame = requestAnimationFrame(inspectSelection);
    }, {signal});
    document.addEventListener('pointerdown', event => {
      if (event.composedPath().includes(surface)) return;
      closeList();
      closeEditor();
    }, {capture: true, signal});
    for (const event of ['click', 'submit', 'keydown']) document.addEventListener(event, captureSend, {capture: true, signal});
    signal.addEventListener('abort', () => cancelAnimationFrame(selectionFrame), {once: true});

    return {refresh, position, ownsFocus: () => surface.contains(shadow.activeElement), storageChanged(changes) {
      if (route && Object.hasOwn(changes, model.annotationKey(route))) void load();
    }};
  }

  globalThis.DualNav.createAnnotations = createAnnotations;
})();
