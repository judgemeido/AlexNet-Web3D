import {test} from 'node:test';
import assert from 'node:assert/strict';
import {walkPosition,WALK_STATIONS} from '../assets/walk-state.mjs';
import {EXHIBITS} from '../assets/museum-data.mjs';

test('walk stations link all five real exhibits',()=>assert.deepEqual(WALK_STATIONS.map(s=>s.id),EXHIBITS.map(s=>s[0])));
test('movement can traverse both sides of the central sculpture without entering it',()=>{
 for(const side of [-1,1]){
  let p={x:0,z:11};
  for(let i=0;i<20;i++)p=walkPosition(p,{x:side*.15,z:0});
  for(let i=0;i<140;i++)p=walkPosition(p,{x:0,z:-.15});
  assert.ok(p.z< -9);
 }
 let p={x:0,z:11};
 for(let i=0;i<200;i++)p=walkPosition(p,{x:0,z:-.15});
 assert.ok(p.z>1.3);assert.ok(p.z<1.6);
});
test('walls and every exhibition plinth prevent entry while permitting sliding',()=>{
 for(const s of WALK_STATIONS){
  let p={x:s.x,z:s.z+3};
  for(let i=0;i<40;i++)p=walkPosition(p,{x:0,z:-.15});
  assert.ok(p.z>=s.z+2.05);
 }
 const p=walkPosition({x:10.7,z:11},{x:.1,z:-.1});assert.equal(p.x,10.7);assert.equal(p.z,10.9);
 let q={x:3,z:11};for(let i=0;i<300;i++)q=walkPosition(q,{x:0,z:-.15});assert.ok(q.z>=-12.7&&q.z< -12.4);
});
