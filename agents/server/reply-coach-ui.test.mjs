import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createReplyCoachUI } from '../../frontend/confidence-panel/src/reply-coach.ts';
function setup(t,request){
  const elements=new Map();
  const node=()=>({value:'',textContent:'',disabled:false,checked:true,children:[],events:{},scrollTop:0,scrollHeight:0,
    addEventListener(name,fn){this.events[name]=fn;},append(...items){this.children.push(...items);},appendChild(item){this.children.push(item);},replaceChildren(){this.children=[];}});
  const get=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id);};
  const originals={document:globalThis.document,fetch:globalThis.fetch};
  globalThis.document={getElementById:get,createElement:node};
  globalThis.fetch=request;
  let busy=false, edits=0;const attached=[];
  const coach=createReplyCoachUI('/api',{busy:()=>busy,attach:text=>attached.push(text),edit:()=>edits++});
  t.after(()=>{coach.close();Object.assign(globalThis,originals);});
  return {coach,get,attached,busy:v=>{busy=v;coach.refresh();},edits:()=>edits};
}
const result={bridgeRevision:2,speakingOrder:['technical_expert'],responses:[{role:'technical_expert',panelist:'The CTO',reply:'What works today?'}]};
const reply={revision:2,summary:'A demo pitch.',focus:'Explain what works.',suggestedReply:'Our demo works for [example].'};
test('recommendations never submit themselves; user edits attach only on an explicit idle click',async t=>{
  const f=setup(t,async()=>({ok:true,json:async()=>reply}));
  f.coach.begin('Our demo is ready.');f.coach.complete(result);await setImmediate();
  assert.equal(f.attached.length,0);assert.equal(f.get('coach-transcript').children.length,2);
  f.get('coach-draft').value='My edited answer';f.get('coach-draft').events.input();assert.equal(f.edits(),1);
  f.busy(true);f.get('coach-use').events.click();assert.equal(f.attached.length,0);
  f.busy(false);f.get('coach-use').events.click();assert.deepEqual(f.attached,['My edited answer']);
});
test('a new founder turn or reset discards an old in-flight recommendation',async t=>{
  let resolve;
  const f=setup(t,()=>new Promise(r=>{resolve=r;}));
  f.coach.begin('First pitch');f.coach.complete(result);
  f.coach.begin('New answer');
  resolve({ok:true,json:async()=>reply});await setImmediate();
  assert.equal(f.get('coach-draft').value,'');assert.equal(f.get('coach-use').disabled,true);
  f.coach.reset();assert.equal(f.get('coach-transcript').children.length,0);
});
test('turning automatic suggestions off stops generation but retains the transcript',async t=>{
  let calls=0;const f=setup(t,async()=>{calls++;return{ok:true,json:async()=>reply};});
  f.get('coach-auto').checked=false;f.coach.begin('Pitch');f.coach.complete(result);await setImmediate();
  assert.equal(calls,0);assert.equal(f.get('coach-transcript').children.length,2);
  f.get('coach-refresh').events.click();await setImmediate();assert.equal(calls,1);
});
test('editing a draft while generation is in flight cannot be overwritten by the late reply',async t=>{
  let resolve;const f=setup(t,()=>new Promise(r=>{resolve=r;}));
  f.coach.begin('Pitch');f.coach.complete(result);
  f.get('coach-draft').value='My own careful answer';f.get('coach-draft').events.input();
  resolve({ok:true,json:async()=>reply});await setImmediate();
  assert.equal(f.get('coach-draft').value,'My own careful answer');
  f.get('coach-use').events.click();assert.deepEqual(f.attached,['My own careful answer']);
});
