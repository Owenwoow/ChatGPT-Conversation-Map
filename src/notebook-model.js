(function (root) {
  'use strict';
  const legacy = root.DualNav.mindMapModel;
  const prefix = 'dualNavNotebook:';
  const annotationPrefix = 'dualNavAnnotations:';
  const cardSize = {width: 216, height: 94};
  const heading = '【引用与问题】';
  const end = '【引用结束】';

  const notebookKey = route => prefix + encodeURIComponent(route);
  const annotationKey = route => annotationPrefix + encodeURIComponent(route);
  const cleanText = value => (value || '').replace(/\s+/g, ' ').trim();
  const validRoute = (route, search) => legacy.savedPath(route) && new URLSearchParams(search).get('temporary-chat') !== 'true';

  function readBoard(items, route) {
    const saved = items[notebookKey(route)];
    if (saved?.version === 1) return saved;
    const edges = legacy.readEdges(items, route);
    const graph = legacy.makeGraph([], edges);
    const layout = legacy.layout(graph.root, new Set());
    const cards = layout.visible.filter(({node}) => node.id !== null).map(({node, x, y}) => ({
      id: node.id, turnId: node.id, x: x * 1.18, y: y * 1.26, title: '', note: ''
    }));
    const links = Array.from(graph.parents, ([to, from]) => ({from, to})).filter(link => link.from !== null);
    return {
      version: 1, cards, groups: [], links, start: cards[0]?.id || null,
      updatedAt: Array.from(edges.values()).reduce((latest, edge) => Math.max(latest, edge.updatedAt), 0)
    };
  }

  function recentBoards(items) {
    const routes = new Set(Array.from(legacy.readEdges(items).values(), edge => edge.route));
    for (const key of Object.keys(items)) {
      if (!key.startsWith(prefix)) continue;
      try {
        const route = decodeURIComponent(key.slice(prefix.length));
        if (legacy.savedPath(route)) routes.add(route);
      } catch {}
    }
    return Array.from(routes, route => {
      const board = readBoard(items, route);
      return {route, updatedAt: board.updatedAt, title: board.cards.find(card => card.id === board.start)?.title || ''};
    }).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function formatAnnotation(item) {
    return '出处（第 ' + item.ordinal + ' 轮）：' + item.quote +
      (item.question ? '\n问题：' + item.question : '');
  }

  function annotationBlock(items) {
    return items.length ? heading + '\n' + items.map(formatAnnotation).join('\n\n') + '\n' + end : '';
  }

  function includedAnnotations(text, items) {
    const normalized = cleanText(text);
    const sections = normalized.split(heading).slice(1)
      .filter(block => block.includes(end))
      .flatMap(block => block.slice(0, block.indexOf(end)).split(/(?=出处（第 \d+ 轮）：)/).map(section => section.trim()));
    return items.filter(item => sections.includes(cleanText(formatAnnotation(item))));
  }

  function boardLayout(board) {
    const cards = new Map(board.cards.map(card => [card.id, {...card, ...cardSize}]));
    const groups = new Map();
    for (const group of board.groups) {
      const members = board.cards.filter(card => card.groupId === group.id);
      const frame = {...group, width: cardSize.width + 30, height: group.collapsed ? 46 : 64 + Math.max(1, members.length) * (cardSize.height + 9), count: members.length};
      groups.set(group.id, frame);
      for (const [index, card] of members.entries()) {
        cards.set(card.id, {...cards.get(card.id), x: group.x + 15, y: group.y + 49 + index * (cardSize.height + 9), hidden: group.collapsed});
      }
    }
    return {cards, groups};
  }

  const api = {prefix, annotationKey, notebookKey, validRoute, readBoard, recentBoards, cleanText, formatAnnotation,
    annotationBlock, includedAnnotations, boardLayout, cardSize};
  root.DualNav.notebookModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
