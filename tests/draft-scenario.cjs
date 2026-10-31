const {expect}=require('@playwright/test');

// Also run in the real MV3 isolated world: use public page DOM and UI only.
module.exports=async function draftScenario(page) {
 const root=page.locator('#dual-navigator-host'), ticks=root.locator('.tick'), toc=root.locator('.toc');
 await page.setViewportSize({width:1600,height:1000});
 await page.evaluate(()=>{
   history.pushState({},'','/');document.querySelector('#thread').replaceChildren();
 });
 await expect(ticks).toHaveCount(0);
 await page.evaluate(()=>{
   const thread=document.querySelector('#thread');
   thread.dataset.chatgptConversationSelectionTarget='local-chatgpt:live-draft';
   history.pushState({},'','/c/local-chatgpt%3Alive-draft');
   addTurn(0,'<h2>临时会话的首个标题</h2>');
 });
 await expect(root.locator('.heading')).toHaveText('临时会话的首个标题');
 await expect(toc).toBeVisible();await root.locator('.collapse').click();
 await page.evaluate(()=>history.replaceState({},'','/c/saved-draft'));
 // The actual page keeps the local marker even after generation completes.
 await page.waitForTimeout(1100);
 await expect(ticks).toHaveCount(1);await expect(root.locator('.open')).toBeVisible();
 await root.locator('.open').click();await expect(toc).toBeVisible();
 await page.evaluate(()=>document.querySelector('#thread .markdown').insertAdjacentHTML('beforeend','<h3>保存后继续生成的标题</h3>'));
 await expect(root.locator('.heading')).toHaveText(['临时会话的首个标题','保存后继续生成的标题']);
 await page.waitForTimeout(1100);await expect(toc).toBeVisible();
 // A different saved route must not inherit the observed local draft.
 await page.evaluate(()=>history.pushState({},'','/c/other-history'));
 await expect(ticks).toHaveCount(0);await expect(toc).toBeHidden();
 await page.evaluate(()=>{
   const thread=document.querySelector('#thread');thread.replaceChildren();
   thread.dataset.chatgptConversationSelectionTarget='other-history';
   addTurn(8,'<h2>另一段历史会话</h2>');
 });
 await expect(root.locator('.heading')).toHaveText('另一段历史会话');
 // The local URL may be replaced before the observer or route poll sees it.
 await page.evaluate(()=>{
   history.pushState({},'','/');const thread=document.querySelector('#thread');
   thread.replaceChildren();thread.removeAttribute('data-chatgpt-conversation-selection-target');
 });
 await expect(ticks).toHaveCount(0);
 await page.evaluate(()=>{
   document.querySelector('#thread').dataset.chatgptConversationSelectionTarget='local-chatgpt:fast-draft';
   history.pushState({},'','/c/local-chatgpt%3Afast-draft');
   history.replaceState({},'','/c/fast-saved-draft');
   addTurn(0,'<h2>没有采样到临时地址的首次回答</h2>');
 });
 await expect(root.locator('.heading')).toHaveText('没有采样到临时地址的首次回答');
 await expect(toc).toBeVisible();
 await page.evaluate(()=>document.querySelector('#thread').dataset.chatgptConversationSelectionTarget='fast-saved-draft');
 await expect(ticks).toHaveCount(1);await expect(toc).toBeVisible();
};
