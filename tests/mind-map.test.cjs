const test = require('node:test');
const assert = require('node:assert/strict');
const {edgeKey, readEdges, recentMaps, makeGraph, canMove, layout, appendedTurn} = require('../src/mind-map-model.js');

test('手动改挂移动整条子树，未加载端点保留占位，主线维持发送顺序', () => {
  const path = '/c/diagram';
  const turns = ['a', 'b', 'd', 'e'].map(id => ({id}));
  const items = {
    [edgeKey(path, 'd')]: {parent: 'b', kind: 'manual', updatedAt: 1},
    [edgeKey(path, 'c')]: {parent: 'd', kind: 'followup', updatedAt: 2},
    [edgeKey('/c/other', 'e')]: {parent: 'c', kind: 'manual', updatedAt: 3}
  };
  const graph = makeGraph(turns, readEdges(items, path));
  assert.deepEqual(graph.root.children.map(node => node.id), ['a', 'b', 'e']);
  assert.equal(graph.nodes.get('b').children[0].id, 'd');
  assert.equal(graph.nodes.get('d').children[0].id, 'c');
  assert.equal(graph.nodes.get('c').turn, undefined);
  assert.equal(canMove(graph.parents, 'b', 'c'), false);
  assert.equal(canMove(graph.parents, 'b', 'b'), false);
  assert.equal(canMove(graph.parents, 'b', null), true);
  assert.deepEqual(layout(graph.root, new Set(['b'])).visible.map(item => item.node.id), [null, 'a', 'b', 'e']);
  assert.ok(layout(graph.root, new Set()).visible.find(item => item.node.id === 'c').x >
    layout(graph.root, new Set()).visible.find(item => item.node.id === 'd').x);
});

test('最近导图去重并按本地更新时间排序，最多五个已保存会话', () => {
  const items = Object.fromEntries(Array.from({length: 7}, (_, i) => [
    edgeKey('/c/thread-' + i, 'a'), {parent: 'b', kind: 'manual', updatedAt: i}
  ]));
  items[edgeKey('/c/thread-0', 'c')] = {parent: null, kind: 'manual', updatedAt: 9};
  items[edgeKey('//other.example/c/example', 'a')] = {parent: 'b', kind: 'manual', updatedAt: 10};
  assert.deepEqual(recentMaps(items).map(map => map.route),
    ['/c/thread-0', '/c/thread-6', '/c/thread-5', '/c/thread-4', '/c/thread-3']);
});

test('以稳定身份确认实际追加的提问，区分重复文案、历史加载及编辑', () => {
  const user = (id, slotId = id) => ({id, user: {stableId: id, slotId, text: '相同文案'}});
  const send = {ids: new Set(['a', 'b']), slots: new Set(['a', 'b']), tail: 'b', text: '相同文案'};
  assert.equal(appendedTurn([user('a'), user('b'), user('c')], send).id, 'c');
  assert.equal(appendedTurn([user('older'), user('a'), user('b')], send), null);
  assert.equal(appendedTurn([user('a'), user('b-edited', 'b')], send), null);
  assert.equal(appendedTurn([user('a'), user('b'), user('c')], {...send, text: '另一条草稿'}), null);
});
