const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');

async function blockExportScenario(page,popup) {
 const errors=[];
 const onError=error=>errors.push(error.message);
 page.on('pageerror',onError);
 try {
  await page.goto('https://chatgpt.com/c/block-export');
  // Reproduce the live page's semantic components without loading private data.
  await page.evaluate(()=>{
   document.documentElement.classList.add('dark');
   document.querySelector('#thread').innerHTML=`<article data-testid="conversation-turn-0"><div data-message-author-role="user" data-message-id="export-user"><div id="user-card" data-d-component="box" data-d-has-border style="border:1px solid #777;padding:20px">用户消息卡片不应显示复制入口</div></div></article><article data-testid="conversation-turn-1"><div data-message-author-role="assistant" data-message-id="export-answer"><div class="markdown"><h2>2. TUN 实际运行效果</h2><p id="ordinary">普通正文不应出现图块复制入口。</p><div id="export-chart" class="site-only" data-d-component="box" data-d-has-border style="display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid #444;border-radius:12px;font:16px/26px system-ui;color:#ededed;--card-blue:rgba(59,130,246,.1)" onclick="window.unwantedClick=true"><div data-d-component="box" style="display:flex;flex-direction:column;align-items:center;padding:12px;border-radius:8px;background:var(--card-blue)"><p style="margin:0;font-weight:600">Windows TUN 虚拟网卡</p><p style="margin:0;font-size:12px;color:#aaa;line-height:16px">接管应用程序网络流量</p></div><svg data-d-component="icon" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor"><path d="M12.707 18.707a1 1 0 0 1-1.414 0l-5-5a1 1 0 1 1 1.414-1.414L11 15.586V6a1 1 0 1 1 2 0v9.586l3.293-3.293a1 1 0 0 1 1.414 1.414l-5 5Z"></path></svg><div data-d-component="box" data-d-has-border style="display:flex;flex-direction:column;align-items:center;padding:12px;border:1px solid #444;border-radius:8px"><p style="margin:0;font-weight:600">v2rayN 路由引擎</p><p style="margin:0;font-size:12px;line-height:16px;color:#aaa">识别域名、IP、进程</p></div><div data-d-component="grid" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px"><div id="inner-card" data-d-component="box" style="display:flex;flex-direction:column;align-items:center;padding:8px;border-radius:8px;background:rgba(22,163,74,.1)"><p>指定服务</p><span>↓</span><p>HOME</p></div><div data-d-component="box" style="padding:8px;text-align:center;border-radius:8px;background:var(--card-blue)"><p>其他外网</p><span>↓</span><p>代理</p></div><div data-d-component="box" style="padding:8px;text-align:center;border-radius:8px;background:rgba(100,116,139,.1)"><p>国内服务</p><span>↓</span><p>直连</p></div></div></div><p>图块后面的说明不属于复制范围。</p><div id="second-card" data-d-component="box" data-d-has-border style="border:1px solid #555;border-radius:8px;padding:20px;background:#252525"><p>第二张独立卡片</p></div><div id="interactive-card" data-d-component="box" data-d-has-border style="border:1px solid #555;padding:20px"><p>交互表单不应复制</p><input value="不能导出"><button>提交</button></div><pre><code><div id="code-card" data-d-component="box" data-d-has-border style="padding:20px;border:1px solid">代码内的仿制卡片</div></code></pre></div></div></article>`;
   const style=document.createElement('style');
   style.textContent='#export-chart p{margin:0} #export-chart [data-d-component="grid"]>div{display:flex;flex-direction:column;align-items:center;gap:4px} .thread{padding-bottom:120px}';document.head.append(style);
   const panel=document.createElement('aside');panel.id='export-preview';panel.hidden=true;panel.innerHTML='<div data-chatgpt-search-unit-key="preview:0:assistant"><div id="preview-card" data-d-component="box" data-d-has-border style="padding:20px;border:1px solid">原生侧边预览卡片</div></div>';document.body.append(panel);
  });
  const host=page.locator('#dual-nav-export-host');
  const copy=host.locator('.copy');
  const chart=page.locator('#export-chart');
  await expect(host).toHaveCount(1);await expect(host).toBeHidden();
  await page.locator('#ordinary').hover();await expect(host).toBeHidden();
  await page.locator('#user-card').hover();await expect(host).toBeHidden();
  const before=await chart.boundingBox();
  await page.locator('#inner-card p').first().hover();await expect(copy).toBeVisible();
  if (popup) {
   assert.deepEqual(await popup.locator('body').evaluate(el=>({width:el.offsetWidth,height:el.offsetHeight})),{width:392,height:560});
   await popup.locator('main').hover();await popup.mouse.wheel(0,500);
   await expect.poll(()=>popup.locator('main').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
   await expect(popup.locator('#blockCopyEnabled')).toBeChecked();
   await popup.locator('#blockCopyEnabled').uncheck();await expect(host).toBeHidden();
   await page.locator('#inner-card p').first().hover();await expect(host).toBeHidden();
   await popup.reload();await expect(popup.locator('#blockCopyEnabled')).not.toBeChecked();
   await popup.locator('#blockCopyEnabled').check();
   await page.locator('#ordinary').hover();await page.locator('#inner-card p').first().hover();await expect(copy).toBeVisible();
   console.log('PASS 固定尺寸设置页内部滚动、图块复制开关即时生效及刷新保存');
  }
  assert.deepEqual(await chart.boundingBox(),before,'悬停入口不得挤动图块布局');
  await expect(host.locator('.outline,.toolbar,.more,.menu')).toHaveCount(0);
  await expect(copy.locator('.copy-icon')).toBeVisible();
  await copy.hover();await expect(copy).toBeVisible();
  await copy.click();await expect(copy).toHaveAttribute('data-state','success');
  await expect(copy.locator('.copy-icon')).toBeHidden();await expect(copy.locator('.check-icon')).toBeVisible();
  await page.context().grantPermissions(['clipboard-read'],{origin:'https://chatgpt.com'});
  const copied=await page.evaluate(()=>navigator.clipboard.readText());
  assert(copied.includes('Windows TUN 虚拟网卡')&&copied.includes('HOME')&&copied.includes('国内服务'));
  assert(!copied.includes('普通正文')&&!copied.includes('图块后面的说明')&&!copied.includes('第二张独立卡片'));
  assert(!/class=|data-d-|onclick=|var\(/i.test(copied),'不应依赖网页类名、变量或携带事件');
  assert(copied.includes('↓'),'SVG 下箭头应保留');
  assert(!copied.trim().includes('\n\n'),'HTML 块内部不得出现空行');
  await expect(copy).toHaveAttribute('data-state','idle');
  await page.mouse.move(10,70);await expect(host).toBeHidden();
  await page.locator('#second-card').hover();await expect(copy).toBeVisible();
  await copy.click();await expect(copy).toHaveAttribute('data-state','success');
  assert((await page.evaluate(()=>navigator.clipboard.readText())).includes('第二张独立卡片'));
  console.log('PASS 图块悬停、外层范围识别、无布局位移、图标复制与成功对勾');

  await page.mouse.move(10,70);await expect(host).toBeHidden();
  await page.locator('#inner-card p').first().hover();
  await copy.focus();await copy.press('Enter');await expect(copy).toHaveAttribute('data-state','success');
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),copied);
  // Render exported markup in an independent document without the site's CSS.
  const rendered=await page.context().newPage();
  await rendered.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:24px">${copied}</body>`);
  const standalone=await rendered.locator('body>div').evaluate(el=>({text:el.textContent,bg:getComputedStyle(el).backgroundColor,grid:[...el.querySelectorAll('div')].some(n=>getComputedStyle(n).display==='grid'),arrows:el.textContent.match(/↓/g)?.length}));
  assert(standalone.text.includes('v2rayN 路由引擎'));assert.equal(standalone.grid,true);assert.equal(standalone.arrows,4);assert.notEqual(standalone.bg,'rgba(0, 0, 0, 0)');
  const artifactDir=path.resolve(__dirname,'../artifacts');await fs.mkdir(artifactDir,{recursive:true});
  await rendered.screenshot({path:path.join(artifactDir,'block-export-rendered.png')});await rendered.close();
  await page.keyboard.press('Escape');await expect(host).toBeHidden();
  console.log('PASS 键盘复制、独立样式渲染与 SVG 箭头保留');

  await page.evaluate(()=>{
   const chart=document.querySelector('#export-chart');
   chart.insertAdjacentHTML('beforeend','<p id="safety-text">导出安全检查 <a href="javascript:alert(1)" onmouseover="window.badLink=true">危险链接</a><a href="https://example.com/reference">正常引用</a></p><script>不应导出的脚本</script><span hidden>隐藏的内容</span><svg viewBox="0 0 24 24" width="24" height="24" onload="window.badSvg=true"><rect width="10" height="10" fill="red"></rect><script>不应导出的 SVG 脚本</script></svg>');
   chart.querySelector('#safety-text').append(document.createTextNode('\n\n保留多行文本'));
  });
  await page.locator('#safety-text').hover();await copy.click();await expect(copy).toHaveAttribute('data-state','success');
  const safe=await page.evaluate(()=>navigator.clipboard.readText());
  assert(!/<script|javascript:|onload=|onmouseover=|隐藏的内容|不应导出/.test(safe));
  assert(safe.includes('href="https://example.com/reference"'));assert(safe.includes('<rect'));
  assert(!safe.trim().includes('\n\n'));
  console.log('PASS 导出过滤脚本、事件、危险链接和隐藏内容，保留普通引用与静态 SVG');

  // Failure must not show the success checkmark.
  if (!popup) {
   await page.evaluate(()=>{
    Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:()=>Promise.reject(new Error('模拟剪贴板拒绝'))});
    window.originalExecCommand=document.execCommand;
    document.execCommand=()=>false;
   });
   await copy.click();await expect(copy).toHaveAttribute('data-state','error');
   await expect(copy).toHaveAttribute('aria-label','复制失败');await expect(copy.locator('.check-icon')).toBeHidden();
   await page.evaluate(()=>{delete navigator.clipboard.writeText;document.execCommand=window.originalExecCommand;delete window.originalExecCommand;});
  }
  await page.keyboard.press('Escape');
  await page.locator('#interactive-card p').hover();await expect(host).toBeHidden();
  await page.locator('#code-card').hover();await expect(host).toBeHidden();
  await page.evaluate(()=>{const panel=document.querySelector('#export-preview');panel.hidden=false;panel.style.cssText='position:fixed;right:0;top:0;background:#222;z-index:50';});
  await page.locator('#preview-card').hover();await expect(host).toBeHidden();
  await page.evaluate(()=>document.querySelector('#export-preview').remove());
  await page.locator('#inner-card p').first().hover();await expect(copy).toBeVisible();
  await page.evaluate(()=>history.pushState({},'','/c/block-export-next'));await expect(host).toBeHidden();
  await page.locator('#second-card').hover();await expect(copy).toBeVisible();
  await page.evaluate(()=>document.querySelector('#second-card').remove());await expect(host).toBeHidden();
  console.log('PASS 剪贴板失败反馈、交互表单/代码/侧栏排除、切换会话与虚拟化清理');

  await page.evaluate(()=>{
   const old=document.querySelector('[data-message-author-role="assistant"]');
   old.removeAttribute('data-message-author-role');old.dataset.chatgptSearchUnitKey='fallback-turn-0:0:assistant';
   const body=old.querySelector('.markdown');body.className='';body.dataset.markdownTextStyle='assistant-message';
  });
  await page.setViewportSize({width:400,height:800});
  await page.evaluate(()=>{document.querySelector('main').style.marginLeft='0';document.querySelector('.sidebar').hidden=true;document.querySelector('.composer').hidden=true;});
  await page.locator('#inner-card p').first().hover();await expect(copy).toBeVisible();
  const copyBox=await copy.boundingBox();assert(copyBox.x>=0&&copyBox.x+copyBox.width<=400);
  await page.evaluate(()=>document.documentElement.classList.remove('dark'));await copy.click();await expect(copy).toHaveAttribute('data-state','success');
  await page.setViewportSize({width:1600,height:1000});
  await page.evaluate(()=>{document.querySelector('main').style.marginLeft='';document.querySelector('.sidebar').hidden=false;document.documentElement.classList.add('dark');});
  await page.keyboard.press('Escape');await page.locator('#inner-card p').first().hover();await expect(copy).toBeVisible();
  await page.screenshot({path:path.resolve(__dirname,'../artifacts/block-export-ui.png')});
  console.log('PASS 新版 search-unit 结构、深浅色与窄屏入口定位');

  await page.keyboard.press('Escape');
  await page.route('https://images.example.test/**', route=>route.fulfill({
   contentType:'image/svg+xml', body:'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="16"><rect width="20" height="16"/></svg>'
  }));
  await page.evaluate(()=>{
   document.querySelector('[data-markdown-text-style="assistant-message"]').insertAdjacentHTML('beforeend',`<div data-dil-response>
    <div id="products" data-d-component="grid" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
     <div data-d-component="box" data-d-has-border>
      <div data-d-component="image"><img src="https://images.example.test/coffee.svg" alt="咖啡 &amp; 牛奶" style="aspect-ratio:5/4;width:100%" onload="void 0">
       <button id="image-trigger" data-d-component="pressable">打开图片</button><div data-saved><button>收藏图片</button></div>
      </div><p>咖啡 ¥28</p>
     </div>
     <div data-d-component="box" data-d-has-border><img src="https://images.example.test/cake.svg" alt="甜点"><p>甜点 ¥32</p></div>
    </div>
    <div id="chart-download" data-d-component="box" data-d-has-border style="padding:24px"><p>带原生下载的图表</p><div data-chart-widget-download-exclude hidden></div></div>
    <div id="link-download" data-d-component="box" data-d-has-border style="padding:24px"><p>带下载链接的卡片</p><a href="/sample.csv" download>下载数据</a></div>
    <div id="plan-card" data-d-component="box" data-d-has-border style="display:flex;flex-direction:column;gap:8px;border:1px solid;padding:12px">
     <p><strong>计划记录</strong></p>
     <div id="plan-grid" data-d-component="grid" style="display:grid;grid-template-columns:1fr 1fr;padding:12px">
      <div><p>已完成 30 项</p><p>每日 30 分钟</p></div><div><p>周期 45 天</p><p>截止 12 月 20 日</p></div>
     </div>
     <span>备注：来源见附件 <span data-d-component="popover-trigger" data-d-inline data-d-inline-text role="button" aria-haspopup="dialog" tabindex="0"><span>plan.json</span></span></span>
    </div>
    <p>外部说明不应被复制</p>
    <div id="custom-control-card" data-d-component="box" data-d-has-border style="padding:24px"><p>交互卡片</p><span role="button" tabindex="0">切换计划</span></div>
   </div>`);
  });
  await page.locator('#image-trigger').hover();await expect(copy).toBeVisible();
  await copy.click();await expect(copy).toHaveAttribute('data-state','success');
  const products=await page.evaluate(()=>navigator.clipboard.readText());
  assert.match(products,/src="https:\/\/images\.example\.test\/coffee\.svg" alt="咖啡 &amp; 牛奶"/);
  assert.match(products,/src="https:\/\/images\.example\.test\/cake\.svg"/);
  assert.match(products,/aspect-ratio:5 \/ 4/);
  assert(products.includes('咖啡 ¥28')&&products.includes('甜点 ¥32'));
  assert(!/<button|onload=|收藏图片|打开图片|带原生下载的图表/.test(products));
  for(const id of ['chart-download','link-download']) {
   await page.locator(`#${id} p`).hover();await expect(host).toBeHidden();
  }
  console.log('PASS 商品图文整组 HTML 复制，过滤图片控件及已有官方下载的组件');

  // ChatGPT may save the URL while the visible transcript still has a local marker.
  await page.evaluate(()=>{
   document.querySelector('#thread').dataset.chatgptConversationSelectionTarget='other-saved-conversation';
  });
  await page.locator('#plan-grid p').first().hover();await expect(host).toBeHidden();
  await page.evaluate(()=>{
   document.querySelector('#thread').dataset.chatgptConversationSelectionTarget='local-chatgpt:live-draft';
  });
  await page.mouse.move(10,70);
  await page.locator('#plan-grid p').first().hover();await expect(copy).toBeVisible();
  const planBounds=await page.locator('#plan-card').boundingBox();
  const planCopyBounds=await copy.boundingBox();
  assert(Math.abs(planCopyBounds.y-planBounds.y-8)<1,'复制按钮应锚定外框顶部');
  assert(Math.abs(planBounds.x+planBounds.width-planCopyBounds.x-planCopyBounds.width-8)<1,'复制按钮应锚定外框右侧');
  await copy.click();await expect(copy).toHaveAttribute('data-state','success');
  const plan=await page.evaluate(()=>navigator.clipboard.readText());
  for(const text of ['计划记录','已完成 30 项','周期 45 天','备注：来源见附件','plan.json'])assert(plan.includes(text));
  assert(!/外部说明不应被复制|role=|aria-haspopup=|tabindex=/.test(plan));
  await page.locator('#custom-control-card p').hover();await expect(host).toBeHidden();
  await page.evaluate(()=>document.querySelector('#thread').removeAttribute('data-chatgpt-conversation-selection-target'));
  console.log('PASS 保存后的临时标记支持整框复制，其他已保存会话标记仍排除');

  await page.evaluate(()=>{
   const response=document.querySelector('[data-dil-response]');
   response.insertAdjacentHTML('beforeend',`<div id="study-card" data-d-component="box" data-d-has-border style="display:flex;flex-direction:column;border:1px solid;padding:12px;gap:12px">
    <div style="display:flex;align-items:center;gap:12px">
     <div data-d-has-width data-d-has-height style="display:flex;align-items:center;justify-content:center;width:48px;height:48px;flex-shrink:0;border-radius:12px;background-color:#e8f1ff">
      <svg width="20" height="20" viewBox="0 0 20 20"><path d="M3 3h14v14H3z" fill="#2673c9"/></svg>
     </div>
     <div style="flex:1 1 0%;min-width:0"><p style="margin:0">单词：每天都做</p><p style="margin:0">记忆基础，解决认识和理解词汇的问题。</p></div>
     <strong style="white-space:nowrap">15–20m</strong>
    </div>
    <div data-d-component="divider" style="--divider-size:1px;height:var(--divider-size);padding:8px 0;box-sizing:content-box;background-color:#333;background-clip:content-box"></div>
    <div style="display:flex;align-items:center;gap:12px">
     <div data-d-has-width data-d-has-height style="--icon-size:48px;display:grid;place-content:center;width:var(--icon-size);height:var(--icon-size);flex-shrink:0;border-radius:12px;background-color:#eaf5ec">读</div>
     <p style="margin:0">阅读：每周 2–3 次</p>
    </div>
   </div>`);
  });
  await page.locator('#study-card p').first().hover();await expect(copy).toBeVisible();
  await copy.click();await expect(copy).toHaveAttribute('data-state','success');
  const study=await page.evaluate(()=>navigator.clipboard.readText());
  const note=await page.context().newPage();
  try {
   await note.setContent(`<!doctype html><meta charset="utf-8"><style>body{margin:0;font:20px/1.8 system-ui}</style><main style="width:600px">${study}</main>`);
   for(const width of [600,320]) {
    await note.locator('main').evaluate((el,width)=>el.style.width=`${width}px`,width);
    const layout=await note.locator('main > div').evaluate(card=>{
     const [words,divider,reading]=card.children;
     const size=el=>[el.offsetWidth,el.offsetHeight];
     const style=getComputedStyle(divider);
     return {cardWidth:card.offsetWidth,rowWidth:words.offsetWidth,icons:[size(words.firstElementChild),size(reading.firstElementChild)],
      lineWidth:divider.offsetWidth,lineHeight:style.height,lineBoxHeight:divider.offsetHeight,lineClip:style.backgroundClip};
    });
    assert.deepEqual(layout,{cardWidth:width,rowWidth:width-26,icons:[[48,48],[48,48]],lineWidth:width-26,lineHeight:'1px',lineBoxHeight:17,lineClip:'content-box'});
   }
  } finally {await note.close();}
  console.log('PASS 导出后图标保持固定尺寸，分隔线留白透明，卡片宽度随阅读容器变化');

  if (popup) {
   const readyPopup=await require('./context-reload-scenario.cjs').reloadExtension(page,popup);
   await expect(host).toHaveCount(0);
   await page.reload();await expect(host).toHaveCount(1);
   console.log('PASS MV3 隔离环境下真实复制、扩展重载后旧模块退出及刷新恢复');
   assert.deepEqual(errors,[],'图块导出不应产生页面异常');
   return readyPopup;
  }
  assert.deepEqual(errors,[],'图块导出不应产生页面异常');
 } finally {page.off('pageerror',onError);}
}

module.exports=blockExportScenario;
if (require.main===module) (async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const context=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.route('https://chatgpt.com/**',route=>route.fulfill({path:path.join(__dirname,'fixture.html'),contentType:'text/html'}));
  const sources=await Promise.all(['adapter','block-export'].map(name=>fs.readFile(path.resolve(__dirname,`../src/${name}.js`),'utf8')));
  await page.addInitScript({content:`document.addEventListener('DOMContentLoaded', () => {\n${sources.join('\n')}\n}, {once:true});`});
  await blockExportScenario(page);
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
