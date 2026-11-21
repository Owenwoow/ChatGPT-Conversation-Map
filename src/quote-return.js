(function (root) {
  'use strict';
  const {adapter} = root.DualNav;
  const paragraphSelector = 'p,li,blockquote,pre,td,th,h1,h2,h3,h4,h5,h6';
  const editorSelector = '#prompt-textarea,textarea,[contenteditable="true"]';
  const highlightName = 'dual-nav-quote';
  const compact = text => text.replace(/\s+/g, ' ').trim();

  function readSelection(snapshot) {
    const selection = document.getSelection();
    if (!snapshot?.main || selection?.rangeCount !== 1 || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    const start = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const element = start?.closest(adapter.selectors.message);
    const message = snapshot.messages.find(item => item.role === 'assistant' && item.element === element);
    if (!message || !snapshot.main.contains(element)) return null;
    if (start.closest('button,[role="button"],[role="toolbar"]') || !element.contains(range.commonAncestorContainer)) return null;
    const text = range.toString();
    if (!text.trim()) return null;
    const before = range.cloneRange();
    before.selectNodeContents(element);
    before.setEnd(range.startContainer, range.startOffset);
    const offset = before.toString().length;
    const content = element.textContent;
    const paragraph = start.closest(paragraphSelector);
    const anchor = {
      source: message.id, text, preview: compact(selection.toString()), range: range.cloneRange(),
      before: content.slice(Math.max(0, offset - 64), offset),
      after: content.slice(offset + text.length, offset + text.length + 64),
      paragraph: paragraph && element.contains(paragraph) ? paragraph : null,
      withinParagraph: !!paragraph?.contains(range.commonAncestorContainer)
    };
    // Remember how closely the other occurrences already matched. Removing
    // the selected sentence must not turn an old runner-up into a destination.
    anchor.otherScore = -1;
    for (let at = content.indexOf(text); at !== -1; at = content.indexOf(text, at + 1)) {
      if (at !== offset) anchor.otherScore = Math.max(anchor.otherScore, contextScore(content, at, anchor));
    }
    return anchor;
  }

  function contextScore(content, at, anchor) {
    let left = 0, right = 0;
    while (left < anchor.before.length && content[at - left - 1] === anchor.before.at(-left - 1)) left++;
    while (right < anchor.after.length && content[at + anchor.text.length + right] === anchor.after[right]) right++;
    return left + right;
  }

  function findOffset(content, anchor, threshold) {
    let best = -1, bestScore = threshold;
    for (let at = content.indexOf(anchor.text); at !== -1; at = content.indexOf(anchor.text, at + 1)) {
      const score = contextScore(content, at, anchor);
      if (score > bestScore) { best = at; bestScore = score; }
      else if (score === bestScore) best = -1;
    }
    return best;
  }

  function resolveRange(body, anchor) {
    if (body.contains(anchor.range.commonAncestorContainer) && anchor.range.toString() === anchor.text) return anchor.range;
    // If the original paragraph survived an edit, an identical sentence in
    // another paragraph cannot be the one the reader selected.
    const sameParagraph = anchor.withinParagraph && body.contains(anchor.paragraph);
    if (sameParagraph) body = anchor.paragraph;
    const offset = findOffset(body.textContent, anchor, sameParagraph ? -1 : anchor.otherScore);
    if (offset < 0) return null;
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let position = 0, started = false;
    while (walker.nextNode()) {
      const node = walker.currentNode, end = position + node.length;
      if (!started && offset < end) { range.setStart(node, offset - position); started = true; }
      if (started && offset + anchor.text.length <= end) {
        range.setEnd(node, offset + anchor.text.length - position);
        return range;
      }
      position = end;
    }
    return null;
  }

  function matchesPreview(element, text) {
    const preview = compact(element.textContent);
    if (preview === text) return true;
    const abbreviated = preview.match(/^(.{8,}?)(?:…|\.{3})$/u);
    return !!abbreviated && text.startsWith(abbreviated[1].trimEnd());
  }

  function composerHasQuote(composer, anchor, activated) {
    if (!composer) return false;
    const text = anchor.preview;
    // The native quote is a separate preview. The typed question may itself
    // contain a copy of the sentence and is never evidence of an attachment.
    return Array.from(composer.querySelectorAll('*')).some(element => {
      if (element.matches(editorSelector) || element.querySelector(editorSelector) ||
          (element.closest(editorSelector) && !element.closest('blockquote,[contenteditable="false"]')) ||
          element.closest('[hidden],[aria-hidden="true"]')) return false;
      const control = element.closest('button,[role="button"]');
      if (control && !activated && !control.closest('[data-testid*="quote"],[data-message-quote],blockquote')) return false;
      return element.getClientRects().length > 0 && matchesPreview(element, text);
    });
  }

  function createQuoteReturns({getSnapshot, onJump, signal}) {
    let recent = null, attached = null, pending = null, highlightTimer = 0;
    const links = new Map(), buttons = new Map();
    function rememberSelection() {
      const selection = readSelection(getSnapshot());
      if (selection) recent = selection;
    }
    document.addEventListener('pointerup', rememberSelection, {signal});
    document.addEventListener('keyup', event => { if (event.shiftKey) rememberSelection(); }, {signal});
    function captureAsk(event) {
      const button = event.target.closest?.('button,[role="button"],[role="menuitem"]');
      if (button && [button.textContent, button.title, button.getAttribute('aria-label')].some(
        label => /^(?:Ask ChatGPT|(?:询问|问问?|问一下|向)\s*ChatGPT(?:\s*提问)?|引用并提问)$/i.test(label?.trim()))) {
        attached = readSelection(getSnapshot()) || recent;
      }
    }
    document.addEventListener('pointerdown', captureAsk, {capture:true, signal});
    document.addEventListener('click', captureAsk, {capture:true, signal});

    function noteSend(target, turns) {
      if (!recent && !attached) return;
      const input = document.querySelector('#prompt-textarea');
      const composer = target?.closest('form') || input?.closest('form') ||
        (input || target)?.closest('[data-type="unified-composer"],#composer-background');
      const anchor = [attached, recent].find(candidate => candidate && composerHasQuote(composer, candidate, candidate === attached));
      // Enter or a send-button click can also generate a submit event.
      if (!anchor && pending && performance.now() - pending.at < 300) return;
      if (!anchor && !attached) { pending = null; return; }
      const editor = composer?.querySelector(editorSelector);
      pending = {
        anchor: anchor || attached, confirmed: !!anchor, at: performance.now(),
        prompt: compact(editor?.value ?? editor?.textContent ?? ''),
        known: new Set(turns.filter(turn => turn.user).map(turn => turn.id))
      };
    }

    function update(snapshot, turns) {
      if (pending && performance.now() - pending.at > 15000) pending = null;
      if (pending) {
        const last = turns.at(-1);
        if (last?.user && !pending.known.has(last.id) && snapshot.messages.some(message => message.id === last.id)) {
          const {anchor, confirmed, prompt} = pending;
          const turn = last.user.element.closest(adapter.selectors.turn) || last.user.element;
          const quoted = turn.querySelectorAll('blockquote,[data-testid*="quote"],[data-message-quote]');
          if ((!prompt || last.user.text.includes(prompt)) && (confirmed ||
              Array.from(quoted).some(element => matchesPreview(element, anchor.preview)))) links.set(last.id, anchor);
          pending = recent = attached = null;
        }
      }
      if (!links.size) return;
      const mounted = new Set();
      for (const turn of turns) {
        const anchor = links.get(turn.id), answer = turn.assistant?.element;
        if (!anchor || !answer || !snapshot.main?.contains(answer) || turn.assistant.streaming) continue;
        mounted.add(turn.id);
        let button = buttons.get(turn.id);
        if (!button) {
          button = document.createElement('button');
          button.type = 'button';
          button.className = 'dual-nav-quote-return';
          button.dataset.excerpt = anchor.preview;
          button.title = '回到原文';
          button.setAttribute('aria-label', '回到原文：' + anchor.preview);
          button.addEventListener('click', () => onJump(anchor), {signal});
          buttons.set(turn.id, button);
        }
        // The label is rendered by CSS so it never enters a message's textContent.
        if (button.parentNode !== answer || button !== answer.lastElementChild) answer.append(button);
      }
      for (const [id, button] of buttons) {
        if (!mounted.has(id)) { button.remove(); buttons.delete(id); }
      }
    }

    function highlight(range) {
      clearTimeout(highlightTimer);
      if (!root.CSS?.highlights) return;
      CSS.highlights.set(highlightName, new Highlight(range));
      highlightTimer = setTimeout(() => CSS.highlights.delete(highlightName), 2200);
    }
    function reset() {
      pending = recent = attached = null;
      links.clear();
      for (const button of buttons.values()) button.remove();
      buttons.clear();
      clearTimeout(highlightTimer);
      root.CSS?.highlights?.delete(highlightName);
    }
    signal.addEventListener('abort', reset, {once:true});
    return {noteSend, update, reset, highlight};
  }
  root.DualNav.createQuoteReturns = createQuoteReturns;
  root.DualNav.resolveQuoteRange = resolveRange;
})(globalThis);
