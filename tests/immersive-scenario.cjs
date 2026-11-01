const {expect}=require('@playwright/test');

module.exports=async function immersiveScenario(page,popup) {
 const ticks=page.locator('#dual-navigator-host').locator('.tick');
 await expect(popup.locator('#immersiveMode')).not.toBeChecked();
 await page.goto('https://chatgpt.com/c/immersive-setup');
 await page.evaluate(()=>{
   const button=document.createElement('button');button.id='native-sidebar-toggle';
   button.type='button';button.dataset.appShellSidebarTrigger='true';
   button.setAttribute('aria-controls','app-shell-sidebar');button.setAttribute('aria-expanded','true');
   button.style.cssText='position:fixed;left:0;top:0;width:40px;height:40px;z-index:100';
   button.addEventListener('click',()=>button.setAttribute('aria-expanded',String(button.getAttribute('aria-expanded')!=='true')));
   document.body.append(button);
   const form=document.createElement('form');form.dataset.chatgptComposer='';
   form.style.cssText='position:fixed;left:300px;top:0;z-index:100';
   form.innerHTML='<div contenteditable="true" role="textbox" aria-label="测试输入" style="width:150px;height:30px"></div><button type="submit" data-testid="send-button">发送</button>';
   form.addEventListener('submit',event=>event.preventDefault());document.body.append(form);
 });
 const sidebar=page.locator('#native-sidebar-toggle'), composer=page.getByRole('textbox',{name:'测试输入'}), send=page.getByTestId('send-button');
 async function draft() {
   await page.evaluate(()=>{history.pushState({},'','/');const thread=document.querySelector('#thread');thread.replaceChildren();thread.removeAttribute('data-chatgpt-conversation-selection-target');});
   await expect(ticks).toHaveCount(0);
 }
 async function addFirst(url) {
   await page.evaluate(value=>{addTurn(0,'<h2>首个回答</h2>');history.pushState({},'',value);},url);
 }
 await draft();await send.click();await addFirst('/c/immersive-disabled');
 await expect(ticks).toHaveCount(1);await expect(sidebar).toHaveAttribute('aria-expanded','true');
 await popup.locator('#immersiveMode').check();await popup.reload();await expect(popup.locator('#immersiveMode')).toBeChecked();
 await draft();await composer.focus();await composer.press('Shift+Enter');
 await expect(sidebar).toHaveAttribute('aria-expanded','true');
 await composer.press('Enter');await page.waitForTimeout(400);await expect(sidebar).toHaveAttribute('aria-expanded','true');
 await addFirst('/c/immersive-first');await expect(sidebar).toHaveAttribute('aria-expanded','false');
 await sidebar.click();await page.evaluate(()=>addTurn(1,'<h2>继续提问</h2>'));
 await expect(ticks).toHaveCount(2);await expect(sidebar).toHaveAttribute('aria-expanded','true');
 await send.click();await page.evaluate(()=>addTurn(2,'<h2>历史对话继续提问</h2>'));
 await expect(ticks).toHaveCount(3);await expect(sidebar).toHaveAttribute('aria-expanded','false');
 // Existing messages and answer mutations cannot confirm another successful send.
 await sidebar.click();await send.click();
 await page.evaluate(()=>document.querySelector('#thread .markdown').insertAdjacentHTML('beforeend','<p>旧回答继续渲染</p>'));
 await page.waitForTimeout(500);await expect(sidebar).toHaveAttribute('aria-expanded','true');
 await page.evaluate(()=>{
   const thread=document.querySelector('#thread');thread.innerHTML=thread.innerHTML;
 });
 await page.waitForTimeout(500);await expect(sidebar).toHaveAttribute('aria-expanded','true');
 await page.evaluate(()=>addTurn(3,'<h2>确认新增用户消息后收起</h2>'));
 await expect(sidebar).toHaveAttribute('aria-expanded','false');
 // Repeated keyboard sends after manually reopening must also collapse.
 await sidebar.click();await composer.press('Enter');
 await page.waitForTimeout(400);await expect(sidebar).toHaveAttribute('aria-expanded','true');
 await page.evaluate(()=>addTurn(4,'<h2>已有对话回车发送</h2>'));
 await expect(ticks).toHaveCount(5);await expect(sidebar).toHaveAttribute('aria-expanded','false');
 await sidebar.click();
 await draft();await send.click();await sidebar.click();await sidebar.click();await addFirst('/c/immersive-manual');
 await expect(ticks).toHaveCount(1);await expect(sidebar).toHaveAttribute('aria-expanded','true');
 await sidebar.click();await draft();await send.click();await addFirst('/c/immersive-already-closed');
 await expect(ticks).toHaveCount(1);await expect(sidebar).toHaveAttribute('aria-expanded','false');
 await sidebar.click();await page.evaluate(()=>addTurn(1,'<h2>手动展开后继续提问</h2>'));
 await expect(ticks).toHaveCount(2);await expect(sidebar).toHaveAttribute('aria-expanded','true');
 await draft();await send.click();
 await page.evaluate(()=>{window.delayedSidebar=document.querySelector('#native-sidebar-toggle');window.delayedSidebar.remove();});
 await addFirst('/c/immersive-delayed');await expect(ticks).toHaveCount(1);await page.waitForTimeout(400);
 await page.evaluate(()=>document.body.append(window.delayedSidebar));
 await expect(sidebar).toHaveAttribute('aria-expanded','false');await sidebar.click();
 await draft();await send.click();await popup.locator('#immersiveMode').uncheck();await page.waitForTimeout(400);
 await addFirst('/c/immersive-disabled-pending');await expect(ticks).toHaveCount(1);await expect(sidebar).toHaveAttribute('aria-expanded','true');
 await popup.locator('#immersiveMode').check();await page.waitForTimeout(400);
 await draft();await send.click();
 await page.evaluate(()=>{const link=document.createElement('a');link.id='history-link';link.href='/c/immersive-history';link.textContent='历史聊天';link.style.cssText='position:fixed;left:480px;top:0;z-index:100';link.addEventListener('click',e=>{e.preventDefault();history.pushState({},'',link.href);addTurn(0,'<h2>历史记录</h2>');});document.body.append(link);});
 await page.locator('#history-link').click();await expect(ticks).toHaveCount(1);await expect(sidebar).toHaveAttribute('aria-expanded','true');
 await sidebar.click();await draft();await send.click();
 await page.evaluate(()=>{const control=document.createElement('button');control.id='sidebar-edge-control';control.type='button';control.setAttribute('aria-controls','app-shell-sidebar');control.style.cssText='position:fixed;left:520px;top:0;z-index:100';control.textContent='展开侧边栏';control.addEventListener('click',()=>document.querySelector('#native-sidebar-toggle').setAttribute('aria-expanded','true'));document.body.append(control);});
 await page.locator('#sidebar-edge-control').click();await addFirst('/c/immersive-edge-control');
 await expect(ticks).toHaveCount(1);await expect(sidebar).toHaveAttribute('aria-expanded','true');
 // Match the live page's search-unit markup and draft-to-saved URL transition.
 await draft();await send.click();
 await page.evaluate(()=>{
   const thread=document.querySelector('#thread');thread.dataset.chatgptConversationSelectionTarget='local-chatgpt:live-sidebar';
   thread.innerHTML='<div data-content-search-turn-key="fallback-turn-0"><div data-chatgpt-search-unit-key="fallback-turn-0:0:user" data-chatgpt-search-message-ids="live-user"><div data-user-message-bubble>首条消息</div></div><div data-chatgpt-search-unit-key="fallback-turn-0:2:assistant" data-chatgpt-search-message-ids="live-answer"><div data-markdown-text-style="assistant-message"><h2>回答标题</h2></div></div></div>';
   history.pushState({},'','/c/immersive-live-structure');
 });
 await expect(ticks).toHaveCount(1);await expect(sidebar).toHaveAttribute('aria-expanded','false');
 await sidebar.click();await send.click();await page.waitForTimeout(400);
 await expect(sidebar).toHaveAttribute('aria-expanded','true');
 await page.evaluate(()=>{
   const next=document.createElement('div');
   next.innerHTML='<div data-chatgpt-search-unit-key="fallback-turn-1:0:user" data-chatgpt-search-message-ids="live-user-2"><div data-user-message-bubble>已保存但保留临时标识的追问</div></div>';
   document.querySelector('#thread').append(next);
 });
 await expect(sidebar).toHaveAttribute('aria-expanded','false');
 // A different route is navigation even without a link or popstate event.
 await sidebar.click();await send.click();
 await page.evaluate(()=>{
   history.pushState({},'','/c/immersive-route-switch');
   const thread=document.querySelector('#thread');thread.dataset.chatgptConversationSelectionTarget='immersive-route-switch';
   thread.replaceChildren();addTurn(0,'<h2>切换的历史会话</h2>');
 });
 await expect(ticks).toHaveCount(1);await expect(sidebar).toHaveAttribute('aria-expanded','true');
 await popup.locator('#immersiveMode').uncheck();
 console.log('PASS 沉浸模式每次发送、新聊天、历史追问、消息确认、手动控制、路由切换与临时标识');
};
