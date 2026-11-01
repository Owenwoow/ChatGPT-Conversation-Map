const {expect}=require('@playwright/test');

module.exports=async function contextReloadScenario(page,popup) {
 const errors=[];
 const recordError=error=>errors.push(error.message);
 page.on('pageerror',recordError);
 try {
  await page.goto('https://chatgpt.com/c/context-reload');
  const root=page.locator('#dual-navigator-host');
  await expect(root.locator('.tick')).toHaveCount(8);
  await popup.evaluate(()=>chrome.runtime.reload());
  await page.evaluate(()=>{history.pushState({},'','/c/context-reload-next');document.querySelector('#thread h2').textContent='扩展更新后页面变化';});
  await expect(root).toHaveCount(0);
  await page.evaluate(()=>document.querySelector('#thread h2').textContent='旧脚本不应恢复界面');
  await page.waitForTimeout(1000);await expect(root).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.reload();
  await expect(root).toHaveCount(1);await expect(root.locator('.tick')).toHaveCount(8);
  await root.locator('.tick').nth(1).hover();await expect(root.locator('.preview')).toBeVisible();
  expect(errors).toEqual([]);
  console.log('PASS 扩展重载后旧脚本安静退出，刷新页面后恢复且不重复注入');
 } finally {page.off('pageerror',recordError);}
};
