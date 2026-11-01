export const WALK_STATIONS=Object.freeze([
 {id:'origins',number:'00',name:'崛起前夜',subtitle:'从规则与符号，到数据驱动学习',x:-7,z:7},
 {id:'match',number:'01',name:'世纪对局',subtitle:'2016 · 棋盘与分布式计算系统',x:7,z:7},
 {id:'decision',number:'02',name:'决策之核',subtitle:'策略、价值与树搜索的协作',x:-7,z:0},
 {id:'dimensions',number:'03',name:'维度解剖',subtitle:'进入张量与卷积的内部',x:7,z:0},
 {id:'growth',number:'04',name:'成长系统',subtitle:'工具、反馈与自我对弈',x:-7,z:-7},
]);

// Short movement steps resolve each axis independently, allowing sliding beside a plinth.
export function walkPosition(position,delta){
 const next={x:position.x,z:position.z};
 const blocked=(x,z)=>Math.abs(x)>10.7||z>13||z< -12.7||
   WALK_STATIONS.some(s=>Math.abs(x-s.x)<2.35&&Math.abs(z-s.z)<2.05)||Math.hypot(x,z+.8)<2.15;
 for(const axis of ['x','z']){const value=next[axis]+delta[axis];if(!blocked(axis==='x'?value:next.x,axis==='z'?value:next.z))next[axis]=value;}
 return next;
}
