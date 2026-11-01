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
 await expect(ticks).toHaveCount(3);await expect(sidebar).toHaveAttribute('aria-expanded','false');await sidebar.click();
 await page.evaluate(()=>{history.pushState({},'','/c/immersive-reading');document.querySelector('#thread').replaceChildren();addTurn(10,'<h2>阅读历史聊天</h2>');});
 await expect(ticks).toHaveCount(1);await expect(sidebar).toHaveAttribute('aria-expanded','true');
 await send.click();await page.waitForTimeout(400);await expect(sidebar).toHaveAttribute('aria-expanded','true');
 await page.evaluate(()=>addTurn(2,'<h2>加载更早的历史内容</h2>'));
 await expect(ticks).toHaveCount(2);await expect(sidebar).toHaveAttribute('aria-expanded','true');
 await page.evaluate(()=>addTurn(11,'<h2>历史聊天的新消息</h2>'));
 await expect(ticks).toHaveCount(3);await expect(sidebar).toHaveAttribute('aria-expanded','false');await sidebar.click();
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
 await popup.locator('#immersiveMode').uncheck();
 console.log('PASS 沉浸模式开关、新旧聊天发送、阅读历史、手动控制、延迟渲染与已收起侧边栏');
};
