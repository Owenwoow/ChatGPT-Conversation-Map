(() => {
  'use strict';
  if (document.getElementById('dual-nav-export-host')) return;
  const {adapter} = globalThis.DualNav;
  const lifecycle = new AbortController();
  const options = {signal:lifecycle.signal};
  const hidden = '[hidden],[inert],[aria-hidden="true"]';
  const excluded = 'pre,code,textarea,input,select,button,[contenteditable="true"]';
  const unsupported = 'input,textarea,select,button,[contenteditable="true"],iframe,canvas,img,video,audio,object,embed';
  const blocks = '[data-d-component="box"],[data-d-component="grid"]';
  const htmlTags = new Set('div p span strong b em i small br hr ul ol li h1 h2 h3 h4 h5 h6 table thead tbody tfoot tr th td blockquote code pre a'.split(' '));
  const svgTags = new Set('svg g path rect circle ellipse line polyline polygon text tspan title'.split(' '));
  const dropTags = new Set('script style template noscript iframe object embed form input textarea select button canvas video audio img'.split(' '));
  const svgAttributes = ['viewBox','width','height','d','points','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','dx','dy','transform','fill-rule','clip-rule','stroke-linecap','stroke-linejoin','stroke-width'];
  const cssProperties = ['display','box-sizing','flex-direction','flex-wrap','flex-grow','flex-shrink','align-items','align-self','justify-content','gap','grid-template-columns','grid-column','grid-row','padding','margin','border','border-radius','background-color','color','font-family','font-size','font-weight','font-style','line-height','text-align','text-decoration-line','white-space','overflow-wrap','vertical-align','list-style-type','border-collapse','border-spacing','fill','stroke','stroke-width'];
  const host = document.createElement('div');
  host.id = 'dual-nav-export-host';
  host.hidden = true;
  const shadow = host.attachShadow({mode:'open'});
  shadow.innerHTML = `<style>
    :host{all:initial;position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:45;font:12px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--be-text,#222)}:host([hidden]),[hidden]{display:none!important}
    *{box-sizing:border-box}.copy{position:fixed;display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--be-text,#888);opacity:.65;cursor:pointer;pointer-events:auto;transition:background-color 140ms ease,color 140ms ease,opacity 140ms ease}.copy:hover,.copy:focus-visible{background:var(--be-hover,#0000000c);color:var(--be-hover-text,#333);opacity:1}.copy:focus-visible{outline:2px solid #6b9ce6;outline-offset:2px}.copy[data-state=success],.copy[data-state=error]{opacity:1}.copy[aria-busy=true]{cursor:progress;opacity:.45}
    .copy svg{display:block;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.copy .check-icon{display:none}.copy[data-state=success] .copy-icon{display:none}.copy[data-state=success] .check-icon{display:block;color:#4ade80}.copy[data-state=error]{color:#ef4444}.status{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    @media(prefers-reduced-motion:reduce){.copy{transition:none}}
  </style><button class="copy" type="button" data-state="idle" aria-label="复制图块到 Obsidian"><svg class="copy-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path></svg><svg class="check-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"></path></svg><span class="status" aria-live="polite"></span></button>`;
  document.documentElement.append(host);
  const copy = shadow.querySelector('.copy'), status = shadow.querySelector('.status');
  let current = null, route = adapter.getKey(), frame = 0, hideTimer = 0, feedbackTimer = 0, disposed = false, keyboardFocus = false, copying = false;
  let extensionRuntime = false;
  try {extensionRuntime = !!globalThis.chrome?.runtime?.id;} catch {}
  let enabled = true, settingsRevision = 0;
  let storageChanges = null;
  const resizeObserver = new ResizeObserver(schedulePosition);

  function alive() {
    if (disposed) return false;
    if (!extensionRuntime) return true;
    try {if (globalThis.chrome?.runtime?.id) return true;} catch {}
    disposed = true; lifecycle.abort(); resizeObserver.disconnect(); clearInterval(routeTimer);
    try {storageChanges?.removeListener(onSettingsChanged);} catch {}
    clearTimeout(hideTimer); clearTimeout(feedbackTimer); cancelAnimationFrame(frame); host.remove();
    return false;
  }
  function resetFeedback() {
    copy.dataset.state = 'idle'; copy.setAttribute('aria-label','复制图块到 Obsidian'); status.textContent = '';
  }
  function hide() {
    clearTimeout(hideTimer); clearTimeout(feedbackTimer); resizeObserver.disconnect();
    current = null; host.hidden = true; resetFeedback();
  }
  function setEnabled(value) {
    enabled = value !== false;
    if (!enabled) hide();
  }
  function onSettingsChanged(changes, area) {
    if (area !== 'local' || !changes.blockCopyEnabled || !alive()) return;
    settingsRevision++;
    setEnabled(changes.blockCopyEnabled.newValue);
  }
  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {if (!(keyboardFocus && shadow.activeElement)) hide();},180);
  }
  function opaqueBackground(element) {
    const colors = [];
    for (let node = element; node; node = node.parentElement) {
      colors.push(getComputedStyle(node).backgroundColor);
    }
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0,0,1,1);
    for (const color of colors.reverse()) {context.fillStyle = color; context.fillRect(0,0,1,1);}
    const [r,g,b] = context.getImageData(0,0,1,1).data;
    return `rgb(${r},${g},${b})`;
  }
  function findBlock(target) {
    if (!(target instanceof Element) || target.closest(`${excluded},${hidden}`)) return null;
    const message = target.closest(adapter.selectors.message);
    if (!message || message.closest(adapter.selectors.sidePanel)) return null;
    const role = message.getAttribute('data-message-author-role') || message.getAttribute('data-chatgpt-search-unit-key')?.match(/:(user|assistant)$/)?.[1];
    if (role !== 'assistant') return null;
    const body = message.querySelector(adapter.selectors.body) || message;
    let candidate = null;
    for (let node = target; node && node !== body && body.contains(node); node = node.parentElement) {
      if (!node.matches(blocks) || node.querySelector(unsupported) || !node.textContent.trim()) continue;
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
      if (rect.width < 160 || rect.height < 48 || style.visibility !== 'visible') continue;
      if (node.matches('[data-d-component="grid"],[data-d-has-border]') || !['transparent','rgba(0, 0, 0, 0)'].includes(style.backgroundColor)) candidate = node;
    }
    return candidate;
  }
  function show(block) {
    if (!enabled) return;
    if (block === current) {clearTimeout(hideTimer); return;}
    // Reuse the adapter's route/preview filtering, only when entering a new block.
    const snapshot = adapter.scan();
    if (!snapshot.messages.some(message => message.role === 'assistant' && message.element.contains(block))) return;
    hide(); current = block; route = adapter.getKey();
    if (!host.isConnected) document.documentElement.append(host);
    const dark = getComputedStyle(block).color.match(/[\d.]+/g)?.slice(0,3).map(Number);
    const isDark = dark && dark.reduce((a,b) => a+b,0) > 450;
    host.style.setProperty('--be-text',isDark ? '#aaa' : '#777');
    host.style.setProperty('--be-hover-text',isDark ? '#ddd' : '#333');
    host.style.setProperty('--be-hover',isDark ? '#ffffff0d' : '#0000000c');
    host.hidden = false; resizeObserver.observe(block); position();
  }
  function position() {
    if (!alive() || !current) return;
    if (!current.isConnected || adapter.getKey() !== route || current.closest(hidden)) {hide(); return;}
    const rect = current.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) {hide(); return;}
    const width = copy.offsetWidth, height = copy.offsetHeight;
    copy.style.left = `${Math.max(8,Math.min(rect.right-width-8,innerWidth-width-8))}px`;
    copy.style.top = `${Math.max(8,Math.min(rect.top+8,innerHeight-height-8))}px`;
  }
  function schedulePosition() {
    if (!frame) frame = requestAnimationFrame(() => {frame = 0; position();});
  }
  function escape(value) {
    return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\r/g,'&#13;').replace(/\n/g,'&#10;');
  }
  function exportBlock(block) {
    let count = 0;
    function serialize(node) {
      if (++count > 2500) throw new Error('图块过大');
      if (node.nodeType === Node.TEXT_NODE) return escape(node.textContent);
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const tag = node.localName;
      if (dropTags.has(tag) || node.matches(hidden)) return '';
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return '';
      // The site's down-arrow icon becomes editable text, without an SVG dependency.
      if (tag === 'svg' && node.getAttribute('data-d-component') === 'icon' && node.querySelector('path')?.getAttribute('d')?.startsWith('M12.707 18.707')) {
        return `<span style="display:block;height:16px;font-size:16px;line-height:16px;color:${escape(style.color)};">↓</span>`;
      }
      const content = Array.from(node.childNodes,serialize).join('');
      if (!htmlTags.has(tag) && !svgTags.has(tag)) return content;
      const declarations = [];
      for (const property of cssProperties) {
        let value = style.getPropertyValue(property);
        if (property === 'grid-template-columns' && value !== 'none') {
          // Keep equal columns responsive instead of freezing their computed pixel widths.
          const declared = node.style.gridTemplateColumns;
          if (declared && !/var\(|url\(/i.test(declared)) value = declared;
        }
        if (value && !/url\s*\(|expression\s*\(|@import|var\s*\(/i.test(value)) declarations.push(`${property}:${value}`);
      }
      if (node === block) declarations.push(`width:100%;margin:0;background-color:${opaqueBackground(block)};box-sizing:border-box`);
      let attributes = ` style="${escape(declarations.join(';'))}"`;
      if (tag === 'a') {
        try {
          const href = node.getAttribute('href');
          const url = href ? new URL(href,location.href) : null;
          if (url && ['http:','https:'].includes(url.protocol)) attributes += ` href="${escape(url.href)}"`;
        } catch {}
      }
      if (svgTags.has(tag)) {
        for (const name of svgAttributes) {
          const value = node.getAttribute(name);
          if (value && !/url\s*\(|javascript:|data:/i.test(value)) attributes += ` ${name}="${escape(value)}"`;
        }
        if (tag === 'svg') attributes += ' xmlns="http://www.w3.org/2000/svg"';
      }
      if (['td','th'].includes(tag)) {
        for (const name of ['colspan','rowspan']) if (/^\d{1,3}$/.test(node.getAttribute(name) || '')) attributes += ` ${name}="${node.getAttribute(name)}"`;
      }
      return `<${tag}${attributes}>${['br','hr'].includes(tag) ? '' : `${content}</${tag}>`}`;
    }
    const result = serialize(block);
    if (result.length > 1000000) throw new Error('图块过大');
    return `${result}\n`;
  }
  function feedback(success) {
    clearTimeout(feedbackTimer);
    copy.dataset.state = success ? 'success' : 'error';
    const message = success ? '已复制' : '复制失败';
    copy.setAttribute('aria-label',message); status.textContent = message;
    feedbackTimer = setTimeout(resetFeedback,1400);
  }
  function validTarget() {
    if (!alive() || !enabled || !current?.isConnected || route !== adapter.getKey() || current.closest(hidden)) {hide(); return null;}
    return current;
  }
  async function writeClipboard(text) {
    try {
      if (navigator.clipboard?.writeText) {await navigator.clipboard.writeText(text); return;}
    } catch {}
    // Some page contexts deny the async API even after a user click. The
    // selection-based fallback needs no additional extension permissions.
    const selection = document.getSelection();
    const ranges = selection ? Array.from({length:selection.rangeCount},(_,i) => selection.getRangeAt(i).cloneRange()) : [];
    const focused = shadow.activeElement || document.activeElement;
    const input = document.createElement('textarea');
    input.value = text; input.readOnly = true; input.tabIndex = -1;
    input.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;';
    document.body.append(input);
    let copied = false;
    try {input.select(); copied = document.execCommand('copy');}
    finally {
      input.remove();
      if (focused?.isConnected) focused.focus({preventScroll:true});
      if (selection) {
        selection.removeAllRanges();
        for (const range of ranges) if (range.commonAncestorContainer.isConnected) selection.addRange(range);
      }
    }
    if (!copied) throw new Error('复制失败');
  }
  copy.addEventListener('click',async () => {
    const block = validTarget(); if (!block || copying) return;
    copying = true; copy.setAttribute('aria-busy','true');
    try {
      // Plain text preserves the complete HTML block when pasted into Markdown source.
      await writeClipboard(exportBlock(block));
      if (current === block && alive()) feedback(true);
    } catch {if (current === block && alive()) feedback(false);}
    finally {copying = false; copy.removeAttribute('aria-busy');}
  },options);
  document.addEventListener('pointerover',event => {
    if (!alive() || !enabled) return;
    if (event.composedPath().includes(host)) {clearTimeout(hideTimer); return;}
    if (keyboardFocus && shadow.activeElement) return;
    const block = findBlock(event.target);
    if (block) show(block); else scheduleHide();
  },options);
  document.addEventListener('pointerdown',event => {
    keyboardFocus = false;
    if (!event.composedPath().includes(host) && !current?.contains(event.target)) hide();
  },options);
  document.addEventListener('keydown',event => {
    if (event.key === 'Tab') keyboardFocus = true;
    if (event.key !== 'Escape' || host.hidden) return;
    hide();
  },options);
  document.addEventListener('pointerleave',scheduleHide,options);
  host.addEventListener('pointerleave',scheduleHide,options);
  host.addEventListener('focusout',() => setTimeout(() => {if (!shadow.activeElement) scheduleHide();},0),options);
  document.addEventListener('scroll',schedulePosition,{...options,capture:true,passive:true});
  window.addEventListener('resize',schedulePosition,options);
  const routeTimer = setInterval(() => {if (alive() && current && (!current.isConnected || adapter.getKey() !== route)) hide();},500);
  try {
    const storage = globalThis.chrome?.storage;
    if (storage?.local) {
      enabled = false;
      storageChanges = storage.onChanged;
      storageChanges.addListener(onSettingsChanged);
      const revision = settingsRevision;
      storage.local.get({blockCopyEnabled:true}).then(settings => {
        if (alive() && settingsRevision === revision) setEnabled(settings.blockCopyEnabled);
      }).catch(() => {alive();});
    }
  } catch {if (alive()) setEnabled(false);}
})();
