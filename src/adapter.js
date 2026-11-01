(function (root) {
  'use strict';
  const ns = root.DualNav = root.DualNav || {};
  const nodeIds = new WeakMap();
  let nextId = 0;
  const SELECTORS = Object.freeze({
    main: 'main, [role="main"]',
    hidden: '[hidden], [inert], [aria-hidden="true"]',
    conversation: '[data-chatgpt-conversation-selection-target]',
    message: '[data-message-author-role], [data-chatgpt-search-unit-key]',
    turn: '[data-testid^="conversation-turn-"], [data-turn-id], [data-content-search-turn-key], [data-turn-key]',
    body: '[data-markdown-text-style="assistant-message"], .markdown, [data-message-content]',
    userBody: '[data-user-message-bubble]',
    contentColumn: '[data-thread-user-message-navigation-content]',
    sidePanel: '[data-summary-panel-variant], aside, [role="complementary"], [role="dialog"], [data-testid*="side-panel"], [data-testid*="sidebar"]',
    sidebarTrigger: 'button[data-app-shell-sidebar-trigger][aria-controls="app-shell-sidebar"]',
    sidebarControl: 'button[aria-controls="app-shell-sidebar"]',
    outlineExcluded: 'pre,code,[hidden],[inert],[aria-hidden="true"],[data-d-component="box"][data-d-has-border],[data-d-component="box"] [data-d-component="title"][data-d-tabular-nums="true"]',
    stop: '[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="停止生成"], button[aria-label="停止流式传输"]',
    streaming: '[data-is-streaming="true"], .result-streaming'
  });

  function anonymousId(element) {
    if (!nodeIds.has(element)) nodeIds.set(element, `local-${++nextId}`);
    return nodeIds.get(element);
  }

  function isVisible(element) {
    if (element.closest(SELECTORS.hidden)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.visibility !== 'collapse';
  }

  function getKey() { return location.pathname.replace(/\/$/, '') || '/'; }
  function conversationId(key) {
    const id = key.match(/\/c\/([^/]+)/)?.[1];
    try { return id ? decodeURIComponent(id) : null; } catch { return id; }
  }
  function isDraftKey(key) {
    const id = conversationId(key);
    return !id || id.startsWith('local-chatgpt:');
  }

  function findMain(key, { draftId, allowDraft } = {}) {
    // The app keeps previous conversations mounted in hidden sibling mains.
    const candidates = Array.from(document.querySelectorAll(SELECTORS.main)).filter(isVisible);
    const id = conversationId(key);
    if (id) {
      let identified = false;
      let draft = null;
      for (const main of candidates) {
        const markers = Array.from(main.querySelectorAll(SELECTORS.conversation));
        identified ||= markers.length > 0;
        const ids = markers.map(marker => marker.getAttribute('data-chatgpt-conversation-selection-target'));
        if (ids.includes(id)) {
          return { main, routeConfirmed: true, draftId: id.startsWith('local-chatgpt:') ? id : null };
        }
        const localId = ids.find(value => value?.startsWith('local-chatgpt:') && (allowDraft || value === draftId));
        if (localId) draft = { main, routeConfirmed: false, draftId: localId };
      }
      // The live new-chat container keeps its local ID after the URL is saved.
      // Only continue the observed draft; never accept arbitrary route mismatches.
      if (draft) return draft;
      // Content may change before the router updates its URL. Wait for them to
      // agree instead of caching the next conversation under the previous URL.
      if (identified) return { main: null, routeConfirmed: false };
    }
    return { main: candidates[0] || null, routeConfirmed: false };
  }

  function getScrollRoot(element) {
    for (let current = element; current && current !== document.body; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (/(auto|scroll|overlay)/.test(style.overflowY) && current.scrollHeight > current.clientHeight + 2) return current;
    }
    return document.scrollingElement || document.documentElement;
  }

  function headingRecords(body, messageId) {
    return Array.from(body.querySelectorAll('h1,h2,h3,h4,h5,h6'))
      .filter(element => !element.closest(SELECTORS.outlineExcluded))
      .map((element, index) => ({
        id: `${messageId}:heading:${index}`,
        level: Number(element.tagName.slice(1)),
        text: (element.textContent || '').replace(/\s+/g, ' ').trim(),
        element
      })).filter(heading => heading.text);
  }

  function scan(options) {
    const key = getKey();
    const { main, routeConfirmed, draftId } = findMain(key, options);
    if (!main) return { key, main: null, routeConfirmed, scrollRoot: document.scrollingElement, messages: [], streaming: false };
    const messages = [];
    for (const element of main.querySelectorAll(SELECTORS.message)) {
      // Native link previews contain their own assistant/search-unit markup.
      // They are not turns in the conversation being navigated.
      if (element.closest(SELECTORS.sidePanel)) continue;
      const unitKey = element.getAttribute('data-chatgpt-search-unit-key');
      const unitMatch = unitKey?.match(/^(.*):(\d+):(user|assistant)$/);
      const role = element.getAttribute('data-message-author-role') || unitMatch?.[3];
      if (role !== 'user' && role !== 'assistant') continue;
      // Ignore any lookalike markup displayed as part of a message/code sample.
      if (element.parentElement?.closest(SELECTORS.message)) continue;
      const turn = element.closest(SELECTORS.turn);
      const turnId = turn?.getAttribute('data-turn-id') || turn?.getAttribute('data-testid') || turn?.getAttribute('data-content-search-turn-key') || turn?.getAttribute('data-turn-key') || turn?.id;
      const slotId = unitMatch ? unitKey : turnId ? `${turnId}:${role}` : null;
      const id = element.getAttribute('data-message-id') || element.getAttribute('data-chatgpt-search-message-ids')?.trim().split(/\s+/)[0] || (slotId || anonymousId(element));
      const body = element.querySelector(role === 'assistant' ? SELECTORS.body : SELECTORS.userBody) || element;
      const turnMatch = turn?.getAttribute('data-testid')?.match(/^conversation-turn-(\d+)$/);
      const unitOrder = unitKey?.match(/^fallback-turn-(\d+):(\d+):(user|assistant)$/);
      messages.push({
        id, slotId, role, element,
        order: turnMatch ? Number(turnMatch[1]) : unitOrder ? Number(unitOrder[1]) * 1000 + Number(unitOrder[2]) : null,
        text: (body.textContent || '').replace(/\s+/g, ' ').trim(),
        headings: role === 'assistant' ? headingRecords(body, id) : [],
        streaming: role === 'assistant' && (element.matches(SELECTORS.streaming) || !!element.querySelector(SELECTORS.streaming))
      });
    }
    const streaming = Array.from(document.querySelectorAll(SELECTORS.stop)).some(button => {
      const owner = button.closest(SELECTORS.main);
      return !button.closest(SELECTORS.sidePanel) && (!owner || owner === main || main.contains(owner)) && isVisible(button);
    }) || messages.some(message => message.streaming);
    if (streaming) {
      const latest = messages.findLast(message => message.role === 'assistant');
      if (latest) latest.streaming = true;
    }
    return { key, main, routeConfirmed, draftId, scrollRoot: getScrollRoot(messages[0]?.element || main), messages, streaming };
  }

  function getContentRect(main) {
    if (!main) return null;
    const outer = main.getBoundingClientRect();
    const column = main.querySelector(SELECTORS.contentColumn)?.getBoundingClientRect();
    if (column?.width > 0 && column.left >= outer.left && column.right <= outer.right) {
      return { left: column.left, right: column.right, top: outer.top, bottom: outer.bottom, width: column.width, height: outer.height };
    }
    let chosen = null;
    const first = main.querySelector('[data-message-author-role="assistant"], [data-chatgpt-search-unit-key$=":assistant"]') || main.querySelector(SELECTORS.turn);
    for (let current = first; current && current !== main; current = current.parentElement) {
      const rect = current.getBoundingClientRect();
      if (rect.width >= Math.min(480, outer.width * 0.65) && rect.width <= outer.width && (!chosen || rect.width < chosen.width)) chosen = rect;
    }
    if (chosen) return { left: chosen.left, right: chosen.right, top: outer.top, bottom: outer.bottom, width: chosen.width, height: outer.height };
    const width = Math.min(768, outer.width - 48);
    const left = outer.left + (outer.width - width) / 2;
    return { left, right: left + width, top: outer.top, bottom: outer.bottom, width, height: outer.height };
  }

  function getRightPanel(main, panels = document.querySelectorAll(SELECTORS.sidePanel)) {
    const outer = main.getBoundingClientRect();
    let chosen = null;
    for (const panel of panels) {
      if (!isVisible(panel) || panel.closest(SELECTORS.message)) continue;
      const rect = panel.getBoundingClientRect();
      // Floating previews have a small viewport inset. Include full-width
      // summary panels on narrow screens, but not the native left sidebar.
      if (rect.width >= 200 && rect.height >= 200 && rect.right >= innerWidth - 64 &&
          rect.left < innerWidth && rect.bottom > 100 && rect.top < innerHeight - 100 &&
          (rect.left > outer.left + 180 || panel.matches('[data-summary-panel-variant]'))) {
        if (!chosen || rect.left < chosen.getBoundingClientRect().left) chosen = panel;
      }
    }
    return chosen;
  }

  function isComposer(element) {
    return !!element?.closest?.('#prompt-textarea, textarea, [contenteditable="true"]');
  }
  function isSendButton(element) {
    return !!element?.closest?.('[data-testid="send-button"], [data-testid="composer-submit-button"], button[aria-label="Send prompt"], button[aria-label="发送提示"], button[aria-label="发送"]');
  }
  function sidebarState() {
    const buttons=Array.from(document.querySelectorAll(SELECTORS.sidebarTrigger)).filter(isVisible);
    const open=buttons.find(button=>button.getAttribute('aria-expanded')==='true' && !button.disabled);
    if(open)return {open:true,button:open};
    return buttons.some(button=>button.getAttribute('aria-expanded')==='false')?{open:false,button:null}:null;
  }
  ns.adapter = { scan, getKey, isDraftKey, getScrollRoot, getContentRect, getRightPanel, isComposer, isSendButton, sidebarState, selectors: SELECTORS };
  // Direct aliases keep consumers independent of the adapter's internal organization.
  ns.scan = scan;
  ns.getScrollRoot = getScrollRoot;
  ns.getContentRect = getContentRect;
})(globalThis);
