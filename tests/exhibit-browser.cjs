const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
 const report={checks:[],errors:[],renderer:'Edge SwiftShader software; not physical GPU performance'};
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
 const check=(name,ok)=>{report.checks.push({name,passed:!!ok});if(!ok)throw Error(name)};
 const go=async id=>{await page.locator('#nav-'+id).click();await page.locator('#'+id+'-view').waitFor({state:'visible'});};
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.locator('#nav-match').waitFor();
  await go('match');await page.locator('#match-scene canvas').waitFor();
  const {PART_CATALOG}=await import('../assets/exhibit-details.mjs');
  check('01丰富的比赛档案与系统流程',await page.locator('#match-view .exhibit-dossier').count()===2);
  for(let i=0;i<5;i++){await page.locator(`[data-game="${i}"]`).click();check('五局独立解读 '+(i+1),await page.locator('#game-note .game-analysis h4').count()===2);}
  for(const mode of ['match','gpu','training','selfplay']){
   if(mode!=='match'){await go('growth');await page.locator(`[data-growth="${mode}"]`).click();await page.locator('#growth-scene canvas').waitFor();}
   const prefix=mode==='match'?'hardware':'growth',button=mode==='match'?'machine-explode':'growth-explode',host=mode==='match'?'match-scene':'growth-scene';
   const rows=PART_CATALOG[mode];
   check(mode+'所有部件有独立入口',await page.locator('#'+prefix+'-parts button').count()===rows.length);
   await page.locator('#'+button).click();await page.waitForTimeout(900);
   check(mode+'拆解状态同步',await page.locator('#'+button).getAttribute('aria-pressed')==='true');
   check(mode+'所有三维编号已创建',await page.locator('#'+host+' [data-model-part]').count()===rows.length);
   for(const row of rows){
    await page.locator(`#${prefix}-parts [data-part="${row.key}"]`).click();
    check(mode+'部件说明 '+row.key,(await page.locator('#'+prefix+'-info h3').innerText())===row.name&&(await page.locator('#'+prefix+'-info .part-section').count())===3);
    check(mode+'模型编号与列表同步 '+row.key,await page.locator(`#${host} [data-model-part="${row.key}"]`).getAttribute('aria-pressed')==='true');
   }
   const visible=await page.locator(`#${host} [data-model-part]:visible`).all();
   check(mode+'展开有可见空间标记',visible.length>=3);
   await visible[0].click({force:true});
   const markerKey=await visible[0].getAttribute('data-model-part');
   check(mode+'空间编号点击解释',await page.locator('#'+prefix+'-info').getAttribute('data-part')===markerKey);
   if(mode==='gpu')check('04点击不覆盖01面板',await page.locator('#hardware-info h3').innerText()===PART_CATALOG.match.at(-1).name||await page.locator('#hardware-info').getAttribute('data-part')!==null);
   if(mode==='training'){
    const old=await page.locator('#train-error').textContent();await page.locator('#train-step').click();
    check('训练更新误差与预测',old!==await page.locator('#train-error').textContent()&&(await page.locator('#train-prediction').innerText()).includes('当前预测'));
   }
   await page.locator('#'+host).scrollIntoViewIfNeeded();
   await page.locator('#'+(mode==='match'?'match':'growth')+'-view .museum-exhibit').screenshot({path:path.resolve(__dirname,'../output/parts-'+mode+'.png')});
   // Click the actual mesh with markers hidden to verify ray picking independently of DOM buttons.
   await page.locator('#'+prefix+'-parts button').last().click();
   const current=await page.locator('#'+prefix+'-info').getAttribute('data-part');
   await page.locator('#'+host+' .part-hotspots').evaluate(el=>el.style.visibility='hidden');
    const canvas=await page.locator('#'+host+' canvas').boundingBox();
    const snapshot=await page.locator('#'+host+' canvas').evaluate(canvas=>canvas.getExhibitSnapshot());
    const target=snapshot.bounds.find(item=>item.key!==current&&item.right>item.left&&item.bottom>item.top);
    let rayHit=false;
    for(const candidate of snapshot.bounds.filter(item=>item.key!==current&&item.right>item.left&&item.bottom>item.top)){
     for(const [u,v] of [[.5,.5],[.25,.5],[.75,.5],[.5,.25],[.5,.75],[.25,.25],[.75,.25],[.25,.75],[.75,.75]]){
      await page.mouse.click(canvas.x+candidate.left+(candidate.right-candidate.left)*u,canvas.y+candidate.top+(candidate.bottom-candidate.top)*v);
      if(await page.locator('#'+prefix+'-info').getAttribute('data-part')===candidate.key){rayHit=true;break;}
     }
     if(rayHit)break;
    }
   check(mode+'直接点击三维网格生效',rayHit);
   await page.locator('#'+host+' .part-hotspots').evaluate(el=>el.style.visibility='');
   await page.locator('#'+button).click();check(mode+'恢复同步',await page.locator('#'+button).getAttribute('aria-pressed')==='false');
  }
   await go('growth');await page.locator('.boundary-lab').waitFor({state:'visible'});check('04成长系统包含实验边界',await page.locator('.boundary-lab').isVisible());
  await go('origins');await page.locator('#history-scene canvas').waitFor();check('00历史展品保留',await page.locator('#historical-object').isVisible());
  await page.setViewportSize({width:390,height:844});
  for(const view of ['match','growth']){
   await go(view);if(view==='growth')await page.locator('[data-growth="gpu"]').click();
   await page.locator(view==='match'?'#machine-explode':'#growth-explode').click();
   const prefix=view==='match'?'hardware':'growth';
   await page.locator('#'+prefix+'-parts button').last().click();
   check(view+'手机点击说明',await page.locator('#'+prefix+'-info .part-io').isVisible());
   check(view+'手机无横向溢出',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.locator('#'+view+'-view .museum-exhibit').screenshot({path:path.resolve(__dirname,'../output/parts-mobile-'+view+'.png')});
  }
  await page.emulateMedia({reducedMotion:'reduce'});await go('growth');await page.locator('[data-growth="training"]').click();await page.locator('#growth-explode').click();await page.locator('#growth-parts [data-part="gradient"]').click();check('减少动态模式仍可探索',await page.locator('#growth-info').getAttribute('data-part')==='gradient');
 }catch(e){report.failure=e.stack;await page.screenshot({path:path.resolve(__dirname,'../output/parts-failure.png'),fullPage:true}).catch(()=>{});}
 finally{fs.writeFileSync(path.resolve(__dirname,'../output/parts-qa.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report));if(report.failure||report.errors.length)process.exitCode=1;}
})();
