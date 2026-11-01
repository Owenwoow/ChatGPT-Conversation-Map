(() => {
  'use strict';
  if (document.getElementById('dual-navigator-host')) return;
  const build = '2026-10-31.3';
  console.info(`[Dual Navigator] starting build ${build}`);
  const {adapter, ConversationStore, buildTree} = globalThis.DualNav;
  const store = new ConversationStore();
  const defaults = {leftEnabled:true,rightEnabled:true,autoExpand:true,autoCollapse:false,outlineWidth:'auto'};
  let settings = {...defaults}, snapshot, turns = [], active = null, activeHeading = null;
  let currentKey = '', manualClosed = false, userClosed = false, compact = false, hovering = false, temporaryOpen = false;
  let wasStreaming = false, treeSignature = null, railSignature = null, frame = 0, timer = 0;
  let navigation = 0, targetLock = null, scrollRoot = null, closeTimer = 0;
  let lastRailActive = null, seenRouteMessages = new Map(), routeExclusions = new WeakMap();
  let draftSendAt = 0, explicitNavigation = false;
  let pendingDraftId = null;
  let observedMain = null;
  let nativePanel = null, panelTemporaryOpen = false;
  let sidePanels = [], panelCandidatesDirty = true, layoutFrame = 0;
  const layoutObserver = new ResizeObserver(()=>scheduleLayout());
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const textMetrics = document.createElement('canvas').getContext('2d');
  const branchAnimations = new Map();
  let panelTarget = null, panelAnimation = null, branchNumber = 0;
  let preferredPanelWidth = 280;
  const folded = new Set();
  const host = document.createElement('div');
  host.id = 'dual-navigator-host';
  host.dataset.build = build;
  const shadow = host.attachShadow({mode:'open'});
  shadow.innerHTML = `<style>
    :host{all:initial;position:fixed;inset:0;z-index:40;pointer-events:none;font:12px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--dn-text,#666);--dn-bg:#fff;--dn-text:#777;--dn-strong:#222;--dn-line:#dedede;--dn-hover:#f1f1f1;--dn-shadow:0 5px 24px #0000000d}
    *{box-sizing:border-box}button{font:inherit;color:inherit;border:0;background:none;cursor:pointer;padding:0}button:focus-visible{outline:2px solid var(--dn-text);outline-offset:3px}button:hover{color:var(--dn-strong)}[hidden]{display:none!important}
    .rail{position:fixed;width:30px;max-height:66vh;overflow-y:auto;overflow-x:hidden;scrollbar-width:none;pointer-events:auto;padding:8px 2px;display:flex;flex-direction:column;gap:3px;align-items:center;border-radius:10px}.rail::-webkit-scrollbar{display:none}.tick{height:13px;min-height:7px;width:26px;display:flex;align-items:center;justify-content:flex-start;border-radius:3px;flex-shrink:0}.tick:after{content:"";height:2px;width:9px;background:var(--dn-text);opacity:.37;border-radius:2px;transition:width .16s,opacity .16s}.tick:nth-child(5n):after{width:15px}.tick:hover:after{width:21px;opacity:.8}.tick.active:after{width:23px;opacity:1;background:var(--dn-strong)}
    .preview{pointer-events:auto;position:fixed;width:330px;padding:14px 16px;border:1px solid var(--dn-line);border-radius:16px;background:var(--dn-bg);box-shadow:var(--dn-shadow)}.eyebrow{font-size:10px;letter-spacing:.04em;color:var(--dn-text);margin-bottom:7px}.question{font-size:13px;font-weight:600;color:var(--dn-strong);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.answer{margin:7px 0 0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;color:var(--dn-text);line-height:1.7}
    .toc{position:fixed;width:280px;pointer-events:auto;max-height:calc(100vh - 180px);display:flex;flex-direction:column;transform-origin:top right}.toc[data-state=opening],.toc[data-state=closing]{will-change:opacity,transform}.toc[data-state=closing]{pointer-events:none}.toc.overlay{padding:8px;border:1px solid var(--dn-line);border-radius:12px;background:var(--dn-bg);box-shadow:var(--dn-shadow)}.toc-head{display:flex;justify-content:flex-end;margin-bottom:2px;padding:0 3px}.icon{width:26px;height:26px;border-radius:6px;font-size:18px}.icon:hover{background:var(--dn-hover);color:var(--dn-strong)}.tree{overflow:auto;scrollbar-width:thin;scrollbar-color:var(--dn-line) transparent;overscroll-behavior:contain;padding:3px 3px 10px;min-height:0}.branch{position:relative}.children{margin-left:10px;padding-left:6px;border-left:1px solid var(--dn-line);overflow:hidden}.row{display:flex;align-items:flex-start;margin:2px 0;min-height:29px}.row:hover>.heading,.row.active>.heading{background:var(--dn-hover)}.row.active>.heading{color:var(--dn-strong)}.heading{padding:6px 8px;text-align:left;line-height:1.55;flex:1;min-width:0;border-radius:6px;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.heading:focus-visible{outline-offset:-2px}.disclosure{width:22px;min-width:22px;min-height:29px;padding:6px 0;opacity:.7;font-size:12px;border-radius:5px}.disclosure:hover{background:var(--dn-hover);opacity:1}.chevron{display:block;transition:transform 160ms cubic-bezier(.2,.8,.2,1)}.disclosure[aria-expanded=true] .chevron{transform:rotate(90deg)}.leaf{width:22px;flex-shrink:0}.open{position:fixed;pointer-events:auto;width:30px;height:30px;border-radius:8px;background:var(--dn-bg);color:var(--dn-text);font-size:21px}.open:hover{background:var(--dn-hover)}.icon,.open,.heading,.disclosure{transition:background-color 120ms ease,color 120ms ease,transform 100ms ease}.icon:active,.open:active{transform:scale(.9)}.heading:active{transform:translateX(1px) scale(.985)}.disclosure:active{transform:scale(.92)}.status{position:fixed;bottom:110px;left:50%;transform:translateX(-50%);background:var(--dn-bg);color:var(--dn-strong);padding:10px 16px;border:1px solid var(--dn-line);border-radius:12px;box-shadow:var(--dn-shadow);max-width:min(90vw,420px)}
    @media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}@media(max-width:700px){.preview{width:260px}}
  </style><nav class="rail" aria-label="对话轮次" hidden></nav><aside class="preview" hidden><div class="eyebrow"></div><div class="question"></div><p class="answer"></p></aside><aside class="toc" id="answer-outline" aria-label="当前回答目录" hidden><header class="toc-head"><button class="icon collapse" aria-label="收起目录" title="收起目录">−</button></header><div class="tree"></div></aside><button class="open" aria-label="展开回答目录" aria-controls="answer-outline" aria-expanded="false" title="展开回答目录" hidden>≡</button><div class="status" role="status" hidden></div>`;
  document.documentElement.append(host);
  const $ = selector => shadow.querySelector(selector);
  const rail = $('.rail'), toc = $('.toc'), tree = $('.tree'), preview = $('.preview'), opener = $('.open');
  function button(label, className, fn) {
    const el = document.createElement('button'); el.className = className; el.type='button';
    el.setAttribute('aria-label',label); el.addEventListener('click',fn); return el;
  }
  function notify(message) {
    $('.status').textContent=message; $('.status').hidden=false;
    clearTimeout(notify.timer); notify.timer=setTimeout(()=>{$('.status').hidden=true;},4200);
  }
  function setTocVisible(show, immediate=false) {
    opener.setAttribute('aria-expanded',String(show));
    if(panelTarget===show&&!immediate)return;
    const wasHidden=toc.hidden;
    const visual=wasHidden?null:getComputedStyle(toc);
    const from=visual?{opacity:visual.opacity,transform:visual.transform}:{opacity:0,transform:'translateX(8px) scale(.985)'};
    panelAnimation?.cancel();panelAnimation=null;panelTarget=show;
    toc.inert=!show;toc.setAttribute('aria-hidden',String(!show));
    if(immediate||motionPreference.matches||(!show&&wasHidden)) {
      toc.hidden=!show;toc.dataset.state=show?'open':'closed';return;
    }
    toc.hidden=false;toc.dataset.state=show?'opening':'closing';
    const animation=toc.animate([from,show?{opacity:1,transform:'none'}:{opacity:0,transform:'translateX(6px) scale(.99)'}],{duration:show?180:140,easing:'cubic-bezier(.2,.8,.2,1)',fill:'both'});
    panelAnimation=animation;
    animation.finished.then(()=>{
      if(panelAnimation!==animation)return;
      toc.hidden=!show;toc.dataset.state=show?'open':'closed';panelAnimation=null;animation.cancel();
    }).catch(()=>{});
  }
  function setChildrenExpanded(element, expanded) {
    const wasHidden=element.hidden;
    const fromHeight=wasHidden?0:element.getBoundingClientRect().height;
    const fromOpacity=wasHidden?0:Number(getComputedStyle(element).opacity);
    branchAnimations.get(element)?.cancel();branchAnimations.delete(element);
    element.hidden=false;element.inert=!expanded;element.setAttribute('aria-hidden',String(!expanded));
    const targetHeight=expanded?element.getBoundingClientRect().height:0;
    if(motionPreference.matches||fromHeight===targetHeight) {element.hidden=!expanded;return;}
    const animation=element.animate([{height:`${fromHeight}px`,opacity:fromOpacity},{height:`${targetHeight}px`,opacity:expanded?1:0}],{duration:expanded?180:140,easing:'cubic-bezier(.2,.8,.2,1)',fill:'both'});
    branchAnimations.set(element,animation);
    animation.finished.then(()=>{
      if(branchAnimations.get(element)!==animation)return;
      element.hidden=!expanded;branchAnimations.delete(element);animation.cancel();
    }).catch(()=>{});
  }
  function liveElement(turn) {return turn?.user?.element?.isConnected ? turn.user.element : turn?.assistant?.element?.isConnected ? turn.assistant.element : null;}
  function headings(turn) {return turn?.assistant?.headings || [];}
  function scrollToElement(element) {
    const root=scrollRoot || document.scrollingElement;
    const top=element.getBoundingClientRect().top - (root===document.scrollingElement ? 0 : root.getBoundingClientRect().top) - 90;
    root.scrollBy({top,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }
  function cancelNavigation() {navigation++;targetLock=null;}
  async function navigate(id, headingId) {
    const token=++navigation;
    let turn=turns.find(t=>t.id===id); if(!turn)return;
    active=turn; targetLock={id,until:Date.now()+2400}; render();
    // Recover only through the page's normal scrolling. Never call private endpoints.
    let element=headingId ? headings(turn).find(h=>h.id===headingId)?.element : liveElement(turn);
    if(!element?.isConnected) {
      notify('正在定位历史消息…');
      const originalRoot=scrollRoot, originalTop=scrollRoot?.scrollTop;
      let previousTop=-1, stalls=0;
      for(let step=0;step<36 && token===navigation;step++) {
        if(currentKey!==snapshot.key)break;
        turn=turns.find(t=>t.id===id); if(!turn)break;
        element=headingId ? headings(turn).find(h=>h.id===headingId)?.element : liveElement(turn);
        if(element?.isConnected)break;
        const visible=turns.filter(t=>liveElement(t));
        const nearest=visible.reduce((best,t)=>Math.abs(t.ordinal-turn.ordinal)<Math.abs((best?.ordinal??Infinity)-turn.ordinal)?t:best,null);
        const direction=nearest && nearest.ordinal<turn.ordinal?1:-1;
        const root=scrollRoot;
        if(!root)break;
        root.scrollBy({top:direction*root.clientHeight*.8,behavior:'instant'});
        await new Promise(resolve=>setTimeout(resolve,120));
        if(token!==navigation)return;
        refresh();
        if(root.scrollTop===previousTop)stalls++;else stalls=0;
        previousTop=root.scrollTop;
        if(stalls>5)break;
      }
      if(token!==navigation)return;
      turn=turns.find(t=>t.id===id);
      element=headingId ? headings(turn).find(h=>h.id===headingId)?.element : liveElement(turn);
      if(!element?.isConnected) {
        if(originalRoot?.isConnected && typeof originalTop==='number')originalRoot.scrollTop=originalTop;
        targetLock=null;notify('这条历史消息尚未加载，请向该轮附近滚动后重试。');schedulePosition();return;
      }
    }
    if(token!==navigation)return;
    $('.status').hidden=true; scrollToElement(element); schedulePosition();
  }
  function showPreview(turn, tick) {
    const r=tick.getBoundingClientRect();
    $('.eyebrow').textContent=`第 ${turn.ordinal} 轮${liveElement(turn)?'':' · 暂未加载'}`;
    $('.question').textContent=turn.user?.text?.slice(0,160)||'（无文本提问）';
    $('.answer').textContent=turn.assistant?.text?.slice(0,260)||'等待回答…';
    preview.hidden=false;
    preview.style.left=`${Math.min(r.right+12,innerWidth-preview.offsetWidth-12)}px`;
    preview.style.top=`${Math.max(12,Math.min(r.top-25,innerHeight-preview.offsetHeight-16))}px`;
  }
  function renderRail() {
    const sig=turns.map(t=>t.id).join('|');
    if(sig!==railSignature) {
      railSignature=sig; rail.replaceChildren();
      for(const turn of turns) {
        const tick=button(`第 ${turn.ordinal} 轮：${turn.user?.text?.slice(0,60)||'对话'}`,'tick',()=>navigate(turn.id));
        tick.dataset.id=turn.id;
        tick.addEventListener('mouseenter',()=>showPreview(turns.find(t=>t.id===turn.id)||turn,tick));
        tick.addEventListener('focus',()=>showPreview(turns.find(t=>t.id===turn.id)||turn,tick));
        tick.addEventListener('mouseleave',()=>{preview.hidden=true;});
        tick.addEventListener('blur',()=>{preview.hidden=true;});rail.append(tick);
      }
    }
    for(const tick of rail.children) {
      const isActive=tick.dataset.id===active?.id;
      tick.classList.toggle('active',isActive);
      if(isActive)tick.setAttribute('aria-current','step');else tick.removeAttribute('aria-current');
    }
  }
  function renderTree() {
    const list=headings(active);
    const signature=`${active?.id}|${list.map(h=>`${h.id}:${h.level}:${h.text}`).join('|')}`;
    if(signature!==treeSignature) {
      for(const animation of branchAnimations.values())animation.cancel();branchAnimations.clear();
      treeSignature=signature; tree.replaceChildren();
      const font=getComputedStyle(toc);
      if(textMetrics)textMetrics.font=`${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
      let requiredWidth=0;
      function append(nodes,parent,depth=0) {
        for(const node of nodes) {
          const textWidth=textMetrics?textMetrics.measureText(node.text).width:node.text.length*12;
          requiredWidth=Math.max(requiredWidth,textWidth+62+depth*17);
          const branch=document.createElement('div');branch.className='branch';
          const row=document.createElement('div');row.className='row';row.dataset.id=node.id;
          let children;
          if(node.children.length) {
            const toggle=button(`折叠或展开：${node.text}`,'disclosure',()=>{
              if(folded.has(node.id))folded.delete(node.id);else folded.add(node.id);
              const expanded=!folded.has(node.id);toggle.setAttribute('aria-expanded',String(expanded));toggle.title=expanded?'收起子章节':'展开子章节';
              setChildrenExpanded(children,expanded);highlightHeadings();
            });
            const chevron=document.createElement('span');chevron.className='chevron';chevron.textContent='›';chevron.setAttribute('aria-hidden','true');toggle.append(chevron);
            toggle.setAttribute('aria-expanded',String(!folded.has(node.id)));toggle.title=folded.has(node.id)?'展开子章节':'收起子章节';row.append(toggle);
            children=document.createElement('div');children.id=`dn-branch-${++branchNumber}`;toggle.setAttribute('aria-controls',children.id);
          } else {const spacer=document.createElement('span');spacer.className='leaf';row.append(spacer);}
          const link=button(node.text,'heading',()=>navigate(active.id,node.id));link.textContent=node.text;link.title=node.text;row.append(link);branch.append(row);
          if(node.children.length) {
            children.className='children';children.hidden=folded.has(node.id);children.inert=children.hidden;children.setAttribute('aria-hidden',String(children.hidden));append(node.children,children,depth+1);branch.append(children);
          }
          parent.append(branch);
        }
      }
      append(buildTree(list),tree);
      preferredPanelWidth=Math.min(360,Math.max(280,Math.ceil(requiredWidth)));
    }
    highlightHeadings();
  }
  function highlightHeadings() {
    const list=headings(active).filter(h=>h.element?.isConnected);
    const rootTop=scrollRoot===document.scrollingElement?0:scrollRoot?.getBoundingClientRect().top||0;
    let current=list[0];
    for(const h of list) {if(h.element.getBoundingClientRect().top<=rootTop+145)current=h;else break;}
    activeHeading=current?.id;
    for(const row of tree.querySelectorAll('.row')) {
      const selected=row.dataset.id===activeHeading;row.classList.toggle('active',selected);
      const link=row.querySelector('.heading');if(selected)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');
    }
  }
  function render() {renderRail();renderTree();position();}
  function position() {
    if(!snapshot?.main?.isConnected){rail.hidden=opener.hidden=preview.hidden=true;setTocVisible(false,true);return;}
    const area=adapter.getContentRect(snapshot.main);
    if(!area || !Number.isFinite(area.left))return;
    const mainRect=snapshot.main.getBoundingClientRect();
    if(panelCandidatesDirty){sidePanels=Array.from(document.querySelectorAll(adapter.selectors.sidePanel));panelCandidatesDirty=false;}
    const nextPanel=adapter.getRightPanel(snapshot.main,sidePanels);
    if(nextPanel!==nativePanel){nativePanel=nextPanel;panelTemporaryOpen=false;}
    const leftEdge=Math.max(0,mainRect.left), rightEdge=Math.min(innerWidth,mainRect.right,nativePanel?.getBoundingClientRect().left??Infinity);
    const leftSpace=area.left-leftEdge;
    const rightSpace=rightEdge-area.right;
    const root=scrollRoot||document.scrollingElement;
    rail.hidden=!settings.leftEnabled || turns.length<2 || root.scrollHeight<=root.clientHeight+80 || leftSpace<70;
    if(rail.hidden)preview.hidden=true;
    rail.style.left=`${leftEdge+40}px`;rail.style.top='50%';rail.style.transform='translateY(-50%)';
    rail.style.gap=turns.length>60?'1px':'3px';
    for(const tick of rail.children)tick.style.height=turns.length>60?'8px':'13px';
    if(rail.hidden)lastRailActive=null;
    else if(lastRailActive!==active?.id) {
      const selected=Array.from(rail.children).find(t=>t.dataset.id===active?.id);
      if(selected) {
        if(selected.offsetTop<rail.scrollTop)rail.scrollTop=selected.offsetTop;
        else if(selected.offsetTop+selected.offsetHeight>rail.scrollTop+rail.clientHeight)rail.scrollTop=selected.offsetTop+selected.offsetHeight-rail.clientHeight+8;
      }
      lastRailActive=active?.id;
    }
    const rightInset=Math.min(40,Math.max(12,(rightEdge-leftEdge-260)/2));
    const sideRoom=Math.max(0,rightSpace-rightInset-12);
    compact=sideRoom<240;
    const panelLimit=Math.max(0,rightEdge-leftEdge-rightInset-12);
    const selectedWidth={'narrow':240,'medium':320,'wide':400}[settings.outlineWidth] || preferredPanelWidth;
    const panelWidth=Math.min(selectedWidth,panelLimit,compact?panelLimit:sideRoom);
    toc.style.width=`${panelWidth}px`;
    toc.classList.toggle('overlay',compact);
    const hasHeadings=settings.rightEnabled && headings(active).length>0;
    const canFit=rightEdge-leftEdge>=180;
    // Temporarily yield to native previews without changing the user's normal
    // open/closed preference. An explicit click can open us to their left.
    const closed=manualClosed || (compact&&!temporaryOpen) || (nativePanel&&compact&&!panelTemporaryOpen);
    setTocVisible(hasHeadings&&canFit&&!closed);
    opener.hidden=!hasHeadings||!canFit||!closed;
    toc.style.left=`${rightEdge-panelWidth-rightInset}px`;toc.style.top='100px';
    opener.style.left=`${rightEdge-rightInset-30}px`;opener.style.top='100px';
  }
  function updateActive() {
    if(targetLock && Date.now()<targetLock.until) {
      active=turns.find(t=>t.id===targetLock.id)||active;
    } else {
      targetLock=null;
      const rootTop=scrollRoot===document.scrollingElement?0:scrollRoot?.getBoundingClientRect().top||0;
      let selected=null;
      for(const turn of turns) {
        // The user question selects its corresponding answer before that answer enters view.
        const el=liveElement(turn);if(!el)continue;
        const r=el.getBoundingClientRect();
        if(r.top<=rootTop+160)selected=turn;
        else if(!selected){selected=turn;break;}else break;
      }
      if(selected)active=selected;
    }
    render();
  }
  function schedulePosition(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;updateActive();});}
  function scheduleLayout(){if(!layoutFrame)layoutFrame=requestAnimationFrame(()=>{layoutFrame=0;position();});}
  function theme() {
    const dark=document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme==='dark' || getComputedStyle(document.documentElement).colorScheme==='dark';
    host.style.setProperty('--dn-bg',dark?'#212121':'#fff');
    host.style.setProperty('--dn-text',dark?'#929292':'#828282');
    host.style.setProperty('--dn-strong',dark?'#ececec':'#252525');
    host.style.setProperty('--dn-line',dark?'#3c3c3c':'#e4e4e4');
    host.style.setProperty('--dn-hover',dark?'#ffffff0e':'#00000007');
  }
  function refresh() {
    clearTimeout(timer);timer=0;
    if(explicitNavigation || (currentKey&&!adapter.isDraftKey(currentKey)&&adapter.getKey()!==currentKey))pendingDraftId=null;
    snapshot=adapter.scan({draftId:pendingDraftId,allowDraft:!!currentKey&&adapter.isDraftKey(currentKey)&&!explicitNavigation});
    if(snapshot.main!==observedMain) {
      layoutObserver.disconnect();observedMain=snapshot.main;
      if(observedMain) {
        layoutObserver.observe(observedMain);
        const column=observedMain.querySelector(adapter.selectors.contentColumn);
        if(column)layoutObserver.observe(column);
      }
    }
    const pathChanged=snapshot.key!==currentKey;
    // Sending the first message promotes the same mounted draft into /c/<id>.
    // Preserve it; it is not a switch to a different conversation.
    if(currentKey && adapter.isDraftKey(currentKey) && snapshot.key.includes('/c/') && !explicitNavigation &&
        (snapshot.draftId || Date.now()-draftSendAt<15000 || snapshot.messages.some(m=>seenRouteMessages.has(m.element)))) {
      currentKey=snapshot.key;store.key=currentKey;
    }
    if(snapshot.key!==currentKey) {
      // A SPA can update its URL while the old conversation is still mounted.
      // Do not mistake that old DOM for virtualized history of the new route.
      routeExclusions=new WeakMap(seenRouteMessages);seenRouteMessages=new Map();
      currentKey=snapshot.key;store.reset(currentKey);active=null;folded.clear();
      manualClosed=false;userClosed=false;temporaryOpen=false;wasStreaming=false;treeSignature=railSignature=null;cancelNavigation();
      nativePanel=null;panelTemporaryOpen=false;
      pendingDraftId=null;
      setTocVisible(false,true);
      clearTimeout(closeTimer);hovering=false;
      preview.hidden=true;
    }
    if(pathChanged){explicitNavigation=false;draftSendAt=0;}
    if(snapshot.draftId)pendingDraftId=snapshot.draftId;
    else if(snapshot.routeConfirmed)pendingDraftId=null;
    if(snapshot.routeConfirmed)routeExclusions=new WeakMap();
    snapshot={...snapshot,messages:snapshot.messages.filter(m=>routeExclusions.get(m.element)!==`${m.id}\n${m.text}`)};
    for(const message of snapshot.messages)seenRouteMessages.set(message.element,`${message.id}\n${message.text}`);
    turns=store.update(snapshot);
    const nextRoot=snapshot.scrollRoot||document.scrollingElement;
    if(nextRoot!==scrollRoot){scrollRoot?.removeEventListener('scroll',schedulePosition);scrollRoot=nextRoot;scrollRoot?.addEventListener('scroll',schedulePosition,{passive:true});}
    if(snapshot.streaming&&!wasStreaming&&settings.autoExpand&&!userClosed){manualClosed=false;}
    wasStreaming=snapshot.streaming;
    if(active)active=turns.find(t=>t.id===active.id)||null;
    theme();updateActive();
  }
  function scheduleScan(){if(!timer)timer=setTimeout(refresh,180);}
  function scheduleAutoClose() {
    clearTimeout(closeTimer);
    if(settings.autoCollapse&&!temporaryOpen&&!hovering)closeTimer=setTimeout(()=>{
      if(settings.autoCollapse&&!hovering&&!temporaryOpen&&!toc.matches(':focus-within')){manualClosed=true;position();}
    },650);
  }
  $('.collapse').addEventListener('click',()=>{manualClosed=true;userClosed=true;temporaryOpen=false;panelTemporaryOpen=false;position();opener.focus({preventScroll:true});});
  opener.addEventListener('click',()=>{
    manualClosed=false;userClosed=false;temporaryOpen=true;panelTemporaryOpen=true;clearTimeout(closeTimer);position();$('.collapse').focus({preventScroll:true});
  });
  toc.addEventListener('mouseenter',()=>{hovering=true;clearTimeout(closeTimer);});
  toc.addEventListener('mouseleave',()=>{hovering=false;scheduleAutoClose();});
  toc.addEventListener('focusin',()=>clearTimeout(closeTimer));
  toc.addEventListener('focusout',e=>{if(!toc.contains(e.relatedTarget))scheduleAutoClose();});
  motionPreference.addEventListener('change',()=>{
    if(!motionPreference.matches)return;
    setTocVisible(panelTarget===true,true);
    for(const animation of branchAnimations.values())animation.finish();
  });
  rail.addEventListener('scroll',()=>{preview.hidden=true;},{passive:true});
  window.addEventListener('scroll',()=>{preview.hidden=true;schedulePosition();},{passive:true,capture:true});
  window.addEventListener('resize',()=>{scheduleScan();schedulePosition();},{passive:true});
  window.addEventListener('wheel',cancelNavigation,{passive:true});
  window.addEventListener('touchstart',cancelNavigation,{passive:true});
  window.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&adapter.isComposer(e.target)){draftSendAt=Date.now();explicitNavigation=false;}
    if(['PageDown','PageUp','ArrowDown','ArrowUp','Home','End'].includes(e.key))cancelNavigation();
    if(e.key==='Escape'){
      const inside=toc.matches(':focus-within')||shadow.activeElement===opener;
      preview.hidden=true;
      // Let Escape close a focused native preview without recording a manual
      // TOC collapse; its previous visibility should return with the page.
      if(!nativePanel||inside){manualClosed=true;userClosed=true;temporaryOpen=false;panelTemporaryOpen=false;position();if(inside&&!opener.hidden)opener.focus({preventScroll:true});}
    }
  },true);
  document.addEventListener('click',e=>{
    if(adapter.isSendButton(e.target)){draftSendAt=Date.now();explicitNavigation=false;}
    const href=e.target.closest?.('a[href]')?.href;
    if(href){const url=new URL(href,location.href);if(url.origin===location.origin&&url.pathname!==currentKey)explicitNavigation=true;}
  },true);
  new MutationObserver(records=>{
    // A page hydration/recovery can remove nodes outside body or replace body.
    // Keep the original host and listeners, then scan the current page again.
    let needsScan=!host.isConnected, needsLayout=false;
    if(needsScan) {
      document.documentElement.append(host);
      console.info(`[Dual Navigator] restored host (build ${build})`);
    }
    const roots=`${adapter.selectors.main}, ${adapter.selectors.conversation}, ${adapter.selectors.message}, ${adapter.selectors.turn}, ${adapter.selectors.contentColumn}`;
    for(const record of records) {
      if(record.target===host||host.contains(record.target))continue;
      const target=record.target.nodeType===Node.ELEMENT_NODE?record.target:record.target.parentElement;
      if(!target)continue;
      if(record.type==='attributes'&&['role','data-testid','data-summary-panel-variant'].includes(record.attributeName))panelCandidatesDirty=true;
      // Preview streaming and animation affect only geometry, never chat data.
      if(target.closest(adapter.selectors.sidePanel)){needsLayout=true;continue;}
      if(record.type==='attributes') {
        needsLayout=true;
        if(['class','style'].includes(record.attributeName)) {
          if(target.matches(adapter.selectors.main)||target.querySelector(adapter.selectors.main)||
              (record.attributeName==='class'&&target.matches(adapter.selectors.message)))needsScan=true;
        } else if(target.closest(adapter.selectors.main)||target.querySelector(adapter.selectors.main))needsScan=true;
      } else if(record.type==='characterData') {
        if(target.closest(adapter.selectors.main))needsScan=true;
      } else {
        const nodes=[...record.addedNodes,...record.removedNodes].filter(node=>node!==host);
        if(!nodes.length)continue;
        if(nodes.some(node=>node.nodeType===Node.ELEMENT_NODE&&
            (node.matches(adapter.selectors.sidePanel)||node.querySelector(adapter.selectors.sidePanel))))panelCandidatesDirty=true;
        needsLayout=true;
        if(nodes.every(node=>node.nodeType===Node.ELEMENT_NODE&&node.matches(adapter.selectors.sidePanel)))continue;
        if(target.closest(adapter.selectors.main)||nodes.some(node=>node.nodeType===Node.ELEMENT_NODE&&
            (node.matches(roots)||node.querySelector(roots))))needsScan=true;
      }
    }
    if(needsScan)scheduleScan();
    if(needsLayout)scheduleLayout();
  }).observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','inert','aria-hidden','role','data-d-component','data-d-has-border','data-d-tabular-nums','data-summary-panel-variant','data-chatgpt-conversation-selection-target','data-message-author-role','data-message-id','data-chatgpt-search-unit-key','data-chatgpt-search-message-ids','data-markdown-text-style','data-is-streaming','data-testid','data-thread-user-message-navigation-content']});
  new MutationObserver(()=>{theme();scheduleLayout();}).observe(document.documentElement,{attributes:true,attributeFilter:['class','data-theme','style']});
  // popstate does not cover pushState from the isolated content-script world.
  window.addEventListener('popstate',()=>{explicitNavigation=true;refresh();});
  setInterval(()=>{if(adapter.getKey()!==currentKey) scheduleScan();},800);
  if(globalThis.chrome?.storage) {
    chrome.storage.local.get(defaults).then(value=>{settings={...defaults,...value};scheduleScan();}).catch(()=>{});
    chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local')return;for(const key of Object.keys(defaults))if(changes[key])settings[key]=changes[key].newValue??defaults[key];scheduleScan();});
  }
  refresh();
})();
