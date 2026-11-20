const {expect}=require('@playwright/test');

async function reloadExtension(page,popup) {
 const url=popup.url();
 const identity=await popup.evaluate(()=>({id:chrome.runtime.id,version:chrome.runtime.getManifest().version}));
 const readyPopup=await page.context().newPage();
 try {
  // Complete the browser evaluation before reload destroys the old popup.
  await popup.evaluate(()=>{setTimeout(()=>chrome.runtime.reload(),0);});
  await expect.poll(()=>popup.isClosed(),{timeout:15000,message:'等待旧版扩展弹窗关闭'}).toBe(true);
  // Wait for the replacement extension to register its content scripts.
  await expect.poll(async()=>{
   try {
    await readyPopup.goto(url,{waitUntil:'domcontentloaded',timeout:2000});
    return await readyPopup.evaluate(expected=>chrome.runtime.id===expected.id && chrome.runtime.getManifest().version===expected.version,identity);
   } catch {return false;}
  },{timeout:15000,intervals:[100,250,500],message:'等待扩展重载完成并恢复扩展 API'}).toBe(true);
  await page.bringToFront();
  return readyPopup;
 } catch(error) {await readyPopup.close();throw error;}
}

module.exports=async function contextReloadScenario(page,popup) {
 const errors=[];
 const recordError=error=>errors.push(error.message);
 page.on('pageerror',recordError);
 try {
  await page.goto('https://chatgpt.com/c/context-reload');
  const root=page.locator('#dual-navigator-host');
  await expect(root.locator('.tick')).toHaveCount(8);
  await reloadExtension(page,popup);
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

module.exports.reloadExtension=reloadExtension;
