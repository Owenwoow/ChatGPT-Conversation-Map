(() => {
  'use strict';
  const {adapter, notebookModel} = globalThis.DualNav;
  const jumpPrefix = '#dual-nav-turn=';

  function createNotebookBridge({signal, getSnapshot, getTurns, navigate, notify}) {
    if (!globalThis.chrome?.runtime?.id || !chrome.runtime.onMessage) return;
    let requested = location.hash.startsWith(jumpPrefix) ? location.hash.slice(jumpPrefix.length) : '';
    let jumpRoute = adapter.getKey();
    let missingReported = false;

    function receive(message, sender, respond) {
      if (sender.id !== chrome.runtime.id || !message || !['dualNavNotebookSource', 'dualNavNotebookJump'].includes(message.type)) return;
      const route = adapter.getKey();
      const snapshot = getSnapshot();
      if (!notebookModel.validRoute(route, location.search) || snapshot?.key !== route || !snapshot.main?.isConnected ||
          (message.route && message.route !== route)) return;
      const turns = getTurns().filter(turn => turn.user?.stableId);
      if (message.type === 'dualNavNotebookJump') {
        const target = turns.find(turn => turn.id === message.turnId);
        if (target) void navigate(target.id);
        respond({ok: !!target});
        return;
      }
      respond({route, turns: turns.map(turn => ({
        id: turn.id, ordinal: turn.ordinal, title: (turn.user.text || '对话').slice(0, 140)
      }))});
    }

    const listener = chrome.runtime.onMessage;
    listener.addListener(receive);
    signal.addEventListener('abort', () => {try {listener.removeListener(receive);} catch {}}, {once: true});
    return {
      refresh() {
        if (!requested || !getSnapshot()?.main?.isConnected) return;
        if (adapter.getKey() !== jumpRoute || !notebookModel.validRoute(jumpRoute, location.search)) {requested = ''; return;}
        let id;
        try {id = decodeURIComponent(requested);} catch {requested = ''; return;}
        if (!getTurns().length) return;
        if (!getTurns().some(turn => turn.id === id)) {
          if (!missingReported) notify('目标轮次尚未加载，向上浏览历史后会自动定位');
          missingReported = true;
          return;
        }
        requested = jumpRoute = '';
        history.replaceState(history.state, '', location.pathname + location.search);
        void navigate(id);
      }
    };
  }

  globalThis.DualNav.createNotebookBridge = createNotebookBridge;
})();
