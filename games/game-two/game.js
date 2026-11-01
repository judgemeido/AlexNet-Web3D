/* 运河寻宝 · 智慧资源大采集
 * 无引擎、无网络依赖。LEVELS / RESOURCE_TYPES 可扩展关卡与资源。
 * 世界坐标固定为 980×650，CSS等比适配视口；dt逻辑保证不同帧率体验一致。
 */
(() => {
'use strict';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d');
const W=980,H=650,PIVOT={x:490,y:177};
const LEVELS=[
 {name:'运河资源勘探',time:60,goal:{chip:10},stock:{chip:14,crystal:3,part:2,crate:4,relic:2,rock:3,rust:2},reward:300,subtitle:'收集 10 个智慧芯片，建立港口 AI 数据底座。'},
 {name:'智慧港建设材料收集',time:75,goal:{crystal:4,part:4},stock:{chip:5,crystal:6,part:6,crate:3,relic:2,rock:4,rust:3},reward:500,subtitle:'收集 4 枚能源晶体和 4 件机械零件，建设绿色智慧港。'},
 {name:'超级智慧工厂启动',time:60,goal:{chip:4,crystal:3,part:3},stock:{chip:7,crystal:5,part:5,crate:3,relic:2,rock:4,rust:4},reward:800,subtitle:'60 秒内收集 4 个芯片、3 枚晶体和 3 件零件，启动智能生产线。'}
];
const RESOURCE_TYPES={
 chip:{name:'智慧芯片',value:100,r:14,color:'#8cf7d7',weight:1},
 crystal:{name:'能源晶体',value:200,r:17,color:'#91d8ff',weight:1.15},
 part:{name:'机械零件',value:300,r:19,color:'#c4bcfa',weight:1.35},
 crate:{name:'普通货物箱',value:50,r:18,color:'#e7c28a',weight:1.4},
 relic:{name:'古运河文化宝箱',value:250,r:20,color:'#f0d894',weight:1.5},
 rock:{name:'岩石障碍',value:0,r:22,color:'#8aabae',weight:3.2},
 rust:{name:'锈蚀设备',value:0,r:20,color:'#b58066',weight:1.65}
};
const REACH=[415,475,540],SPEED=[260,370,510],REACH_COST=[100,450],SPEED_COST=[150,500];
const REACH_NAMES=['普通机械臂','智能伸缩机械臂','AI 自动定位机械臂'];
const SPEED_NAMES=['普通速度','快速回收','智能预测路线'];
const STORIES=[
 '历史文物数据解锁：拱宸桥始建于明代，是杭州大运河的代表性古桥。',
 '运河故事解锁：漕运曾将南方粮食运往北方，连接沿线城市的生产与生活。',
 '城市信息解锁：苏州的运河与古城水网相连，水陆交通滋养了商贸文化。',
 '历史数据解锁：中国大运河于 2014 年列入《世界遗产名录》。',
 '绿色未来解锁：智慧港的电动机械臂与绿色能源系统可降低作业排放。'
];
const state={mode:'intro',level:0,score:0,total:0,time:60,reach:0,speed:0,bag:{},items:[],particles:[],floaters:[],phase:'swing',angle:0,length:28,swingTime:0,visualTime:0,hook:null,checkpoint:null,progress:0,progressView:0,sound:false,storyIndex:0,story:null,aimInput:0,lastGoal:0};
let lastTime=0,toastTimeout,audio=null;
const isUseful=type=>!['rock','rust'].includes(type);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function seedRandom(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
function loadLevel(index,reset=false){
 if(reset){state.score=0;state.total=0;state.reach=0;state.speed=0;state.storyIndex=0;}
 state.level=index;state.checkpoint={score:state.score,total:state.total,reach:state.reach,speed:state.speed,storyIndex:state.storyIndex};
 state.time=LEVELS[index].time;state.bag={chip:0,crystal:0,part:0,crate:0,relic:0};state.phase='swing';state.angle=0;state.length=28;state.swingTime=0;state.hook=null;state.progress=0;state.progressView=0;state.story=null;state.particles=[];state.floaters=[];state.items=[];
 const rand=seedRandom(7137+index*971),types=[];
 Object.entries(LEVELS[index].stock).forEach(([type,n])=>{for(let i=0;i<n;i++)types.push(type);});
 // 每个主线资源位于基础机械臂可达的扇形内，升级绝不是过关硬性门槛。
 const spots=[];
 for(let row=0;row<5;row++)for(let col=0;col<9;col++){
  const a=-1.05+col*.2625+(row%2?0.025:-.025),len=166+row*53;
  spots.push({x:PIVOT.x+Math.sin(a)*len,y:PIVOT.y+Math.cos(a)*len});
 }
 for(let i=spots.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[spots[i],spots[j]]=[spots[j],spots[i]];}
 // 优先布局大物体，避免首次可玩区域被随机相交图形遮挡。
 types.sort((a,b)=>RESOURCE_TYPES[b].r-RESOURCE_TYPES[a].r);
 types.forEach((type,i)=>{const p=spots[i];state.items.push({id:i,type,x:p.x+(rand()-.5)*6,y:p.y+(rand()-.5)*6,rotation:(rand()-.5)*.35,seed:rand()*9});});
 // 外围奖励货物只需升级后可达，但不计入关卡目标。
 if(index>0)state.items.push({id:99,type:'relic',x:90,y:445,rotation:.05,seed:2});
 updateUI();
}
function goalText(){return Object.entries(LEVELS[state.level].goal).map(([type,n])=>`${RESOURCE_TYPES[type].name} ${Math.min(state.bag[type],n)}/${n}`).join('　·　');}
function updateUI(){
 const cfg=LEVELS[state.level];$('score').textContent=state.score.toLocaleString('zh-CN');$('count').textContent=state.total;
 $('time').textContent=Math.ceil(Math.max(0,state.time));$('time').classList.toggle('critical',state.time<=15);
 $('stageText').textContent=`0${state.level+1} · ${cfg.name}`;$('mapSector').textContent=`0${state.level+1}`;
 $('reachLevel').textContent=`LV.${state.reach+1} / S.${state.speed+1}`;$('reachName').textContent=REACH_NAMES[state.reach];$('speedName').textContent=SPEED_NAMES[state.speed];
 $('reachTrack').style.width=(state.reach+1)/3*100+'%';$('speedTrack').style.width=(state.speed+1)/3*100+'%';
 $('reachBtn').innerHTML=`伸缩范围 <strong>${state.reach===2?'已满级':REACH_COST[state.reach]+' 分'}</strong>`;
 $('speedBtn').innerHTML=`回收速度 <strong>${state.speed===2?'已满级':SPEED_COST[state.speed]+' 分'}</strong>`;
 $('reachBtn').disabled=state.mode!=='playing'||state.phase!=='swing'||state.reach===2||state.score<REACH_COST[state.reach];
 $('speedBtn').disabled=state.mode!=='playing'||state.phase!=='swing'||state.speed===2||state.score<SPEED_COST[state.speed];
 $('launchBtn').disabled=state.mode!=='playing'||state.phase!=='swing';$('dropBtn').disabled=$('launchBtn').disabled;
 $('launchBtn').querySelector('span').textContent=state.phase==='swing'?'释放机械臂':state.phase==='extend'?'正在伸出':'正在回收';
 $('pauseBtn').disabled=!['playing','paused'].includes(state.mode);$('pauseBtn').textContent=state.mode==='paused'?'▷':'Ⅱ';
 $('armMode').textContent=`${REACH_NAMES[state.reach]} · 范围 ${REACH[state.reach]}`;
 document.querySelector('.lab-card p').textContent=state.phase==='swing'?'等待指令 · 空格释放':state.phase==='extend'?'探测资源 · 机械臂已释放':state.hook?`正在回收 · ${RESOURCE_TYPES[state.hook.type].name}`:'空载回收中';
 document.querySelectorAll('.level').forEach((el,i)=>{el.className='level '+(i===state.level?'active':i>state.level?'locked':'complete');el.querySelector('i').textContent=i<state.level?'✓':i===state.level?'●':'⌑';});
}
function notify(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').classList.remove('show'),3200);}
function sound(freq=650,len=.1){if(!state.sound)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();const osc=audio.createOscillator(),gain=audio.createGain();osc.connect(gain);gain.connect(audio.destination);osc.frequency.value=freq;gain.gain.setValueAtTime(.04,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+len);osc.start();osc.stop(audio.currentTime+len);}catch{}}
function modal(kind){
 let html='';
 if(kind==='intro')html=`<label>WELCOME / RESOURCE EXPEDITION 02</label><div class="badge">⚙</div><h2>少年指挥官，准备开工</h2><p>用 AI 智能机械臂探索运河资源空间，<br>让每一份资源，成为智慧港的未来。</p><div class="summary"><div><b>03</b><small>建设阶段</small></div><div><b>10</b><small>首关芯片目标</small></div><div><b>60s</b><small>首关采集时间</small></div></div><button data-action="start">启动机械臂　→</button><button class="secondary" data-action="help">查看操作指南</button><div class="hint">空格 / 点击地图释放 · ← → 微调 · R 提前回收<br>达成资源目标后自动进入结算，不必采空地图</div>`;
 if(kind==='help')html=`<label>COMMANDER'S HANDBOOK</label><h2>智能采集操作指南</h2><ul><li>机械臂自动左右摆动。空格、点击地图或释放按钮发射；← → 可微调瞄准。</li><li>抓住资源会自动回收，只有入库后才计分。按 R 可以提前空载回收。</li><li>积分既是成绩也是升级余额，升级会扣除对应积分。只可在机械臂待命时升级。</li><li>三级机械臂会辅助瞄准附近有价值资源；三级速度启用更快的直线回收路线。</li><li>岩石回收慢，水流会改变伸出角度，锈蚀设备入库扣3秒。</li><li>文化宝箱奖励250分与5秒时间，并解锁运河文化数据。</li><li>P / 暂停按钮暂停；切换窗口自动暂停。超时可重新挑战当前关。</li></ul><button data-action="back">了解，准备采集</button>`;
 if(kind==='paused')html=`<label>SYSTEM STANDBY</label><div class="badge">Ⅱ</div><h2>采集任务已暂停</h2><p>机械臂和倒计时均已冻结。<br>${goalText()}</p><button data-action="resume">继续采集　→</button><button class="secondary" data-action="retry">重新开始本关</button><button class="secondary" data-action="help">操作指南</button>`;
 if(kind==='over')html=`<label>TIME LIMIT REACHED</label><div class="badge">◷</div><h2>本轮采集时间已结束</h2><p>${goalText()}<br>试试先升级回收速度，避开岩石和锈蚀设备。</p><div class="summary"><div><b>${state.score}</b><small>智慧积分余额</small></div><div><b>${Math.round(state.progress*100)}%</b><small>本关建设进度</small></div></div><button data-action="retry">重新挑战本关　↻</button><button class="secondary" data-action="home">返回启动界面</button>`;
 if(kind==='win'||kind==='complete')html=`<label>${kind==='complete'?'FUTURE FACTORY ONLINE':'STAGE COMPLETE / 0'+(state.level+1)}</label><div class="badge">✦</div><h2>${kind==='complete'?'超级智慧工厂已启动':'建设阶段圆满完成'}</h2><p>${kind==='complete'?'机械臂生产线已就绪，未来智慧港点亮！<br>恭喜获得「智慧资源指挥官」称号。':LEVELS[state.level].name+'已完成。<br>关键资源已入库，准备开启下一阶段。'}</p><div class="summary"><div><b>${state.score}</b><small>积分余额</small></div><div><b>+${LEVELS[state.level].reward}</b><small>通关奖励</small></div><div><b>${state.total}</b><small>累计资源</small></div></div><button data-action="${kind==='complete'?'again':'next'}">${kind==='complete'?'开启新的建设计划　↻':'进入下一建设阶段　→'}</button>`;
 if(kind==='story')html=`<label>CANAL CULTURE ARCHIVE UNLOCKED</label><div class="badge">⌁</div><h2>运河文化数据已解锁</h2><p>${state.story}</p><div class="summary"><div><b>+250</b><small>智慧积分</small></div><div><b>+5s</b><small>探索时间</small></div></div><button data-action="resume">收录档案，继续采集　→</button><div class="hint">阅读期间计时暂停</div>`;
 $('modal').innerHTML=`<section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialogTitle">${html}</section>`;$('modal').querySelector('h2').id='dialogTitle';requestAnimationFrame(()=>$('modal').querySelector('button')?.focus({preventScroll:true}));updateUI();
}
function start(){state.mode='playing';$('modal').innerHTML='';canvas.focus({preventScroll:true});updateUI();}
function pause(){if(state.mode==='playing'){state.mode='paused';state.aimInput=0;modal('paused');}else if(state.mode==='paused')start();}
function retry(){const p=state.checkpoint;state.score=p.score;state.total=p.total;state.reach=p.reach;state.speed=p.speed;state.storyIndex=p.storyIndex;loadLevel(state.level);start();notify('本关已重置 · 起始资源、积分与升级状态已恢复');}
function upgrade(type){if(state.mode!=='playing'||state.phase!=='swing')return;const rank=state[type],cost=(type==='reach'?REACH_COST:SPEED_COST)[rank];if(rank>=2||state.score<cost)return;state.score-=cost;state[type]++;burst(PIVOT.x,PIVOT.y,'#a7efc1',30);notify(`升级成功 · ${(type==='reach'?REACH_NAMES:SPEED_NAMES)[state[type]]}（-${cost}分）`);sound(1100,.2);updateUI();}
function endpoint(){return{x:PIVOT.x+Math.sin(state.angle)*state.length,y:PIVOT.y+Math.cos(state.angle)*state.length};}
function fire(){
 if(state.mode!=='playing'||state.phase!=='swing')return;
 if(state.reach===2){let best=null;for(const item of state.items){if(!isUseful(item.type))continue;const a=Math.atan2(item.x-PIVOT.x,item.y-PIVOT.y),delta=Math.abs(a-state.angle),d=Math.hypot(item.x-PIVOT.x,item.y-PIVOT.y);if(delta<.15&&d<REACH[state.reach]&&(!best||delta<best.delta))best={a,delta};}if(best){state.angle=best.a;notify('AI 定位已锁定 · 附近资源航向校准');}}
 state.phase='extend';sound(360,.07);updateUI();
}
function pointSegmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy,t=len?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/len,0,1):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
function burst(x,y,color,n=15){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=25+Math.random()*100;state.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.6+Math.random()*.5,color});}}
function addFloater(text,color,x=PIVOT.x,y=PIVOT.y-25){state.floaters.push({text,color,x,y,life:1.7});}
function calculateProgress(){const goal=LEVELS[state.level].goal;let done=0,total=0;for(const [type,n]of Object.entries(goal)){done+=Math.min(state.bag[type],n);total+=n;}return done/total;}
function finish(){state.score+=LEVELS[state.level].reward;state.mode=state.level===2?'complete':'win';state.progress=1;state.progressView=1;for(let i=0;i<8;i++)burst(100+Math.random()*780,60+Math.random()*200,['#91f5ce','#eddb99','#8ecced'][i%3],18);sound(1050,.4);modal(state.mode);}
function deposit(){
 const item=state.hook;state.hook=null;state.phase='swing';state.length=28;
 if(item){const spec=RESOURCE_TYPES[item.type];burst(PIVOT.x,PIVOT.y,spec.color,20);
  if(isUseful(item.type)){state.bag[item.type]++;state.total++;state.score+=spec.value;addFloater(`+${spec.value} · ${spec.name}`,spec.color);sound(780,.14);}
  if(item.type==='rock'){notify('岩石已清理 · 规划下一次抓取，避开低效障碍');addFloater('岩石清理完成','#a1bcb7');sound(180,.15);}
  if(item.type==='rust'){state.time=Math.max(0,state.time-3);addFloater('锈蚀设备 · −3 秒','#ecad8e');notify('锈蚀设备损失 3 秒 · 留意棕色废旧设备');sound(140,.25);}
  state.progress=calculateProgress();
  if(item.type==='relic'){state.time+=5;state.story=STORIES[state.storyIndex%STORIES.length];state.storyIndex++;$('tipText').textContent=state.story;}
  if(state.progress>=1){finish();return;}
  if(state.time<=0){state.mode='over';modal('over');return;}
  if(item.type==='relic'){state.mode='story';modal('story');return;}
 }
 updateUI();
}
function update(dt){
 if(!['paused','help','story'].includes(state.mode))state.visualTime+=dt;
 if(state.mode==='playing'){
  // 只对活跃游玩计时；到点立即终止，未入库资源不计分。
  state.time=Math.max(0,state.time-dt);if(!state.time){state.mode='over';modal('over');return;}
  const old=endpoint();
  if(state.phase==='swing'){
   state.swingTime+=dt*.95;
   if(state.aimInput){state.angle=clamp(state.angle+state.aimInput*dt*1.8,-1.17,1.17);state.swingTime=Math.asin(state.angle/1.18);}
   else state.angle=Math.sin(state.swingTime)*1.18;
  }else if(state.phase==='extend'){
   const p=endpoint();
   // 标记水流带内产生轻微偏航；AI定位三级可以抵消部分干扰。
   if(state.level>0&&p.y>300&&p.y<390)state.angle+=Math.sin(state.visualTime*1.3)*dt*(state.reach===2?.045:.15);
   state.length+=dt*(420+state.speed*60);state.length=Math.min(REACH[state.reach],state.length);
   const next=endpoint();
   let caught=null,closest=Infinity;
   for(const item of state.items){if(pointSegmentDistance(item,old,next)<=RESOURCE_TYPES[item.type].r+9){const d=Math.hypot(item.x-old.x,item.y-old.y);if(d<closest){caught=item;closest=d;}}}
   if(caught){state.hook=caught;state.items=state.items.filter(item=>item!==caught);state.phase='retract';burst(caught.x,caught.y,RESOURCE_TYPES[caught.type].color,10);sound(490,.09);updateUI();}
   else if(state.length>=REACH[state.reach]||next.x<22||next.x>W-22||next.y>H-42){state.phase='retract';updateUI();}
  }else{
   state.length-=dt*SPEED[state.speed]/(state.hook?RESOURCE_TYPES[state.hook.type].weight:1);
   if(state.length<=28)deposit();
  }
  updateUI();
 }
 if(!['paused','help','story'].includes(state.mode)){
  state.particles=state.particles.filter(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=30*dt;return p.life>0;});
  state.floaters=state.floaters.filter(f=>{f.y-=dt*27;f.life-=dt;return f.life>0;});
  state.progressView+=(state.progress-state.progressView)*Math.min(1,dt*6);
 }
 $('sideProgress').textContent=Math.round(state.progressView*100)+'%';$('sideProgressBar').style.width=state.progressView*100+'%';$('sideGoal').textContent=goalText();
 $('progress').textContent=Math.round(state.progressView*100)+'%';$('progressBar').style.width=state.progressView*100+'%';$('armMeter').style.width=(state.length/REACH[state.reach]*100)+'%';
}
// ── Canvas程序美术 ─────────────────────────────────────────
function rect(x,y,w,h,fill,r=0,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
function poly(points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
function line(points,color,width=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function circle(x,y,r,fill,stroke){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
function text(s,x,y,size=12,color='#9bc5c4',align='center'){ctx.font=`${size}px "Microsoft YaHei",sans-serif`;ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(s,x,y);}
function glow(x,y,r,color){const grad=ctx.createRadialGradient(x,y,0,x,y,r);grad.addColorStop(0,color);grad.addColorStop(1,'transparent');circle(x,y,r,grad);}
function factory(x,y,w,h,index,t){
 const active=state.level>0||state.mode==='complete';
 rect(x+5,y+8,w,h,'#051c2955',3);poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],'#31545d','#4c7780');
 poly([[x-6,y],[x+7,y-16],[x+w+5,y-16],[x+w,y]],'#548081','#78a49a');
 for(let i=0;i<Math.floor(w/16);i++){rect(x+8+i*16,y+10,9,15,active?'#8cdcc077':'#628f9a55',1);line([[x+12+i*16,y+10],[x+12+i*16,y+25]],'#233e4e');}
 rect(x+8,y+h-17,w-16,10,'#193a49',1,'#426b75');
 for(let i=0;i<3;i++)rect(x+13+i*20,y+h-14,12,3,active?'#8ddcbf':'#70928a',1);
 if(index===1){rect(x+w*.25,y-40,w*.5,23,'#1d4b55',2,'#77b5a1');text('AI 制造',x+w*.5,y-24,10,'#9ee4ca');}
 if(index===2){for(let i=0;i<3;i++){poly([[x+6+i*28,y-19],[x+13+i*28,y-34],[x+35+i*28,y-34],[x+28+i*28,y-19]],'#2a6479','#85bfc3');line([[x+12+i*28,y-25],[x+30+i*28,y-25]],'#80aeb3');}}
}
function crane(x,y,t,active=false){rect(x-12,y,24,11,'#375c64',3,'#709391');const a=Math.sin(t*1.4)*9*(active?1:.2);line([[x,y],[x,y-34],[x+28,y-52],[x+48+a,y-29]],'#936c4b',9);line([[x,y],[x,y-34],[x+28,y-52],[x+48+a,y-29]],'#d4bb82',3);circle(x,y-34,5,'#4e7c7c','#dec895');circle(x+28,y-52,5,'#4e7c7c','#dec895');line([[x+48+a,y-29],[x+48+a,y-12]],'#a6482d',2);line([[x+41+a,y-15],[x+41+a,y-8],[x+55+a,y-8],[x+55+a,y-15]],'#e1c789',3);}
function drawBackground(t){
 const sky=ctx.createLinearGradient(0,0,0,205);sky.addColorStop(0,'#d2c09b');sky.addColorStop(1,'#b8b28f');rect(0,0,W,205,sky);
 // 水墨般的远山与城市天际线。
 poly([[0,105],[55,74],[112,92],[179,55],[226,82],[305,49],[370,83],[435,61],[510,91],[602,65],[692,92],[751,52],[835,74],[925,42],[980,88],[980,178],[0,178]],'#9ea987');
 for(let i=0;i<18;i++){const h=25+(i*19)%55;rect(i*59-8,126-h,28+(i%3)*8,h,'#8d997e',2);for(let j=0;j<3;j++)rect(i*59,133-h+j*11,3,4,'#83b7b733');}
 // 古运河桥梁、瓦顶与岸边街区。
 line([[30,145],[48,123],[115,123],[137,145]],'#755b3d',7);line([[30,134],[48,113],[115,113],[137,134]],'#9d825b',3);for(let i=0;i<6;i++)line([[47+i*13,113],[47+i*13,124]],'#d1b887',2);
 rect(165,106,71,38,'#8f8c68',2);poly([[155,107],[199,83],[246,107],[237,111],[163,111]],'#b9a97d','#b0b59b');line([[176,119],[176,143],[219,143],[219,119]],'#a2b098',3);text('运河古埠',199,135,9,'#cee0c0');
 factory(276,98,112,59,0,t);factory(580,95,134,63,1,t);factory(779,96,106,61,2,t);crane(723,157,t,state.level===2||state.mode==='complete');crane(922,157,t+1,state.mode==='complete');
 // 码头作业平台和机械臂底座。
 rect(0,165,W,20,'#607c75');rect(0,185,W,14,'#304f59');for(let x=0;x<W;x+=32)line([[x,168],[x+18,184]],'#afaf7966',4);
 rect(416,143,148,47,'#896144',6,'#b9915b');rect(432,147,116,23,'#4c5e56',3,'#c6a765');text('CANAL · AI RESOURCE ARM',490,162,8,'#b1e6cb');
 // 运河水域内渐深透明网格、流线与古代石岸。
 const water=ctx.createLinearGradient(0,199,0,H);water.addColorStop(0,'#718f7b');water.addColorStop(.3,'#698a7e');water.addColorStop(1,'#536f68');rect(0,199,W,H-199,water);
 ctx.save();ctx.beginPath();ctx.rect(0,199,W,H-199);ctx.clip();
 for(let y=215;y<H;y+=28)line([[0,y],[W,y]],'#fff1bd22');for(let x=0;x<W;x+=28)line([[x,199],[x,H]],'#fff1bd22');
 for(let i=0;i<34;i++){const x=(i*83+t*9)%W,y=216+(i*43)%400;line([[x,y],[x+9,y-2],[x+22,y],[x+32,y-1]],'#98e3ce'+(i%3===0?'24':'10'));}
 for(let i=0;i<10;i++){const x=(i*117+53)%W,y=650-((t*9+i*51)%440);circle(x,y,1.3,'#8acac32a');}
 ctx.restore();
 // 可辨识的地下资源作业区，非矿洞。
 line([[35,224],[35,592],[125,618],[865,618],[945,592],[945,224]],'#765e3f66',2);text('CANAL RESOURCE FIELD / 运河智慧资源空间',490,635,10,'#568691');
 [28,940].forEach(x=>{for(let i=0;i<8;i++)rect(x,230+i*45,13,22,'#46696555',2,'#72938133');});
 if(state.level>0){rect(42,310,896,73,'#f4d98b33',10);ctx.save();ctx.setLineDash([10,14]);ctx.lineDashOffset=-t*24;line([[55,334],[925,334]],'#a96a3a66',2);line([[55,363],[925,363]],'#a96a3a44',1);ctx.restore();for(let i=0;i<8;i++){const x=80+((t*22+i*117)%830);line([[x,341],[x+9,346],[x,351]],'#81d5df44',2);}text('≈ 水流干扰带',866,323,9,'#8f603c');}
 const progress=state.progressView;
 // 侧面建设进度塔随任务推进点亮。
 [0,1,2,3,4].forEach(i=>{const active=progress>i/5;rect(55,538-i*20,47,13,active?'#80d3b555':'#1c404d',2,active?'#8edbbb':'#345b68');});text('建设模块',79,568,9,'#93b9b4');
 const goals=Object.entries(LEVELS[state.level].goal);let gx=24;goals.forEach(([type,n])=>{const label=`${RESOURCE_TYPES[type].name} ${Math.min(state.bag[type],n)}/${n}`;rect(gx,40,143,27,'#143d44dd',5,'#527970');text(label,gx+71,58,11,'#c3e6cd');gx+=153;});
 if(state.mode==='complete'){glow(655,96,100,'#92ffc044');text('智能机械臂生产线 · ONLINE',655,53,15,'#b7f7d1');}
}
function drawResource(item,t,hooked=false){
 const spec=RESOURCE_TYPES[item.type];ctx.save();ctx.translate(item.x,item.y+(hooked?0:Math.sin(t*1.3+item.seed)*1.2));ctx.rotate(item.rotation||0);
 if(isUseful(item.type))glow(0,0,spec.r*2.2,spec.color+'14');ctx.shadowBlur=isUseful(item.type)?8:0;ctx.shadowColor=spec.color+'66';
 if(item.type==='chip'){
  for(let i=-8;i<=8;i+=8){line([[i,-19],[i,-12]],'#6db6a4',3);line([[i,12],[i,19]],'#6db6a4',3);line([[-19,i],[-12,i]],'#6db6a4',3);line([[12,i],[19,i]],'#6db6a4',3);}
  rect(-13,-13,26,26,'#237366',4,'#9ff2d1');rect(-8,-8,16,16,'#113f45',2,'#6bc6ad');line([[-4,4],[-4,-3],[0,-5],[4,-3],[4,4]],'#d3ffe1',1.6);line([[-4,1],[4,1]],'#d3ffe1',1.5);
 }else if(item.type==='crystal'){
  poly([[0,-24],[13,-9],[12,13],[0,24],[-12,13],[-14,-8]],'#4ba8b9','#b6f0ec');poly([[0,-24],[1,-1],[-12,13],[-14,-8]],'#8bcfd7');poly([[0,-24],[13,-9],[1,-1]],'#c0f0ef');poly([[1,-1],[12,13],[0,24]],'#307aab');line([[0,-24],[1,-1],[0,24]],'#c7f9e8');
 }else if(item.type==='part'){
  const pts=[];for(let i=0;i<32;i++){const a=i*Math.PI/16,r=i%4<2?21:16;pts.push([Math.cos(a)*r,Math.sin(a)*r]);}poly(pts,'#7c92aa','#c9dbe5');circle(0,0,11,'#214957','#b4d5d1');poly([[-5,-8],[5,-8],[9,0],[5,8],[-5,8],[-9,0]],'#123443','#b0d4cc');circle(0,0,3,'#80efd0');
 }else if(item.type==='crate'){
  poly([[-17,-12],[9,-18],[20,-9],[20,15],[-6,21],[-17,12]],'#a99069','#ecd2a0');poly([[-17,-12],[9,-18],[20,-9],[-6,-3]],'#e0cba0');poly([[-6,-3],[20,-9],[20,15],[-6,21]],'#816e52');line([[-17,-12],[-6,-3],[-6,21]],'#e6d4a8',2);line([[-2,-15],[9,-6],[9,18]],'#ecc68b',4);rect(-13,-5,4,9,'#516969',1);
 }else if(item.type==='relic'){
  rect(-20,-7,40,25,'#7c7550',4,'#e8d493');poly([[-21,-7],[-17,-17],[15,-17],[21,-7]],'#ac9c64','#f0dda2');rect(-22,-7,44,5,'#dcc18a',1);rect(-3,-6,7,13,'#b9d2ab',1,'#f9ecad');line([[-15,-15],[-15,16],[15,16],[15,-15]],'#ddbf7f',2);text('川',0,15,10,'#efe1aa');
 }else if(item.type==='rock'){
  poly([[-24,-3],[-15,-19],[4,-22],[22,-8],[25,13],[6,23],[-17,17]],'#4b6570','#8ba4a6');poly([[-15,-19],[4,-22],[10,-3],[-5,6],[-24,-3]],'#74908f');line([[-5,6],[6,23]],'#354f5c',2);line([[10,-3],[22,-8]],'#354f5c',2);
 }else{
  poly([[-20,-14],[10,-18],[22,-4],[17,19],[-18,15]],'#6d655d','#b08d77');rect(-15,-9,24,18,'#536469',3,'#bf9171');line([[-7,-15],[-7,-22],[5,-22],[5,-16]],'#a4826b',4);line([[12,-4],[24,-4],[24,7]],'#9e7b64',5);circle(-4,0,6,'#364b50','#c18b66');line([[-10,12],[5,12]],'#c48f63',2);
 }
 ctx.restore();
}
function drawArm(t){
 const p=endpoint();ctx.save();
 // 全息预测航线随升级变化，三级回收有粒子流指示。
 if(state.phase==='swing'){
  const end={x:PIVOT.x+Math.sin(state.angle)*REACH[state.reach],y:PIVOT.y+Math.cos(state.angle)*REACH[state.reach]};
  ctx.setLineDash([5,9]);line([[PIVOT.x,PIVOT.y],[end.x,end.y]],state.reach===2?'#98efc15a':'#84c8b22b',1);ctx.setLineDash([]);circle(end.x,end.y,7,'#ad543209','#ad543244');
 }
 line([[PIVOT.x+4,PIVOT.y+3],[p.x+4,p.y+3]],'#05202b66',12);
 line([[PIVOT.x,PIVOT.y],[p.x,p.y]],'#725033',10);
 line([[PIVOT.x,PIVOT.y],[p.x,p.y]],'#b99566',6);
 line([[PIVOT.x-1,PIVOT.y],[p.x-1,p.y]],'#f2dfad',2);
 // 伸缩关节与金属箍，灯光沿臂长流动。
 const segments=Math.floor(state.length/45);for(let i=1;i<=segments;i++){const f=i/(segments+1),x=PIVOT.x+(p.x-PIVOT.x)*f,y=PIVOT.y+(p.y-PIVOT.y)*f;ctx.save();ctx.translate(x,y);ctx.rotate(-state.angle);rect(-7,-3,14,6,'#385861',2,'#c6a774');rect(-5,-1,3,2,'#93efd0',1);ctx.restore();}
 circle(PIVOT.x,PIVOT.y,20,'#614532','#8bb7b0');circle(PIVOT.x,PIVOT.y,13,'#a17b4b','#ead096');circle(PIVOT.x,PIVOT.y,6,'#bb5636');
 if(state.hook)drawResource({...state.hook,x:p.x,y:p.y+18},t,true);
 ctx.translate(p.x,p.y);ctx.rotate(-state.angle*.35);rect(-11,-10,22,17,'#6f959a',4,'#e5c68d');rect(-6,-6,12,5,'#63442e',2);rect(-4,-5,8,2,'#bd5936',1);
 const spread=state.hook?11:20;line([[-8,2],[-spread,13],[-spread+3,25],[-spread+9,28]],'#725034',8);line([[8,2],[spread,13],[spread-3,25],[spread-9,28]],'#725034',8);line([[-8,2],[-spread,13],[-spread+3,25],[-spread+9,28]],'#dec18a',4);line([[8,2],[spread,13],[spread-3,25],[spread-9,28]],'#dec18a',4);circle(-8,2,3,'#8ef4ce');circle(8,2,3,'#8ef4ce');ctx.restore();
 if(state.phase==='retract'&&state.speed===2){const f=(t*2)%1;circle(p.x+(PIVOT.x-p.x)*f,p.y+(PIVOT.y-p.y)*f,3,'#bdffe5');}
}
function render(){ctx.clearRect(0,0,W,H);const t=state.visualTime;drawBackground(t);state.items.forEach(item=>drawResource(item,t));drawArm(t);state.particles.forEach(p=>{ctx.globalAlpha=Math.min(1,p.life);rect(p.x,p.y,3,3,p.color,1);});ctx.globalAlpha=1;state.floaters.forEach(f=>{ctx.globalAlpha=Math.min(1,f.life);text(f.text,f.x,f.y,14,f.color);});ctx.globalAlpha=1;}
function frame(now){const dt=Math.min(.035,(now-lastTime)/1000||0);lastTime=now;update(dt);render();requestAnimationFrame(frame);}
let helpReturn='intro';
$('modal').addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;
 if(action==='start'||action==='resume')start();
 if(action==='next'){loadLevel(state.level+1);start();notify(LEVELS[state.level].subtitle);}
 if(action==='again'){loadLevel(0,true);start();}
 if(action==='retry')retry();
 if(action==='home'){loadLevel(0,true);state.mode='intro';modal('intro');}
 if(action==='help'){helpReturn=state.mode;state.mode='help';modal('help');}
 if(action==='back'){state.mode=helpReturn;modal(helpReturn);}
});
$('launchBtn').addEventListener('click',fire);$('dropBtn').addEventListener('click',fire);canvas.addEventListener('pointerdown',e=>{e.preventDefault();fire();canvas.focus({preventScroll:true});});
$('pauseBtn').addEventListener('click',pause);$('reachBtn').addEventListener('click',()=>upgrade('reach'));$('speedBtn').addEventListener('click',()=>upgrade('speed'));
$('soundBtn').addEventListener('click',()=>{state.sound=!state.sound;$('soundBtn').textContent=state.sound?'♫ 音效开':'♫ 音效关';$('soundBtn').setAttribute('aria-pressed',String(state.sound));sound();});
$('fullBtn').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else notify('当前浏览器不支持全屏，请使用浏览器菜单中的全屏功能');}catch{notify('全屏未开启，可使用浏览器菜单或 F11');}});
document.addEventListener('fullscreenchange',()=>{$('fullBtn').textContent=document.fullscreenElement?'⛶ 退出':'⛶ 全屏';});
window.addEventListener('keydown',e=>{
 if(state.mode==='playing'&&e.code==='Space'){e.preventDefault();if(!e.repeat)fire();}
 if(['playing','paused'].includes(state.mode)&&['KeyP','Escape'].includes(e.code)&&!e.repeat){e.preventDefault();pause();}
 if(state.mode==='playing'&&['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code)){e.preventDefault();state.aimInput=['ArrowLeft','KeyA'].includes(e.code)?-1:1;}
 if(state.mode==='playing'&&e.code==='KeyR'&&state.phase==='extend'){state.phase='retract';updateUI();}
});
window.addEventListener('keyup',e=>{if(['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code))state.aimInput=0;});
for(const [id,value]of [['leftBtn',-1],['rightBtn',1]]){$(id).addEventListener('pointerdown',e=>{e.preventDefault();if(state.mode==='playing'){state.aimInput=value;$(id).setPointerCapture(e.pointerId);}});for(const event of ['pointerup','pointercancel','lostpointercapture'])$(id).addEventListener(event,()=>state.aimInput=0);}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.mode==='playing')pause();});window.addEventListener('blur',()=>{state.aimInput=0;if(state.mode==='playing')pause();});
$('modal').addEventListener('keydown',e=>{if(e.key!=='Tab')return;const buttons=[...$('modal').querySelectorAll('button')],first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
loadLevel(0,true);modal('intro');requestAnimationFrame(frame);
})();
