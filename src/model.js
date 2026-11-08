(function (root) {
  'use strict';

  function buildTree(headings) {
    const roots = [];
    const stack = [];
    for (const heading of headings || []) {
      const node = { ...heading, children: [] };
      while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
      if (stack.length) stack[stack.length - 1].children.push(node);
      else roots.push(node);
      stack.push(node);
    }
    return roots;
  }

  class ConversationStore {
    constructor() { this.reset(null); }

    reset(key) {
      this.key = key;
      this.messages = new Map();
      this.order = [];
      this.slots = new Map();
      this.turns = [];
    }

    update(snapshot) {
      if (snapshot.key !== this.key) this.reset(snapshot.key);
      const incoming = snapshot.messages || [];
      for (let index = 0; index < incoming.length; index++) {
        let message = incoming[index];
        // A regenerated/edited message occupies the same page turn slot. Replace
        // the old branch in place instead of leaving a duplicate cached answer.
        const previousId = message.slotId && this.slots.get(message.slotId);
        const oldMessage = this.messages.get(message.id);
        // Recovery/virtualization can leave a known message container empty.
        // Absence of content is not an edit or a reason to erase its outline.
        // Still accept new IDs and explicit streaming updates, including empty ones.
        if (oldMessage?.text && !message.text && !message.headings?.length && !message.streaming) {
          message = { ...message, text: oldMessage.text, headings: oldMessage.headings };
        }
        const userEdited = message.role === 'user' && oldMessage && oldMessage.text !== message.text;
        if ((previousId && previousId !== message.id) || userEdited) {
          const replacedId = previousId || message.id;
          const position = this.order.indexOf(replacedId);
          // An explicit slot replacement is evidence of a branch change, unlike
          // DOM absence alone. Its old descendants must not survive in the cache.
          if (position >= 0) {
            for (const staleId of this.order.splice(position)) {
              const stale = this.messages.get(staleId);
              if (stale?.slotId) this.slots.delete(stale.slotId);
              this.messages.delete(staleId);
            }
            this.order.splice(position, 0, message.id);
          }
        }
        if (!this.order.includes(message.id)) {
          let position = -1;
          // Use the nearest following observed anchor, so loading older history
          // inserts it before existing records instead of appending it at the end.
          for (let next = index + 1; next < incoming.length; next++) {
            position = this.order.indexOf(incoming[next].id);
            if (position >= 0) break;
          }
          if (position < 0) {
            const previous = index ? this.order.indexOf(incoming[index - 1].id) : -1;
            position = previous < 0 ? this.order.length : previous + 1;
          }
          this.order.splice(position, 0, message.id);
        }
        this.messages.set(message.id, { ...message, headings: message.headings || [] });
        if (message.slotId) this.slots.set(message.slotId, message.id);
      }
      // ChatGPT exposes numeric turn positions on common page versions; use them
      // when all records have this information, including nonoverlapping windows.
      if (this.order.every(id => Number.isFinite(this.messages.get(id).order))) {
        this.order.sort((a, b) => this.messages.get(a).order - this.messages.get(b).order);
      }
      const turns = [];
      for (const id of this.order) {
        const message = this.messages.get(id);
        if (message.role === 'user') {
          turns.push({ id: message.id, user: message, assistant: null, ordinal: turns.length + 1 });
        } else if (message.role === 'assistant') {
          let turn = turns[turns.length - 1];
          if (!turn || turn.assistant) {
            turn = { id: message.id, user: null, assistant: null, ordinal: turns.length + 1 };
            turns.push(turn);
          }
          turn.assistant = message;
        }
      }
      this.turns = turns;
      return turns;
    }
  }

  const api = { ConversationStore, buildTree };
  Object.assign(root.DualNav = root.DualNav || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
