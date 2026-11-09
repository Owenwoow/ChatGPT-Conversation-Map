(function (root) {
  'use strict';
  const prefix = 'dualNavMap:';
  const openHash = '#dual-nav-mind-map';
  const card = {width: 184, height: 76, column: 226, row: 94, pad: 24};

  function savedPath(path) {
    return typeof path === 'string' && /^\/(?:g\/[\w-]+\/)?c\/[\w-]+$/.test(path);
  }

  function edgeKey(path, child) {
    return prefix + encodeURIComponent(path) + ':' + encodeURIComponent(child);
  }

  function readEdges(items, path) {
    const edges = new Map();
    for (const [key, value] of Object.entries(items)) {
      if (!key.startsWith(prefix) || !value || !Number.isFinite(value.updatedAt) ||
          !['manual', 'followup'].includes(value.kind) ||
          !(value.parent === null || typeof value.parent === 'string' && value.parent)) continue;
      const separator = key.indexOf(':', prefix.length);
      if (separator < 0) continue;
      try {
        const route = decodeURIComponent(key.slice(prefix.length, separator));
        const child = decodeURIComponent(key.slice(separator + 1));
        if (child && savedPath(route) && (path === undefined || route === path)) {
          edges.set(key, {route, child, parent: value.parent, kind: value.kind, updatedAt: value.updatedAt});
        }
      } catch {}
    }
    return edges;
  }

  function recentMaps(items) {
    const dates = new Map();
    for (const {route, updatedAt} of readEdges(items).values()) {
      dates.set(route, Math.max(dates.get(route) || 0, updatedAt));
    }
    return Array.from(dates, ([route, updatedAt]) => ({route, updatedAt}))
      .sort((a, b) => b.updatedAt - a.updatedAt || a.route.localeCompare(b.route)).slice(0, 5);
  }

  function canMove(parents, child, parent) {
    const seen = new Set([child]);
    for (let current = parent; current != null; current = parents.get(current)) {
      if (seen.has(current)) return false;
      seen.add(current);
    }
    return true;
  }

  function makeGraph(turns, edges) {
    const nodes = new Map(turns.map(turn => [turn.id, {id: turn.id, turn, children: []}]));
    const parents = new Map();
    for (const {child, parent} of edges.values()) {
      if (!nodes.has(child)) nodes.set(child, {id: child, children: []});
      if (parent !== null && !nodes.has(parent)) nodes.set(parent, {id: parent, children: []});
      if (canMove(parents, child, parent)) parents.set(child, parent);
    }
    const root = {id: null, children: []};
    for (const node of nodes.values()) {
      (nodes.get(parents.get(node.id)) || root).children.push(node);
    }
    return {root, nodes, parents};
  }

  function layout(root, collapsed) {
    const pending = [{node: root, depth: 0}];
    const visible = [];
    let maxDepth = 0, row = 0;
    while (pending.length) {
      const item = pending.pop();
      if (item.visited) {
        const first = item.children[0], last = item.children.at(-1);
        item.y = first ? (first.y + last.y) / 2 : card.pad + row++ * card.row;
        item.x = card.pad + item.depth * card.column;
        continue;
      }
      maxDepth = Math.max(maxDepth, item.depth);
      item.children = collapsed.has(item.node.id) ? [] : item.node.children.map(node => ({
        node, depth: item.depth + 1, parent: item
      }));
      item.visited = true;
      visible.push(item);
      pending.push(item);
      for (let index = item.children.length - 1; index >= 0; index--) pending.push(item.children[index]);
    }
    return {
      visible,
      width: card.pad * 2 + maxDepth * card.column + card.width,
      height: card.pad * 2 + (row - 1) * card.row + card.height
    };
  }

  function appendedTurn(turns, send) {
    const users = turns.filter(turn => turn.user);
    const next = users.at(-1);
    if (!next?.user.stableId || send.ids.has(next.id) ||
        (send.text && !next.user.text.includes(send.text)) ||
        (next.user.slotId && send.slots.has(next.user.slotId))) return null;
    return users.at(-2)?.id === send.tail ? next : null;
  }

  const api = {prefix, openHash, card, savedPath, edgeKey, readEdges, recentMaps, canMove, makeGraph, layout, appendedTurn};
  (root.DualNav ||= {}).mindMapModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
