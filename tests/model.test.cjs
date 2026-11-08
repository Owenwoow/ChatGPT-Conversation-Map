const test = require('node:test');
const assert = require('node:assert/strict');
const { ConversationStore, buildTree } = require('../src/model.js');
const msg = (id, role, extras = {}) => ({ id, role, text: id, headings: [], ...extras });
const snap = (messages, key = '/c/a') => ({ key, messages });

test('标题树保留跳级及同级关系，输入不发生变化', () => {
  const headings = [{ id: 'a', level: 1 }, { id: 'b', level: 3 }, { id: 'c', level: 3 }, { id: 'd', level: 2 }, { id: 'e', level: 1 }];
  const tree = buildTree(headings);
  assert.equal(tree.length, 2);
  assert.deepEqual(tree[0].children.map(node => node.id), ['b', 'c', 'd']);
  assert.equal(headings[0].children, undefined);
});

test('虚拟化卸载保留记录，并将后来加载的旧消息插在锚点之前', () => {
  const store = new ConversationStore();
  store.update(snap([msg('u2', 'user'), msg('a2', 'assistant')]));
  const turns = store.update(snap([msg('u1', 'user'), msg('a1', 'assistant'), msg('u2', 'user')]));
  assert.deepEqual(turns.map(turn => turn.id), ['u1', 'u2']);
  assert.equal(turns[1].assistant.id, 'a2');
  assert.equal(store.update(snap([])).length, 2);
});

test('不相邻的虚拟化窗口依据页面 turn 位置排序', () => {
  const store = new ConversationStore();
  store.update(snap([msg('u9', 'user', { order: 18 }), msg('a9', 'assistant', { order: 19 })]));
  const turns = store.update(snap([msg('u1', 'user', { order: 2 }), msg('a1', 'assistant', { order: 3 })]));
  assert.deepEqual(turns.map(turn => turn.id), ['u1', 'u9']);
});

test('流式更新及重生成替换旧目录和回答分支', () => {
  const store = new ConversationStore();
  store.update(snap([msg('u', 'user'), msg('a', 'assistant', { slotId: 's', headings: [{ id: 'old', level: 1 }] })]));
  let turns = store.update(snap([msg('a', 'assistant', { slotId: 's', headings: [{ id: 'new', level: 2 }] })]));
  assert.deepEqual(turns[0].assistant.headings.map(h => h.id), ['new']);
  turns = store.update(snap([msg('b', 'assistant', { slotId: 's' })]));
  assert.equal(turns.length, 1);
  assert.equal(turns[0].assistant.id, 'b');
  assert.equal(store.messages.has('a'), false);
});

test('切换会话立即清空缓存，不跨会话混入历史', () => {
  const store = new ConversationStore();
  store.update(snap([msg('u', 'user'), msg('a', 'assistant')]));
  assert.deepEqual(store.update(snap([], '/c/b')), []);
  assert.equal(store.messages.size, 0);
});

test('明确编辑用户消息时删除旧分支后代，区别于虚拟化卸载', () => {
  const store = new ConversationStore();
  store.update(snap([msg('u1', 'user', { slotId: 'turn0:user' }), msg('a1', 'assistant'), msg('u2', 'user'), msg('a2', 'assistant')]));
  const turns = store.update(snap([msg('new-u1', 'user', { slotId: 'turn0:user' }), msg('new-a1', 'assistant')]));
  assert.equal(turns.length, 1);
  assert.equal(turns[0].user.id, 'new-u1');
  assert.equal(turns[0].assistant.id, 'new-a1');
  assert.equal(store.messages.has('u2'), false);
});

test('只有 assistant 的历史片段也可显示，之后补入用户时恢复为完整轮次', () => {
  const store = new ConversationStore();
  store.update(snap([msg('a', 'assistant')]));
  const turns = store.update(snap([msg('u', 'user'), msg('a', 'assistant')]));
  assert.equal(turns.length, 1);
  assert.equal(turns[0].user.id, 'u');
});

test('同一消息暂时变为空壳时保留提问、回答目录及后续历史', () => {
  const store = new ConversationStore();
  const headings = [{ id: 'a1:h', level: 2, text: '原目录' }];
  store.update(snap([
    msg('u1', 'user', { slotId: 'turn0:user' }),
    msg('a1', 'assistant', { headings }),
    msg('u2', 'user'), msg('a2', 'assistant')
  ]));
  const restoredElement = {};
  let turns = store.update(snap([
    msg('u1', 'user', { slotId: 'turn0:user', text: '' }),
    msg('a1', 'assistant', { text: '', element: restoredElement })
  ]));
  assert.deepEqual(turns.map(turn => turn.id), ['u1', 'u2']);
  assert.equal(turns[0].user.text, 'u1');
  assert.equal(turns[0].assistant.text, 'a1');
  assert.deepEqual(turns[0].assistant.headings, headings);
  assert.equal(turns[0].assistant.element, restoredElement);

  turns = store.update(snap([msg('a1', 'assistant', { text: '恢复后的无标题正文' })]));
  assert.equal(turns[0].assistant.text, '恢复后的无标题正文');
  assert.deepEqual(turns[0].assistant.headings, []);
});

test('同 ID 的非空编辑仍清理旧分支，新 ID 的空回答不继承旧目录', () => {
  const store = new ConversationStore();
  store.update(snap([msg('u1', 'user'), msg('a1', 'assistant'), msg('u2', 'user')]));
  let turns = store.update(snap([msg('u1', 'user', { text: '编辑后的问题' })]));
  assert.equal(turns.length, 1);
  assert.equal(turns[0].assistant, null);
  assert.equal(store.messages.has('u2'), false);

  store.update(snap([msg('a1', 'assistant', { slotId: 's', headings: [{ id: 'old', level: 2 }] })]));
  turns = store.update(snap([msg('a2', 'assistant', { slotId: 's', text: '' })]));
  assert.equal(turns[0].assistant.id, 'a2');
  assert.equal(turns[0].assistant.text, '');
  assert.deepEqual(turns[0].assistant.headings, []);
});

test('明确的流式空回答仍更新缓存，不保留过期目录', () => {
  const store = new ConversationStore();
  store.update(snap([msg('u', 'user'), msg('a', 'assistant', { headings: [{ id: 'old', level: 2 }] })]));
  const turns = store.update(snap([msg('a', 'assistant', { text: '', streaming: true })]));
  assert.equal(turns[0].assistant.text, '');
  assert.deepEqual(turns[0].assistant.headings, []);
});
