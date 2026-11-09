(() => {
  'use strict';
  const {notebookModel: model} = globalThis.DualNav;
  const $ = id => document.getElementById(id);
  const viewport = $('viewport'), plane = $('plane'), recent = $('recent');
  const params = new URLSearchParams(location.search);
  let route = null, board = null, turns = [], clips = [], sourceTab = Number(params.get('tab')) || null;
  let active = null, connectFrom = null, drag = null, draggedMaterial = null, generation = 0;
  let x = 0, y = 0, scale = 1;

  function notify(message) {
    $('status').textContent = message;
    $('status').hidden = false;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => {$('status').hidden = true;}, 3200);
  }

  const label = card => card?.title || turns.find(turn => turn.id === card?.turnId)?.title || '历史轮次 · ' + (card?.id || '').slice(-8);

  async function save(change) {
    if (!route || !board) return false;
    const key = model.notebookKey(route), path = route;
    const write = async () => {
      const items = await chrome.storage.local.get(null);
      const next = model.readBoard(items, path);
      if (change(next) === false) return false;
      next.updatedAt = Date.now();
      await chrome.storage.local.set({[key]:next});
      if (route === path) {board = next; render();}
      return true;
    };
    try {return navigator.locks ? await navigator.locks.request(key, write) : await write();}
    catch {notify('保存失败，请重试'); return false;}
  }

  function applyView() {
    plane.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
    $('zoom-value').textContent = Math.round(scale * 100) + '%';
  }

  function zoom(factor, clientX = viewport.clientWidth / 2, clientY = viewport.clientHeight / 2) {
    const next = Math.max(.08, Math.min(2.5, scale * factor));
    x = clientX - (clientX - x) * next / scale;
    y = clientY - (clientY - y) * next / scale;
    scale = next;
    applyView();
  }

  function point(event) {
    const rect = viewport.getBoundingClientRect();
    return {x:(event.clientX - rect.left - x) / scale, y:(event.clientY - rect.top - y) / scale};
  }

  function center(rect) {
    if (!rect) {x = 0; y = 0; scale = 1;}
    else {
      scale = 1;
      x = (viewport.clientWidth - rect.width) / 2 - rect.x;
      y = (viewport.clientHeight - rect.height) / 2 - rect.y;
    }
    applyView();
  }

  function fit() {
    const layout = model.boardLayout(board);
    const visible = [...layout.groups.values(), ...Array.from(layout.cards.values()).filter(card => !card.hidden)];
    if (!visible.length) {center(); return;}
    const bounds = visible.reduce((bounds, item) => ({
      left: Math.min(bounds.left, item.x), top: Math.min(bounds.top, item.y),
      right: Math.max(bounds.right, item.x + item.width), bottom: Math.max(bounds.bottom, item.y + item.height)
    }), {left:Infinity, top:Infinity, right:-Infinity, bottom:-Infinity});
    const width = bounds.right - bounds.left, height = bounds.bottom - bounds.top;
    scale = Math.min(1, Math.max(.01, (viewport.clientWidth - 40) / width), Math.max(.01, (viewport.clientHeight - 40) / height));
    x = (viewport.clientWidth - width * scale) / 2 - bounds.left * scale;
    y = (viewport.clientHeight - height * scale) / 2 - bounds.top * scale;
    applyView();
  }

  function framePosition(element, rect) {
    element.style.cssText = 'left:' + rect.x + 'px;top:' + rect.y + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px';
  }

  function element(tag, text, className = '') {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    if (tag === 'button') node.type = 'button';
    return node;
  }

  function drawLinks(layout) {
    const rectFor = id => {
      const card = layout.cards.get(id);
      return card?.hidden ? layout.groups.get(card.groupId) : card;
    };
    $('links').replaceChildren(...board.links.flatMap(({from, to}) => {
      const a = rectFor(from), b = rectFor(to);
      if (!a || !b || a === b) return [];
      const right = b.x + b.width / 2 >= a.x + a.width / 2;
      const ax = a.x + (right ? a.width : 0), ay = a.y + a.height / 2;
      const bx = b.x + (right ? 0 : b.width), by = b.y + b.height / 2;
      const mid = (ax + bx) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', ['M', ax, ay, 'C', mid, ay, mid, by, bx, by].join(' '));
      return [path];
    }));
  }

  function render() {
    const enabled = !!board;
    for (const id of ['board-tools', 'sources', 'zoom-tools']) $(id).hidden = !enabled;
    $('empty').hidden = enabled && !!(board.cards.length || board.groups.length);
    $('empty').querySelector('p').textContent = enabled
      ? '从左侧拖入一轮对话或一条摘录，也可以新建笔记。'
      : '从 ChatGPT 标签页打开扩展，或选择一个已保存的笔记本。';
    if (!board) {
      for (const id of ['links', 'groups', 'cards']) $(id).replaceChildren();
      renderDetails();
      return;
    }
    const layout = model.boardLayout(board);
    const startGroup = layout.cards.get(board.start)?.groupId;
    const otherGroups = board.groups.filter(group => group.id !== startGroup);
    $('fold-groups').disabled = !otherGroups.length;
    $('fold-groups').textContent = otherGroups.length && otherGroups.every(group => group.collapsed) ? '展开支线' : '收拢支线';
    drawLinks(layout);
    $('groups').replaceChildren(...Array.from(layout.groups.values(), rect => {
      const group = element('article', '', 'topic');
      group.dataset.group = rect.id;
      group.classList.toggle('selected', active?.id === rect.id);
      const header = element('header');
      const name = element('button', rect.title, 'topic-name');
      const toggle = element('button', rect.collapsed ? '展开' : '收起', 'topic-toggle');
      toggle.setAttribute('aria-expanded', String(!rect.collapsed));
      name.onclick = () => select('group', rect.id);
      toggle.onclick = () => void save(next => {
        const target = next.groups.find(group => group.id === rect.id);
        if (target) target.collapsed = !target.collapsed;
      });
      header.append(name, element('small', String(rect.count)), toggle);
      group.append(header);
      framePosition(group, rect);
      return group;
    }));
    $('cards').replaceChildren(...Array.from(layout.cards.values()).filter(card => !card.hidden).map(card => {
      const node = element('button', '', 'node');
      node.dataset.card = card.id;
      node.classList.toggle('start', board.start === card.id);
      node.setAttribute('aria-pressed', String(active?.id === card.id));
      node.append(element('small', (board.start === card.id ? '起点 · ' : '') +
        (card.ordinal ? '第 ' + card.ordinal + ' 轮' : card.turnId ? '对话轮次' : '笔记')), element('strong', label(card)));
      node.onclick = () => {
        if (!connectFrom || connectFrom === card.id) {select('card', card.id); return;}
        const from = connectFrom;
        connectFrom = null;
        void save(next => {
          if (!next.cards.some(item => item.id === from) ||
              next.links.some(link => link.from === from && link.to === card.id || link.from === card.id && link.to === from)) return false;
          next.links.push({from, to:card.id});
        }).then(saved => {if (saved) notify('已连接卡片');});
      };
      framePosition(node, card);
      return node;
    }));
    renderDetails();
  }

  function select(type, id) {
    active = {type, id};
    render();
    $('title').focus();
  }

  function renderDetails() {
    const item = active && board && (active.type === 'card' ? board.cards : board.groups).find(item => item.id === active.id);
    $('details').hidden = !item;
    if (!item) return;
    const isCard = active.type === 'card';
    $('edit-heading').textContent = isCard ? '卡片' : '主题';
    $('title').value = isCard ? label(item) : item.title;
    $('note').value = item.note || '';
    $('note-label').hidden = $('group-label').hidden = !isCard;
    $('excerpt').textContent = item.quote || '';
    $('excerpt').hidden = !item.quote;
    $('group').replaceChildren(new Option('无主题', ''), ...board.groups.map(group => new Option(group.title, group.id)));
    $('group').value = item.groupId || '';
    $('set-start').hidden = $('connect').hidden = !isCard;
    $('go-to-source').hidden = !item.turnId;
    if (item.turnId) $('go-to-source').href = chatUrl(item.turnId);
    const links = board.links.filter(link => link.from === item.id || link.to === item.id);
    $('unlink-label').hidden = !links.length;
    $('unlink').replaceChildren(...links.map(link => {
      const other = board.cards.find(card => card.id === (link.from === item.id ? link.to : link.from));
      return new Option(label(other), other.id);
    }));
  }

  function groupAt(layout, x, y) {
    return Array.from(layout.groups.values()).reverse().find(group =>
      x >= group.x && x <= group.x + group.width && y >= group.y && y <= group.y + group.height);
  }

  function freePosition(width, height) {
    const left = (viewport.clientWidth / 2 - x) / scale - width / 2;
    const top = (viewport.clientHeight / 2 - y) / scale - height / 2;
    const layout = model.boardLayout(board);
    const occupied = [...layout.groups.values(), ...Array.from(layout.cards.values()).filter(card => !card.hidden)];
    for (let row = 0; ; row++) {
      const candidate = {x:Math.round(left), y:Math.round(top + row * (height + 16))};
      if (!occupied.some(item => candidate.x < item.x + item.width + 12 && candidate.x + width + 12 > item.x &&
          candidate.y < item.y + item.height + 12 && candidate.y + height + 12 > item.y)) return candidate;
    }
  }

  async function addMaterial(item, target) {
    const id = item.id, existing = board.cards.find(card => card.id === id);
    if (existing) {select('card', id); return;}
    const group = target && groupAt(model.boardLayout(board), target.x, target.y);
    const {width, height} = model.cardSize;
    const position = target ? {x:Math.round(target.x - width / 2), y:Math.round(target.y - height / 2)} : freePosition(width, height);
    const saved = await save(next => {
      if (next.cards.some(card => card.id === id)) return false;
      next.cards.push({...item, ...position, groupId:group?.id || null});
      next.start ||= id;
      if (group) {
        const frame = next.groups.find(frame => frame.id === group.id);
        if (frame) frame.collapsed = false;
      }
    });
    if (saved && board?.cards.some(card => card.id === id)) {
      select('card', id);
      if (!target) center(model.boardLayout(board).cards.get(id));
    }
  }

  function renderMaterials() {
    const material = (item, text) => {
      const row = element('li', '', 'material');
      row.draggable = true;
      row.append(element('span', text));
      const add = element('button', '＋');
      add.setAttribute('aria-label', '加入画布');
      add.onclick = () => void addMaterial(item);
      row.append(add);
      row.ondragstart = event => {
        draggedMaterial = item;
        event.dataTransfer.setData('text/plain', text);
        event.dataTransfer.effectAllowed = 'copy';
      };
      row.ondragend = () => {draggedMaterial = null;};
      return row;
    };
    $('turns').replaceChildren(...turns.map(turn => material({
      id:turn.id, turnId:turn.id, ordinal:turn.ordinal, title:turn.title, note:''
    }, turn.ordinal + ' · ' + turn.title)));
    $('clips-title').hidden = !clips.length;
    $('clips').replaceChildren(...clips.map(clip => material({
      id:'clip-' + clip.id, turnId:clip.turnId, ordinal:clip.ordinal,
      title:(clip.question || clip.quote).slice(0, 140), note:clip.question, quote:clip.quote
    }, '第 ' + clip.ordinal + ' 轮 · ' + (clip.question || clip.quote))));
    $('source-hint').textContent = turns.length ? '拖进画布，或点击卡片上的「＋」。' : '打开原会话后可刷新轮次。';
  }

  async function refreshTurns() {
    if (!route || !sourceTab) return;
    const path = route;
    try {
      const source = await chrome.tabs.sendMessage(sourceTab, {type:'dualNavNotebookSource', route:path});
      if (path === route) {turns = source?.turns || []; renderMaterials();}
    } catch {if (path === route) {turns = []; renderMaterials();}}
  }

  function listBoards(items) {
    const options = model.recentBoards(items).map(item => new Option(item.title || '对话 · ' + item.route.slice(-8), item.route));
    if (route && !options.some(option => option.value === route)) options.unshift(new Option('当前会话', route));
    recent.replaceChildren(new Option('选择笔记本', ''), ...options);
    recent.value = route || '';
  }

  async function load(path, initial = false) {
    const loading = ++generation;
    try {
      const items = await chrome.storage.local.get(null);
      if (loading !== generation) return;
      const chosen = model.validRoute(path) ? path : initial ? model.recentBoards(items)[0]?.route : null;
      const previous = route;
      route = chosen || null;
      board = route ? model.readBoard(items, route) : null;
      clips = route ? items[model.annotationKey(route)] || [] : [];
      listBoards(items);
      if (previous !== route || initial) {
        active = connectFrom = null;
        turns = [];
        const url = new URL(location.href);
        if (route) url.searchParams.set('route', route); else url.searchParams.delete('route');
        history.replaceState(history.state, '', url);
        renderMaterials();
        render();
        if (board) fit(); else center();
        void refreshTurns();
      } else {
        renderMaterials();
        if (!drag && !$('edit').contains(document.activeElement)) render();
      }
    } catch {notify('无法读取本地笔记本');}
  }

  function chatUrl(turnId) {
    return 'https://chatgpt.com' + route + (turnId ? '#dual-nav-turn=' + encodeURIComponent(turnId) : '');
  }

  async function openChat(turnId) {
    if (!route) return;
    if (sourceTab && turnId) {
      try {
        const result = await chrome.tabs.sendMessage(sourceTab, {type:'dualNavNotebookJump', route, turnId});
        if (result?.ok) {await chrome.tabs.update(sourceTab, {active:true}); return;}
      } catch {}
    }
    const tab = await chrome.tabs.create({url:chatUrl(turnId)});
    sourceTab = tab.id;
    const notebook = new URL(location.href);
    notebook.searchParams.set('tab', tab.id);
    history.replaceState(history.state, '', notebook);
  }

  function beginDrag(event) {
    if (!board || event.button !== 0 || !event.isPrimary || event.target.closest('.zoom, .topic-toggle')) return;
    const node = event.target.closest('[data-card], [data-group]');
    const id = node?.dataset.card || node?.dataset.group;
    const layout = model.boardLayout(board);
    const rect = layout.cards.get(id) || layout.groups.get(id);
    drag = {node, rect, id, pointer:event.pointerId, startX:event.clientX, startY:event.clientY, x, y};
  }

  function moveDrag(event) {
    if (!drag || drag.pointer !== event.pointerId) return;
    const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) viewport.setPointerCapture(event.pointerId);
    drag.moved = true;
    viewport.classList.add('dragging');
    if (drag.node) drag.node.style.transform = 'translate(' + dx / scale + 'px,' + dy / scale + 'px)';
    else {x = drag.x + dx; y = drag.y + dy; applyView();}
  }

  function finishDrag(event) {
    if (!drag || drag.pointer !== event.pointerId) return;
    const move = drag;
    drag = null;
    viewport.classList.remove('dragging');
    if (!move.moved || !move.node) return;
    move.node.style.transform = '';
    if (event.type !== 'pointerup') return;
    const left = Math.round(move.rect.x + (event.clientX - move.startX) / scale);
    const top = Math.round(move.rect.y + (event.clientY - move.startY) / scale);
    const group = move.node.dataset.card && groupAt(model.boardLayout(board), left + move.rect.width / 2, top + move.rect.height / 2);
    void save(next => {
      const item = (move.node.dataset.card ? next.cards : next.groups).find(item => item.id === move.id);
      if (!item) return false;
      item.x = left;
      item.y = top;
      if (move.node.dataset.card) item.groupId = group?.id || null;
    });
  }

  $('edit').onsubmit = event => {
    event.preventDefault();
    const selected = active, title = $('title').value.trim(), note = $('note').value, groupId = $('group').value || null;
    if (!selected || !title) return;
    void save(next => {
      const item = (selected.type === 'card' ? next.cards : next.groups).find(item => item.id === selected.id);
      if (!item) return false;
      item.title = title;
      if (selected.type === 'card') {item.note = note; item.groupId = groupId;}
    });
  };
  $('new-note').onclick = () => void addMaterial({id:crypto.randomUUID(), title:'新笔记', note:''});
  $('new-group').onclick = async () => {
    const id = crypto.randomUUID();
    const position = freePosition(model.cardSize.width + 30, model.cardSize.height + 73);
    if (await save(next => next.groups.push({id, title:'主题 ' + (next.groups.length + 1), ...position, collapsed:false})) &&
        board?.groups.some(group => group.id === id)) {
      select('group', id);
      center(model.boardLayout(board).groups.get(id));
    }
  };
  $('fold-groups').onclick = () => void save(next => {
    const start = next.cards.find(card => card.id === next.start);
    const close = next.groups.some(group => !group.collapsed && group.id !== start?.groupId);
    for (const group of next.groups) group.collapsed = close && group.id !== start?.groupId;
  });
  $('start-view').onclick = async () => {
    const start = board.cards.find(card => card.id === board.start);
    if (!start) {fit(); return;}
    if (board.groups.some(group => group.id === start.groupId && group.collapsed)) {
      await save(next => {
        const group = next.groups.find(group => group.id === start.groupId);
        if (group) group.collapsed = false;
      });
    }
    center(model.boardLayout(board).cards.get(start.id));
  };
  $('set-start').onclick = () => {const id = active.id; void save(next => {next.start = id;});};
  $('go-to-source').onclick = event => {
    if (!sourceTab || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void openChat(board.cards.find(card => card.id === active.id)?.turnId);
  };
  $('open-chat').onclick = () => void openChat();
  $('refresh-turns').onclick = refreshTurns;
  $('fit-view').onclick = fit;
  $('zoom-in').onclick = () => zoom(1.2);
  $('zoom-out').onclick = () => zoom(1 / 1.2);
  $('close-details').onclick = () => {active = null; render();};
  $('connect').onclick = () => {connectFrom = active.id; notify('选择要连接的另一张卡片');};
  $('remove-link').onclick = () => {
    const id = active.id, other = $('unlink').value;
    void save(next => {next.links = next.links.filter(link => !(link.from === id && link.to === other || link.from === other && link.to === id));});
  };
  $('delete').onclick = () => {
    const selected = active;
    active = connectFrom = null;
    void save(next => {
      if (selected.type === 'group') {
        const layout = model.boardLayout(next);
        next.groups = next.groups.filter(group => group.id !== selected.id);
        for (const card of next.cards.filter(card => card.groupId === selected.id)) {
          const {x, y} = layout.cards.get(card.id);
          Object.assign(card, {x, y, groupId:null});
        }
      } else {
        next.cards = next.cards.filter(card => card.id !== selected.id);
        next.links = next.links.filter(link => link.from !== selected.id && link.to !== selected.id);
        if (next.start === selected.id) next.start = next.cards[0]?.id || null;
      }
    });
  };
  recent.onchange = () => void load(recent.value);
  viewport.addEventListener('pointerdown', beginDrag);
  viewport.addEventListener('pointermove', moveDrag);
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) viewport.addEventListener(name, finishDrag);
  viewport.addEventListener('dragover', event => {if (draggedMaterial) event.preventDefault();});
  viewport.addEventListener('drop', event => {
    if (!draggedMaterial) return;
    event.preventDefault();
    void addMaterial(draggedMaterial, point(event));
    draggedMaterial = null;
  });
  viewport.addEventListener('wheel', event => {
    if (!board) return;
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX - rect.left, event.clientY - rect.top);
  }, {passive:false});
  viewport.addEventListener('keydown', event => {
    if (event.target !== viewport || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    x += {ArrowLeft:40, ArrowRight:-40}[event.key] || 0;
    y += {ArrowUp:40, ArrowDown:-40}[event.key] || 0;
    applyView();
  });
  window.addEventListener('focus', refreshTurns);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.keys(changes).some(key => key.startsWith(model.prefix) ||
        route && key === model.annotationKey(route))) void load(route);
  });
  void load(params.get('route'), true);
})();
