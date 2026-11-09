(() => {
  'use strict';
  const {adapter, mindMapModel: model} = globalThis.DualNav;
  const {card} = model;
  const composerSelector = 'form[data-chatgpt-composer]';
  const editorSelector = '[data-composer-markdown], #prompt-textarea, textarea, [contenteditable="true"]';
  const removeQuote = /^(移除第\s*\d+\s*个所选文本附件|Remove (?:the )?(?:\d+(?:st|nd|rd|th) )?selected text attachment(?: \d+)?)$/i;
  const tidy = text => (text || '').replace(/\s+/g, ' ').trim();
  const textLabel = (node) => node?.turn
    ? '第 ' + node.turn.ordinal + ' 轮 · ' + (node.turn.user?.text || node.turn.assistant?.text || '对话').slice(0, 72)
    : '历史轮次待加载 · ' + (node?.id || '').slice(-8);

  function quoteAttachments(container) {
    return Array.from(container.querySelectorAll('button[aria-label]'))
      .filter(button => removeQuote.test(button.getAttribute('aria-label')));
  }

  function quoteButton(target) {
    const button = target.closest?.('button');
    return button && /^(向 ChatGPT 提问|询问 ChatGPT|Ask ChatGPT)$/i.test(tidy(button.getAttribute('aria-label') || button.textContent));
  }

  function createMindMap({shadow, signal, getTurns, getActive, getSnapshot, navigate, hasStorage, notify}) {
    const surface = document.createElement('div');
    surface.innerHTML = [
      '<style>',
      '.mm-tools{position:fixed;z-index:1;display:flex;align-items:center;gap:4px;max-width:calc(100vw - 24px);pointer-events:auto}',
      '.mm-tools button,.mm-dialog button{border:1px solid var(--dn-line);background:var(--dn-bg);color:var(--dn-strong);border-radius:8px;padding:5px 8px}',
      '.mm-tools button:hover,.mm-dialog button:hover{background:var(--dn-hover)}',
      '.mm-tools button:disabled,.mm-dialog button:disabled{opacity:.5;cursor:default}',
      '.mm-branch{display:flex;align-items:center;gap:4px;max-width:min(390px,60vw);padding:3px 4px 3px 8px;border:1px solid var(--dn-line);border-radius:8px;background:var(--dn-bg)}',
      '.mm-branch span{white-space:nowrap;text-overflow:ellipsis;overflow:hidden;color:var(--dn-strong)}',
      '.mm-draft{position:fixed;z-index:2;bottom:75px;left:12px;pointer-events:auto;width:min(380px,calc(100vw - 24px));padding:10px;background:var(--dn-bg);color:var(--dn-strong);border:1px solid var(--dn-line);border-radius:10px}',
      '.mm-draft textarea{width:100%;min-height:80px;resize:vertical;background:var(--dn-bg);color:var(--dn-strong);font:inherit;border:1px solid var(--dn-line);border-radius:5px}',
      '.mm-draft button{margin:6px 10px 0 0;color:var(--dn-strong);text-decoration:underline}',
      '.mm-dialog{pointer-events:auto;box-sizing:border-box;padding:0;border:1px solid var(--dn-line);border-radius:14px;background:var(--dn-bg);color:var(--dn-strong);width:min(1120px,calc(100vw - 24px));height:min(780px,calc(100vh - 24px));max-width:none;max-height:none;overflow:hidden}',
      '.mm-dialog[open]{display:flex;flex-direction:column}.mm-dialog::backdrop{background:#0007}',
      '.mm-bar,.mm-actions{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:9px 12px;border-bottom:1px solid var(--dn-line)}',
      '.mm-bar strong,.mm-actions strong{flex:1;min-width:8ch}.mm-actions{border-top:1px solid var(--dn-line);border-bottom:0}',
      '.mm-actions select{max-width:min(320px,62vw);background:var(--dn-bg);color:var(--dn-strong);border:1px solid var(--dn-line);border-radius:6px;padding:4px;font:inherit}',
      '.mm-viewport{position:relative;flex:1;overflow:hidden;cursor:grab;touch-action:none;outline-offset:-3px;background:radial-gradient(var(--dn-line) 1px,transparent 1px) 0 0 / 18px 18px}',
      '.mm-viewport.dragging{cursor:grabbing}.mm-board{position:absolute;transform-origin:0 0;user-select:none}',
      '.mm-board svg{position:absolute;inset:0;overflow:visible;pointer-events:none}.mm-board path{fill:none;stroke:var(--dn-line);stroke-width:2}',
      '.mm-board path.mm-path{stroke:var(--dn-bookmark);stroke-width:3}',
      '.mm-card{position:absolute;display:flex;gap:3px;padding:5px;border:1px solid var(--dn-line);border-radius:11px;background:var(--dn-bg);box-shadow:0 2px 6px #0001}',
      '.mm-card.mm-path{border-color:var(--dn-bookmark)}.mm-card.mm-current{outline:2px solid var(--dn-bookmark);outline-offset:2px}',
      '.mm-card .mm-node{min-width:0;flex:1;text-align:left;overflow:hidden;border:0;padding:3px 5px;overflow-wrap:anywhere}',
      '.mm-node span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}',
      '.mm-card .mm-mini{align-self:flex-start;padding:2px 4px;border:0}.mm-card.mm-placeholder{border-style:dashed}',
      '</style>',
      '<div class="mm-tools" hidden><button class="mm-open" type="button" aria-haspopup="dialog">思维导图</button>',
      '<button class="mm-quote" type="button" hidden>引用追问</button><div class="mm-branch" hidden><span></span><button class="mm-mainline" type="button">回到主线</button></div></div>',
      '<div class="mm-draft" hidden><label>复制下方草稿到原输入框，再写下你的问题<textarea readonly></textarea></label>',
      '<button class="mm-copy" type="button">复制续问草稿</button><button class="mm-cancel-quote" type="button">取消引用</button></div>',
      '<dialog class="mm-dialog" aria-label="思维导图"><header class="mm-bar"><strong>思维导图</strong>',
      '<button class="mm-out" type="button" aria-label="缩小">−</button><button class="mm-in" type="button" aria-label="放大">＋</button>',
      '<button class="mm-fit" type="button">适应全图</button><button class="mm-center" type="button">回到当前轮次</button>',
      '<button class="mm-close" type="button" autofocus>关闭</button></header>',
      '<div class="mm-viewport" tabindex="0" aria-label="对话画布，方向键平移"><div class="mm-board"></div></div>',
      '<footer class="mm-actions" hidden><strong></strong><button class="mm-continue" type="button">从这里续问</button>',
      '<label>移动到… <select class="mm-destination"></select></label><button class="mm-move" type="button">移动</button></footer></dialog>'
    ].join('');
    shadow.append(surface);
    const $ = selector => surface.querySelector(selector);
    const tools = $('.mm-tools'), opener = $('.mm-open'), quote = $('.mm-quote'), branch = $('.mm-branch');
    const dialog = $('.mm-dialog'), viewport = $('.mm-viewport'), board = $('.mm-board');
    const actions = $('.mm-actions'), destination = $('.mm-destination');
    const draft = $('.mm-draft'), draftText = draft.querySelector('textarea');
    const requestedRoute = location.hash === model.openHash ? adapter.getKey() : null;
    let route = null, loadVersion = 0, ready = false, edges = new Map(), collapsed = new Set();
    let selection = null, pressedQuote = null, native = null, explicit = null, send = null;
    let branchTail = null, editing = null, layout, signature, drag, requestOpen = requestedRoute;
    let x = 0, y = 0, scale = 1;

    function validRoute() {
      const key = adapter.getKey();
      return model.savedPath(key) && new URLSearchParams(location.search).get('temporary-chat') !== 'true' ? key : null;
    }

    async function loadEdges() {
      if (!route || !hasStorage()) return;
      const key = route, version = ++loadVersion;
      try {
        const items = await chrome.storage.local.get(null);
        if (signal.aborted || version !== loadVersion || key !== validRoute()) return;
        edges = model.readEdges(items, key);
        const centerOnLoad = !ready && dialog.open;
        ready = true;
        if (centerOnLoad) expandCurrentPath();
        render();
        if (centerOnLoad) center();
      } catch {
        if (!signal.aborted && version === loadVersion && key === validRoute()) notify('无法读取本地导图');
      }
    }

    async function saveEdge(child, parent, kind) {
      const key = route;
      if (!key || !hasStorage() || key !== validRoute()) return false;
      const write = async () => {
        const items = await chrome.storage.local.get(null);
        if (signal.aborted || key !== route || key !== validRoute()) return false;
        const current = model.readEdges(items, key);
        const id = model.edgeKey(key, child);
        if (kind === 'followup' && current.has(id)) return false;
        const parents = new Map(Array.from(current.values(), edge => [edge.child, edge.parent]));
        if (!model.canMove(parents, child, parent)) return false;
        await chrome.storage.local.set({[id]: {parent, kind, updatedAt: Date.now()}});
        return true;
      };
      try {
        const saved = navigator.locks
          ? await navigator.locks.request(model.prefix + key, write)
          : await write();
        if (saved && route === key) await loadEdges();
        return saved;
      } catch {
        if (!signal.aborted && route === key) notify('无法保存导图关系');
        return false;
      }
    }

    function readSelection() {
      if (!route || route !== validRoute()) return null;
      const selected = document.getSelection();
      if (!selected || selected.isCollapsed || selected.rangeCount !== 1) return null;
      const range = selected.getRangeAt(0);
      const text = selected.toString().trim();
      if (!text) return null;
      const turn = getTurns().find(({user, assistant}) => user?.stableId && assistant?.body?.isConnected &&
        assistant.body.contains(range.startContainer) && assistant.body.contains(range.endContainer));
      return turn && {id: turn.id, text};
    }

    function status() {
      quote.hidden = !selection || opener.hidden;
      branch.hidden = !branchTail && !explicit;
      if (explicit) branch.querySelector('span').textContent = '待发送引用';
      else if (branchTail) {
        const turn = getTurns().find(turn => turn.id === branchTail);
        branch.querySelector('span').textContent = '当前分支 · ' + textLabel({turn, id: branchTail});
      }
      draft.hidden = !explicit || dialog.open;
    }

    function cancelExplicit() {
      if (send?.source === 'explicit') send = null;
      explicit = null;
      draftText.value = '';
      status();
    }

    function mainline() {
      branchTail = null;
      native = send = null;
      cancelExplicit();
    }

    function confirmSend() {
      if (!send) return;
      if (send.route !== route || Date.now() - send.at > 15000) {send = null; return;}
      const next = model.appendedTurn(getTurns(), send);
      if (!next) return;
      const {parent} = send;
      send = native = null;
      branchTail = next.id;
      cancelExplicit();
      void saveEdge(next.id, parent, 'followup');
    }

    function noteSend(event) {
      if (event.type === 'keydown' && (event.key !== 'Enter' || event.shiftKey || event.ctrlKey ||
          event.altKey || event.metaKey || event.isComposing)) return;
      if (!route || route !== validRoute() || getSnapshot()?.key !== route || !getSnapshot().main?.isConnected) return;
      const form = event.target.closest?.(composerSelector);
      if (!form || form.closest(adapter.selectors.turn + ',' + adapter.selectors.message)) return;
      const editor = form.querySelector(editorSelector);
      if (!editor) return;
      if (event.type === 'keydown' && !editor.contains(event.target)) return;
      if (event.type === 'click' && !event.target.closest('button[type="submit"]:enabled')) return;
      if (event.type === 'submit' && send && Date.now() - send.at < 250) return;
      const value = tidy(editor.value ?? editor.innerText ?? editor.textContent);
      const attachments = quoteAttachments(form);
      const attachment = attachments[0];
      const verifiedNative = native && attachments.length === 1 && !native.before.has(attachment) &&
        Array.from(attachment.parentElement.querySelectorAll('span')).some(span => tidy(span.textContent) === tidy(native.text));
      const verifiedExplicit = explicit && value.startsWith(tidy(explicit.draft));
      const parent = verifiedNative ? native.id : verifiedExplicit ? explicit.id : branchTail;
      send = null;
      if (!parent || (!value && !verifiedNative) || !getTurns().some(turn => turn.id === parent && turn.user?.stableId)) return;
      const users = getTurns().map(turn => turn.user).filter(Boolean);
      if (!users.length) return;
      const mounted = adapter.scan().messages.filter(message => message.role === 'user');
      const baseline = users.concat(mounted);
      send = {route, parent, at: Date.now(), tail: users.at(-1).id, text: value,
        source: verifiedNative ? 'native' : verifiedExplicit ? 'explicit' : 'branch',
        ids: new Set(baseline.map(message => message.id)),
        slots: new Set(baseline.map(message => message.slotId).filter(Boolean))};
    }

    function refresh() {
      const key = validRoute();
      if (key !== route) {
        route = key;
        loadVersion++;
        ready = false;
        edges = new Map();
        collapsed = new Set();
        selection = pressedQuote = null;
        mainline();
        close(false);
        if (key) void loadEdges();
        if (requestOpen && requestOpen !== key) requestOpen = null;
      }
      confirmSend();
      status();
      render();
    }

    function position(left, rail, enabled) {
      const available = route && getSnapshot()?.main?.isConnected && getTurns().length;
      opener.hidden = !enabled;
      tools.hidden = !available || (!enabled && !branchTail && !explicit);
      quote.hidden = !selection || !enabled;
      tools.style.left = Math.max(12, left) + 'px';
      tools.style.top = rail && !rail.hidden ? Math.max(72, rail.getBoundingClientRect().top - 38) + 'px' : '76px';
      if (requestOpen && requestOpen === route && available) {
        requestOpen = null;
        if (location.hash === model.openHash) {
          history.replaceState(history.state, '', location.pathname + location.search);
        }
        open();
      }
    }

    function applyView() {
      board.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
    }

    function fitScale() {
      return Math.min(1, viewport.clientWidth / layout.width, viewport.clientHeight / layout.height);
    }

    function zoom(factor, cx = viewport.clientWidth / 2, cy = viewport.clientHeight / 2) {
      const next = Math.max(Math.min(.15, fitScale()), Math.min(2.5, scale * factor));
      x = cx - (cx - x) * next / scale;
      y = cy - (cy - y) * next / scale;
      scale = next;
      applyView();
    }

    function fit() {
      scale = fitScale();
      x = (viewport.clientWidth - layout.width * scale) / 2;
      y = (viewport.clientHeight - layout.height * scale) / 2;
      applyView();
    }

    function center() {
      const id = getActive()?.id;
      const item = layout.visible.find(item => item.node.id === id) || layout.visible[1] || layout.visible[0];
      scale = 1;
      x = (viewport.clientWidth - card.width) / 2 - item.x;
      y = (viewport.clientHeight - card.height) / 2 - item.y;
      applyView();
    }

    function expandCurrentPath() {
      const graph = model.makeGraph(getTurns(), edges);
      for (let id = getActive()?.id; id != null; id = graph.parents.get(id)) collapsed.delete(id);
    }

    function open() {
      if (dialog.open || !route || route !== validRoute()) return;
      editing = null;
      signature = null;
      expandCurrentPath();
      dialog.showModal();
      status();
      render();
      center();
    }

    function close(restoreFocus = true) {
      if (!dialog.open) return;
      dialog.close();
      drag = null;
      viewport.classList.remove('dragging');
      status();
      if (restoreFocus && !tools.hidden) opener.focus({preventScroll: true});
    }

    function uiButton(label, className, onClick) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.setAttribute('aria-label', label);
      button.addEventListener('click', onClick);
      return button;
    }

    function render() {
      if (!dialog.open) return;
      const turns = getTurns();
      const active = getActive()?.id;
      const nextSignature = JSON.stringify([turns.map(turn => [turn.id, turn.user?.text.slice(0, 72), turn.assistant?.text.slice(0, 72), !!turn.user?.stableId]),
        Array.from(edges.values(), edge => [edge.child, edge.parent]), [...collapsed], active, ready, editing]);
      if (nextSignature === signature) return;
      signature = nextSignature;
      const graph = model.makeGraph(turns, edges);
      const path = new Set([null]);
      for (let id = active; id != null; id = graph.parents.get(id)) path.add(id);
      layout = model.layout(graph.root, collapsed);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', layout.width);
      svg.setAttribute('height', layout.height);
      svg.setAttribute('aria-hidden', 'true');
      const fragment = document.createDocumentFragment();
      fragment.append(svg);
      const focused = shadow.activeElement?.closest('.mm-card');
      const focusedId = focused?.dataset.turnId, focusedClass = shadow.activeElement?.className;
      let focusTarget;
      for (const {node, x: left, y: top, parent} of layout.visible) {
        if (parent) {
          const edge = document.createElementNS(svg.namespaceURI, 'path');
          const from = parent.x + card.width, mid = (from + left) / 2;
          const start = parent.y + card.height / 2, end = top + card.height / 2;
          edge.setAttribute('d', ['M', from, start, 'C', mid, start, mid, end, left, end].join(' '));
          if (path.has(node.id)) edge.setAttribute('class', 'mm-path');
          svg.append(edge);
        }
        const element = document.createElement('div');
        element.className = 'mm-card';
        element.dataset.turnId = node.id ?? '';
        element.style.cssText = 'left:' + left + 'px;top:' + top + 'px;width:' + card.width + 'px;height:' + card.height + 'px';
        element.classList.toggle('mm-path', path.has(node.id));
        element.classList.toggle('mm-current', node.id === active);
        element.classList.toggle('mm-placeholder', !!node.id && !node.turn);
        const label = node.id === null ? '主线' : textLabel(node);
        const link = uiButton(label, 'mm-node', () => {
          if (!node.turn) return;
          close();
          navigate(node.id);
        });
        link.disabled = !node.turn;
        const caption = document.createElement('span');
        caption.textContent = label;
        link.append(caption);
        element.append(link);
        if (node.id !== null && node.children.length) {
          const fold = uiButton(collapsed.has(node.id) ? '展开分支' : '折叠分支', 'mm-mini mm-fold', () => {
            if (!collapsed.delete(node.id)) collapsed.add(node.id);
            render();
          });
          fold.textContent = collapsed.has(node.id) ? '+' : '−';
          fold.setAttribute('aria-expanded', String(!collapsed.has(node.id)));
          element.append(fold);
        }
        if (node.turn?.user?.stableId) {
          const menu = uiButton('轮次操作', 'mm-mini mm-menu', () => {
            editing = editing === node.id ? null : node.id;
            render();
            if (editing) $('.mm-continue').focus();
          });
          menu.textContent = '⋯';
          menu.setAttribute('aria-expanded', String(editing === node.id));
          element.append(menu);
        }
        if (focusedId === element.dataset.turnId) focusTarget = Array.from(element.children).find(child => child.className === focusedClass);
        fragment.append(element);
      }
      board.replaceChildren(fragment);
      focusTarget?.focus({preventScroll: true});
      const editingNode = graph.nodes.get(editing);
      actions.hidden = !editingNode;
      if (editingNode) {
        actions.querySelector('strong').textContent = textLabel(editingNode);
        const previous = destination.value;
        destination.replaceChildren(new Option('主线', ''));
        for (const turn of turns) {
          if (turn.user?.stableId && model.canMove(graph.parents, editing, turn.id)) {
            destination.add(new Option(textLabel(graph.nodes.get(turn.id)), turn.id));
          }
        }
        destination.value = Array.from(destination.options).some(option => option.value === previous) ? previous : '';
        $('.mm-move').disabled = !ready;
      }
    }

    opener.addEventListener('click', open);
    $('.mm-close').addEventListener('click', () => close());
    $('.mm-fit').addEventListener('click', fit);
    $('.mm-center').addEventListener('click', () => {
      expandCurrentPath();
      render();
      center();
    });
    $('.mm-in').addEventListener('click', () => zoom(1.2));
    $('.mm-out').addEventListener('click', () => zoom(1 / 1.2));
    dialog.addEventListener('cancel', event => {event.preventDefault(); close();});
    $('.mm-mainline').addEventListener('click', mainline);
    $('.mm-continue').addEventListener('click', () => {
      if (!editing) return;
      mainline();
      branchTail = editing;
      close(false);
      status();
      tools.hidden = false;
      Array.from(document.querySelectorAll(composerSelector)).find(form => form.getClientRects().length)
        ?.querySelector(editorSelector)?.focus();
    });
    $('.mm-move').addEventListener('click', async () => {
      const child = editing, parent = destination.value || null;
      if (!child) return;
      if (await saveEdge(child, parent, 'manual') && editing === child) {
        editing = null;
        render();
        Array.from(board.querySelectorAll('.mm-card')).find(element => element.dataset.turnId === child)?.querySelector('.mm-menu')?.focus();
      }
    });
    quote.addEventListener('pointerdown', event => event.preventDefault());
    quote.addEventListener('click', () => {
      if (!selection) return;
      const {id, text} = selection;
      explicit = {id, draft: '接着这段回答追问：\n「' + text + '」\n\n'};
      native = null;
      draftText.value = explicit.draft;
      status();
      draftText.focus();
      draftText.select();
    });
    $('.mm-cancel-quote').addEventListener('click', cancelExplicit);
    $('.mm-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(draftText.value);
        notify('已复制续问草稿');
      } catch {
        draftText.focus();
        draftText.select();
        notify('请手动复制选中的草稿');
      }
    });
    viewport.addEventListener('wheel', event => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX - rect.left, event.clientY - rect.top);
    }, {passive: false});
    viewport.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !event.isPrimary || event.target.closest('.mm-card')) return;
      drag = {x: event.clientX - x, y: event.clientY - y};
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('dragging');
    });
    viewport.addEventListener('pointermove', event => {
      if (!drag || !event.isPrimary) return;
      x = event.clientX - drag.x;
      y = event.clientY - drag.y;
      applyView();
    });
    viewport.addEventListener('lostpointercapture', () => {drag = null; viewport.classList.remove('dragging');});
    viewport.addEventListener('keydown', event => {
      if (event.target !== viewport || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      x += {ArrowLeft: 40, ArrowRight: -40}[event.key] || 0;
      y += {ArrowUp: 40, ArrowDown: -40}[event.key] || 0;
      applyView();
    });
    document.addEventListener('selectionchange', () => {
      selection = readSelection() || (shadow.activeElement === quote ? selection : null);
      status();
    }, {signal});
    document.addEventListener('pointerdown', event => {
      pressedQuote = quoteButton(event.target) ? readSelection() : null;
    }, {capture: true, signal});
    document.addEventListener('click', event => {
      if (quoteButton(event.target)) {
        const source = readSelection() || pressedQuote;
        native = null;
        if (source) {
          cancelExplicit();
          native = {...source, before: new Set(quoteAttachments(document))};
        }
      } else if (removeQuote.test(event.target.closest?.('button')?.getAttribute('aria-label') || '')) {
        native = null;
        if (send?.source === 'native') send = null;
      }
      pressedQuote = null;
      noteSend(event);
    }, {capture: true, signal});
    document.addEventListener('keydown', noteSend, {capture: true, signal});
    document.addEventListener('submit', noteSend, {capture: true, signal});

    return {refresh, position, isOpen: () => dialog.open, storageChanged(changes) {
      if (route && Object.keys(changes).some(key => key.startsWith(model.edgeKey(route, '')))) void loadEdges();
    }};
  }

  globalThis.DualNav.createMindMap = createMindMap;
})();
