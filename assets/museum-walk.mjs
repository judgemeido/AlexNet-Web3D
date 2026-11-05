import * as T from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {loadGltfAsset} from './gltf-asset.mjs';
import {loadEngineeringModel,disposeEngineeringModel} from './engineering-models.mjs';
import sculptureBytes from './models/learning-sculpture.glb';
import {WALK_STATIONS,walkPosition} from './walk-state.mjs';

export function mountMuseumWalk({navigate}){
 const trigger=document.createElement('button');trigger.type='button';trigger.id='museum-walk-open';trigger.className='walk-open';trigger.textContent='进入三维展馆 ↗';
 const nav=document.querySelector('.main-nav');nav.insertAdjacentElement('afterend',trigger);
 const dialog=document.createElement('dialog');dialog.className='walk-dialog';dialog.id='museum-walk';dialog.setAttribute('aria-labelledby','walk-title');
 dialog.innerHTML=`<div class="walk-stage"><canvas aria-label="三维博物馆。WASD或方向键移动，拖动环视，也可使用屏幕移动按钮及五个展区入口。" tabindex="0"></canvas></div><header class="walk-top"><div><span>常设展 / 自由漫游</span><h2 id="walk-title">机器落下的一手</h2></div><button type="button" data-walk-close aria-label="退出三维展馆">退出展馆 ×</button></header><nav class="walk-directory" aria-label="进入五个展区">${WALK_STATIONS.map(s=>`<button type="button" data-walk-station="${s.id}"><span>${s.number}</span>${s.name}<i>↗</i></button>`).join('')}</nav><div class="walk-loading" role="status">正在布置三维展厅…</div><div class="walk-error" hidden>三维环境未能初始化。仍可通过左侧入口参观全部展区。</div><div class="walk-placard"><span>中央装置 / 学习之核</span><p>本地生成的抽象雕塑，以汇聚的环表达数据、计算与学习。</p><small>艺术化表达 · 非算法结构</small></div><div class="walk-controls" role="group" aria-label="移动"><button type="button" data-walk-move="forward" aria-label="向前移动">↑</button><button type="button" data-walk-move="left" aria-label="向左移动">←</button><button type="button" data-walk-move="back" aria-label="向后移动">↓</button><button type="button" data-walk-move="right" aria-label="向右移动">→</button></div><div class="walk-bottom"><p>拖动环视 · 方向键 / WASD 移动 · 点击展品进入</p><button type="button" data-walk-home>回到入口 ↺</button><button type="button" data-walk-nearest>前往世纪对局 ↗</button><span class="walk-status" role="status" aria-live="polite"></span></div>`;
 document.body.appendChild(dialog);
 const abort=new AbortController(),on=(target,type,fn,options={})=>target.addEventListener(type,fn,{...options,signal:abort.signal});
 const canvas=dialog.querySelector('canvas'),stage=dialog.querySelector('.walk-stage'),loading=dialog.querySelector('.walk-loading');
 const keys=new Set(),pointer=new T.Vector2(),ray=new T.Raycaster(),position={x:0,z:11};
 let renderer,scene,camera,environment,sculpture,raf=0,last=0,drag=null,yaw=0,pitch=0,returnFocus,nearest='match',destroyed=false,loadingPromise,openState=false;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const ownedMaterials=new Set(),ownedGeometries=new Set(),ownedTextures=new Set();
 function material(color,metalness=.2,roughness=.5){const m=new T.MeshStandardMaterial({color,metalness,roughness});ownedMaterials.add(m);return m;}
 function mesh(geometry,mat,parent=scene){ownedGeometries.add(geometry);const object=new T.Mesh(geometry,mat);parent.add(object);return object;}
 const cube=(size,pos,mat,parent)=>{const m=mesh(new T.BoxGeometry(...size),mat,parent);m.position.set(...pos);return m;};
 function label(text,sub,width=4,height=1){
  const image=document.createElement('canvas');image.width=1024;image.height=256;
  const c=image.getContext('2d');c.fillStyle='#182024';c.fillRect(0,0,1024,256);c.fillStyle='#cbb88d';c.fillRect(30,30,5,196);c.font='500 64px "Microsoft YaHei", sans-serif';c.fillStyle='#eee9dc';c.fillText(text,65,112);c.font='28px "Microsoft YaHei", sans-serif';c.fillStyle='#a7b7b3';c.fillText(sub,66,179);
  const texture=new T.CanvasTexture(image);texture.colorSpace=T.SRGBColorSpace;ownedTextures.add(texture);
  const mat=new T.MeshBasicMaterial({map:texture,side:T.DoubleSide});ownedMaterials.add(mat);
  return mesh(new T.PlaneGeometry(width,height),mat);
 }
 function connector(a,b,mat,parent){const d=new T.Vector3().subVectors(b,a),o=mesh(new T.CylinderGeometry(.018,.018,d.length(),6),mat,parent);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());}
 function node(position,r,mat,parent){const m=mesh(new T.IcosahedronGeometry(r,2),mat,parent);m.position.set(...position);return m;}
 function stationMiniature(station,group,mats){
  const {mint,gold,lavender,graphite}=mats;
  if(station.id==='origins'||station.id==='decision'){
   const levels=station.id==='origins'?[3,1,2]:[1,3,6];
   let previous=[];
   levels.forEach((count,layer)=>{const row=[];for(let i=0;i<count;i++){const p=new T.Vector3((i-(count-1)/2)*(count>3?.43:.8),1.0+layer*.65,0);node(p.toArray(),layer===1?.18:.12,layer===1?gold:mint,group);for(const from of previous)connector(from,p,graphite,group);row.push(p);}previous=row;});
  }else if(station.id==='dimensions'){
   for(let i=0;i<7;i++){const w=1.65-i*.15;cube([.12,w,w],[(i-3)*.37,1.65,0],i%2?lavender:mint,group);}
   for(let j=0;j<6;j++)connector(new T.Vector3(-1.3,1.1+j*.18,.9),new T.Vector3(1.4,1.1+j*.18,.5),gold,group);
  }else if(station.id==='growth'){
   for(let y=0;y<3;y++)for(let x=0;x<3;x++){const p=[(x-1)*.6,1.2+y*.55,0];node(p,.16,(x+y)%2?mint:gold,group);if(x>0)connector(new T.Vector3(p[0]-.6,p[1],0),new T.Vector3(...p),graphite,group);}
  }
 }
 function trackImported(root){root.traverse(o=>{if(o.geometry)ownedGeometries.add(o.geometry);for(const m of [].concat(o.material||[])){ownedMaterials.add(m);for(const v of Object.values(m))if(v?.isTexture)ownedTextures.add(v);}});}
 async function build(){
  renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
  scene=new T.Scene();scene.background=new T.Color(0x10171d);scene.fog=new T.Fog(0x10171d,23,48);
  camera=new T.PerspectiveCamera(58,1,.1,90);camera.rotation.order='YXZ';
  const pm=new T.PMREMGenerator(renderer),room=new RoomEnvironment();environment=pm.fromScene(room,.05);scene.environment=environment.texture;pm.dispose();room.dispose();
  scene.add(new T.HemisphereLight(0xdde7e9,0x192223,2.2));const light=new T.DirectionalLight(0xffe9cc,3);light.position.set(0,12,6);scene.add(light);
  const mats={floor:material(0x182326,.3,.4),wall:material(0x253236,.5,.44),graphite:material(0x45585a,.7,.35),mint:material(0x76b4ac,.6,.29),gold:material(0xbda477,.7,.29),lavender:material(0x938aa8,.5,.35)};
  cube([24,.25,30],[0,-.18,0],mats.floor);cube([24,8,.35],[0,4,-14],mats.wall);
  for(const sign of [-1,1]){cube([.35,8,30],[sign*12,4,0],mats.wall);for(let z=-11;z<14;z+=6){cube([.6,7.5,.7],[sign*11.6,3.75,z],mats.graphite);cube([.035,6.6,.04],[sign*11.25,3.7,z+.4],mats.gold);}}
  for(const x of [-3.7,3.7])cube([.024,.008,27],[x,-.046,0],mats.gold);
  for(let z=-12;z<=12;z+=3)cube([23,.008,.018],[0,-.044,z],mats.graphite);
  for(let z=-11;z<=13;z+=6){cube([23,.25,.25],[0,7.4,z],mats.graphite);cube([8,.03,.12],[0,7.23,z],mats.gold);}
  const banner=label('2016 · 机器落下的一手','规则、数据、算力与学习，汇合于一张棋盘',9,2.25);banner.position.set(0,4.7,-13.78);
  const groups=new Map();
  for(const station of WALK_STATIONS){
   const group=new T.Group();group.position.set(station.x,0,station.z);group.userData.station=station.id;scene.add(group);groups.set(station.id,group);
   cube([3.9,.68,3.3],[0,.29,0],mats.wall,group);cube([3.94,.035,3.34],[0,.65,0],mats.gold,group);
   const plaque=label(station.number+'  '+station.name,station.subtitle,3.9,.98);plaque.position.set(station.x,3.4,station.z-.65);plaque.userData.station=station.id;plaque.rotation.y=station.x<0?.18:-.18;
   stationMiniature(station,group,mats);
  }
  const pedestal=mesh(new T.CylinderGeometry(1.65,1.8,.8,64),mats.wall);pedestal.position.set(0,.35,-.8);
  const trim=mesh(new T.TorusGeometry(1.67,.025,8,64),mats.gold);trim.rotation.x=Math.PI/2;trim.position.set(0,.76,-.8);
  const coreLabel=label('学习之核','数据 × 计算 × 学习 / 抽象装置',2.5,.625);coreLabel.position.set(0,.45,1.04);
  const loaded=await Promise.allSettled([loadEngineeringModel('match'),loadEngineeringModel('gpu'),loadGltfAsset(sculptureBytes)]);
  loaded.forEach((result,index)=>{
   if(result.status==='rejected'){console.error('展品载入失败',result.reason);return;}
   const root=index===2?result.value.scene:result.value;
   if(destroyed){disposeEngineeringModel(root);return;}
   trackImported(root);
   if(index<2){const group=groups.get(index===0?'match':'growth');const box=new T.Box3().setFromObject(root),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());const scale=3.2/Math.max(size.x,size.y,size.z);root.scale.setScalar(scale);root.position.set(-center.x*scale,.73-box.min.y*scale,-center.z*scale);root.rotation.y=index===0?-.25:.25;group.add(root);}
   else{sculpture=root;root.scale.setScalar(1.05);root.position.set(0,.79,-.8);scene.add(root);}
  });
  if(destroyed)return;
  loading.hidden=true;canvas.dataset.ready='true';size();
  canvas.getWalkSnapshot=()=>({position:{...position},yaw,pitch,nearest,stations:WALK_STATIONS.length,sculpture:!!sculpture,triangles:renderer.info.render.triangles,open:dialog.open,portals:WALK_STATIONS.map(station=>{const point=new T.Vector3(station.x,3.4,station.z-.65).project(camera);return {id:station.id,x:(point.x+1)*stage.clientWidth/2,y:(1-point.y)*stage.clientHeight/2,z:point.z};})});
 }
 function size(){if(!renderer||!dialog.open)return;const width=stage.clientWidth,height=stage.clientHeight;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
 const observer=new ResizeObserver(size);observer.observe(stage);
 function home(){position.x=0;position.z=11;yaw=0;pitch=0;keys.clear();}
 function updateNearest(){let best=Infinity,candidate;for(const s of WALK_STATIONS){const d=Math.hypot(position.x-s.x,position.z-s.z);if(d<best){best=d;candidate=s;}}
  if(candidate.id!==nearest){nearest=candidate.id;dialog.querySelector('[data-walk-nearest]').textContent='前往'+candidate.name+' ↗';}}
 function loop(now){if(!dialog.open||destroyed)return;raf=requestAnimationFrame(loop);const dt=Math.min(.05,(now-last)/1000||0);last=now;
  if(document.hidden||!camera)return;
  let forward=Number(keys.has('forward'))-Number(keys.has('back')),side=Number(keys.has('right'))-Number(keys.has('left'));const norm=Math.hypot(forward,side)||1;forward/=norm;side/=norm;
  const next=walkPosition(position,{x:(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*dt*3.8,z:(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*dt*3.8});Object.assign(position,next);
  camera.position.set(position.x,1.65,position.z);camera.rotation.set(pitch,yaw,0,'YXZ');updateNearest();if(sculpture&&!reduced)sculpture.rotation.y=now*.00009;
  renderer.render(scene,camera);
 }
 function enter(id){dialog.close();navigate('#'+id);}
 async function open(){if(destroyed||dialog.open)return;returnFocus=document.activeElement;home();dialog.showModal();openState=true;document.body.dataset.walkOpen='true';document.dispatchEvent(new CustomEvent('museum-walk-state',{detail:{open:true}}));canvas.focus();
  if(!loadingPromise)loadingPromise=build().catch(error=>{loading.hidden=true;dialog.querySelector('.walk-error').hidden=false;console.error(error);});
  await loadingPromise;if(dialog.open&&!destroyed){size();last=performance.now();cancelAnimationFrame(raf);raf=requestAnimationFrame(loop);}}
 on(trigger,'click',open);
 function finishClose(){if(!openState)return;openState=false;cancelAnimationFrame(raf);keys.clear();drag=null;delete document.body.dataset.walkOpen;document.dispatchEvent(new CustomEvent('museum-walk-state',{detail:{open:false}}));returnFocus?.focus?.();}
 on(dialog,'close',finishClose);
 on(dialog,'click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-walk-close'))dialog.close();if(b.hasAttribute('data-walk-home'))home();if(b.dataset.walkStation)enter(b.dataset.walkStation);if(b.hasAttribute('data-walk-nearest'))enter(nearest);});
 const keyMap={KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};
 on(dialog,'keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;if(keyMap[e.code]){e.preventDefault();keys.add(keyMap[e.code]);}});on(dialog,'keyup',e=>{if(keyMap[e.code]){e.preventDefault();keys.delete(keyMap[e.code]);}});
 on(window,'blur',()=>keys.clear());on(document,'visibilitychange',()=>keys.clear());
 for(const button of dialog.querySelectorAll('[data-walk-move]')){on(button,'pointerdown',e=>{e.preventDefault();keys.add(button.dataset.walkMove);button.setPointerCapture(e.pointerId);});for(const event of ['pointerup','pointercancel','lostpointercapture'])on(button,event,()=>keys.delete(button.dataset.walkMove));}
 on(canvas,'pointerdown',e=>{if(!camera||!e.isPrimary||e.button!==0)return;canvas.focus();drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};canvas.setPointerCapture(e.pointerId);});
 on(canvas,'pointermove',e=>{if(!drag)return;yaw-=(e.clientX-drag.x)*.003;pitch=T.MathUtils.clamp(pitch-(e.clientY-drag.y)*.003,-.8,.8);drag.x=e.clientX;drag.y=e.clientY;});
 on(canvas,'pointerup',e=>{if(!drag)return;const d=drag;drag=null;if(Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>6)return;const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(scene.children,true)[0];let object=hit?.object;while(object){if(object.userData.station){enter(object.userData.station);return;}object=object.parent;}});
 on(canvas,'pointercancel',()=>drag=null);
 on(canvas,'lostpointercapture',()=>drag=null);
 return {open,destroy(){destroyed=true;if(dialog.open)dialog.close();finishClose();abort.abort();observer.disconnect();cancelAnimationFrame(raf);ownedGeometries.forEach(g=>g.dispose());ownedTextures.forEach(t=>t.dispose());ownedMaterials.forEach(m=>m.dispose());environment?.dispose();renderer?.dispose();trigger.remove();dialog.remove();}};
}
