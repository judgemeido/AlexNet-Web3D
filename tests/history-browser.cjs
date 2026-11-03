const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

const root=path.resolve(__dirname,'..');
const output=path.join(root,'output');
const exhibits=['neuron','rules','search','learning'];

(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 const report={testedAt:new Date().toISOString(),version:'历史主展区与策展视觉',renderer:'Edge + SwiftShader software',checks:[],frames:[],errors:[]};
 page.on('pageerror',error=>report.errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text())});
 const check=(name,passed)=>{report.checks.push({name,passed:Boolean(passed)});if(!passed)throw Error(name)};
 const inspectFrame=async key=>page.locator('#history-scene canvas').evaluate(canvas=>{
  const rect=canvas.getBoundingClientRect();
   const snapshot=canvas.getExhibitSnapshot(),boxes=snapshot.bounds;
  const visible=boxes.filter(box=>box.right>0&&box.left<rect.width&&box.bottom>0&&box.top<rect.height);
  const left=Math.min(...visible.map(box=>box.left)),right=Math.max(...visible.map(box=>box.right));
  const top=Math.min(...visible.map(box=>box.top)),bottom=Math.max(...visible.map(box=>box.bottom));
  const clipped=boxes.some(box=>box.left<0||box.right>rect.width||box.top<0||box.bottom>rect.height);
  return {mode:snapshot.mode,canvas:{width:rect.width,height:rect.height},width:+((right-left)/rect.width).toFixed(3),height:+((bottom-top)/rect.height).toFixed(3),clipped,bounds:boxes};
 }).then(frame=>({key,...frame}));
 try{
  await page.goto(pathToFileURL(path.join(root,'index.html')).href);
  await page.waitForFunction(()=>document.querySelector('#history-scene')?.dataset.modelReady==='true');
  check('历史主展品可读取投影信息',await page.locator('#history-scene canvas').evaluate(canvas=>typeof canvas.getExhibitSnapshot==='function'));
  check('桌面模型视窗与说明栏等高',await page.locator('.object-layout').evaluate(layout=>{
   const stage=layout.querySelector('.object-stage-wrap').getBoundingClientRect();
   const inspector=layout.querySelector('.object-inspector').getBoundingClientRect();
   return Math.abs(stage.height-inspector.height)<2&&stage.height>=480;
  }));
  check('六个完整历史章节',await page.locator('.history-chapter').count()===6);
  check('至少十九个历史事件',await page.locator('.chapter-events>div').count()>=19);
  check('四种原理展品',await page.locator('[data-object]').count()===4);
  for(const [index,key] of exhibits.entries()){
   if(index)await page.locator(`[data-object="${key}"]`).click();
   await page.waitForFunction(()=>document.querySelector('#history-scene')?.dataset.modelReady==='true');
   await page.waitForTimeout(350);
   const frame=await inspectFrame(key);report.frames.push({viewport:'desktop',...frame});
   check(`桌面${key}占屏比例充足且零件完整`,frame.width>=.55&&frame.height>=(key==='neuron'?.5:.45)&&!frame.clipped);
   await page.locator('#historical-object').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(output,`framing-${key}.png`),fullPage:false});
  }
  await page.locator('#history-explode').click();
  check('历史展品可拆解',await page.locator('#history-explode').getAttribute('aria-pressed')==='true');
  await page.locator('#era').fill('5');
  check('最后一章联动',await page.locator('#reading-now').textContent().then(text=>text.includes('走向围棋')));
  check('最后一章不再灰度',await page.locator('#historical-object').getAttribute('style').then(style=>style.includes('--history-gray: 0')));
  check('历史正文含低谷与樊麾',await page.locator('.history-volumes').innerText().then(text=>text.includes('低谷')&&text.includes('樊麾')));
  await page.locator('[data-chapter-model="2"]').click();
  check('章节映射规则展品',await page.locator('#object-title').textContent()==='规则推理仪器');
  await page.locator('#nav-match').click();await page.waitForTimeout(800);
  await page.locator('#machine-explode').click();await page.waitForTimeout(650);
  await page.locator('#nav-growth').click();await page.waitForTimeout(500);
  await page.locator('#growth-explode').click();await page.waitForTimeout(650);
  await page.locator('#nav-origins').click();
  await page.waitForFunction(()=>location.hash==='#origins'&&!document.querySelector('#origins-view')?.hidden&&document.querySelector('#history-scene canvas')?.parentElement?.id==='history-scene');
  check('历史恢复同一场景',await page.locator('#history-scene canvas').count()===1);
  await page.setViewportSize({width:390,height:844});
  for(const route of ['origins','match','decision','dimensions','growth']){
   await page.locator(`#nav-${route}`).click();await page.waitForTimeout(450);
   check(`手机${route}无横向溢出`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await page.locator('#nav-origins').click();
  for(const [index,key] of exhibits.entries()){
   await page.locator(`[data-object="${key}"]`).click();
   await page.waitForTimeout(350);
   const frame=await inspectFrame(key);report.frames.push({viewport:'mobile',...frame});
   check(`手机${key}加载对应模型`,frame.mode===key);
   check(`手机${key}占屏比例充足且零件完整`,frame.width>=.48&&frame.width<=.96&&frame.height>=(key==='neuron'?.42:.35)&&frame.height<=.92&&!frame.clipped);
   await page.locator('#historical-object').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(output,`framing-mobile-${key}.png`),fullPage:false});
  }
 }catch(error){report.failure=error.stack}
 finally{
  await browser.close();
  report.ok=!report.failure&&!report.errors.length&&report.checks.every(item=>item.passed);
  fs.writeFileSync(path.join(output,'history-browser-qa.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  if(!report.ok)process.exitCode=1;
 }
})();
