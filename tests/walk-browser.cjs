const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 const report={checks:[],errors:[],renderer:'Edge software rendering'};
 page.on('pageerror',e=>report.errors.push(e.message));
 const check=(name,ok)=>{report.checks.push({name,passed:!!ok});if(!ok)throw Error(name);};
 const state=()=>page.locator('#museum-walk canvas').evaluate(c=>c.getWalkSnapshot());
 const open=async()=>{await page.locator('#museum-walk-open').click();await page.waitForFunction(()=>document.querySelector('#museum-walk canvas')?.dataset.ready==='true');await page.waitForTimeout(500);};
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href+'#match');await page.locator('#museum-walk-open').waitFor();await open();
  check('三维展馆原生对话框打开',await page.locator('#museum-walk').evaluate(d=>d.open));
   const start=await state();check('五座实体展台与Comfy雕塑已载入',start.stations===5&&start.sculpture&&start.triangles>1000);
  await page.screenshot({path:path.resolve(__dirname,'../output/walk-desktop.png')});
  await page.locator('#museum-walk canvas').focus();await page.keyboard.down('w');
  await page.waitForFunction(z=>document.querySelector('#museum-walk canvas').getWalkSnapshot().position.z<z-1,start.position.z);await page.keyboard.up('w');
  check('键盘前进改变真实相机位置',(await state()).position.z<start.position.z-1);
  const r=await page.locator('#museum-walk canvas').boundingBox();await page.mouse.move(r.x+r.width*.55,r.y+r.height*.5);await page.mouse.down();await page.mouse.move(r.x+r.width*.7,r.y+r.height*.6,{steps:10});await page.mouse.up();
  const turned=await state();check('拖动改变视线方向',Math.abs(turned.yaw)>.2&&Math.abs(turned.pitch)>.1);
  await page.locator('[data-walk-home]').click();await page.waitForTimeout(200);check('返回入口复位',Math.abs((await state()).position.z-11)<.01&&(await state()).yaw===0);
  await page.keyboard.press('Escape');check('Escape退出且恢复入口焦点',await page.locator('#museum-walk-open').evaluate(b=>b===document.activeElement));
  await open();const portal=(await state()).portals.find(s=>s.id==='dimensions');
  await page.mouse.click(portal.x,portal.y);await page.locator('#dimensions-view').waitFor({state:'visible'});
  check('直接点击三维展台标牌进入展区',await page.locator('#museum-walk').evaluate(d=>!d.open)&&await page.evaluate(()=>location.hash==='#dimensions'));
   for(const id of ['origins','match','decision','dimensions','growth']){
   await open();await page.locator(`[data-walk-station="${id}"]`).click();await page.locator('#'+id+'-view').waitFor({state:'visible'});
   check('大厅进入展区 '+id,await page.locator('#museum-walk').evaluate(d=>!d.open)&&await page.evaluate(id=>location.hash==='#'+id,id));
  }
  await page.setViewportSize({width:390,height:844});await open();
  check('手机大厅无横向溢出',await page.locator('#museum-walk').evaluate(d=>d.scrollWidth<=d.clientWidth));
  const move=page.locator('[data-walk-move="forward"]'),mr=await move.boundingBox();await page.mouse.move(mr.x+mr.width/2,mr.y+mr.height/2);await page.mouse.down();
  await page.waitForFunction(()=>document.querySelector('#museum-walk canvas').getWalkSnapshot().position.z<10);await page.mouse.up();
  check('屏幕移动按钮有效',(await state()).position.z<10);await page.locator('[data-walk-home]').click();
  await page.screenshot({path:path.resolve(__dirname,'../output/walk-mobile.png')});
  await page.locator('[data-walk-close]').click();check('手机正常退出',await page.locator('#museum-walk').evaluate(d=>!d.open));
 }catch(error){report.failure=error.stack;await page.screenshot({path:path.resolve(__dirname,'../output/walk-failure.png')}).catch(()=>{});}
 finally{fs.writeFileSync(path.resolve(__dirname,'../output/walk-qa.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));if(report.failure||report.errors.length)process.exitCode=1;}
})();
