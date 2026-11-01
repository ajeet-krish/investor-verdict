import test from 'node:test';
import assert from 'node:assert/strict';
import { createPitchSuggestions } from '../../frontend/confidence-panel/src/pitch-suggestions.ts';
function setup(t,request){
  const node=()=>({textContent:'',children:[],events:{},disabled:false,append(...els){this.children.push(...els);},appendChild(el){this.children.push(el);},replaceChildren(){this.children=[];},addEventListener(name,fn){this.events[name]=fn;}});
  const elements=new Map(['pitch-options','pitch-heading','pitch-status'].map(id=>[id,node()]));
  elements.get('pitch-options').querySelectorAll=()=>['PantryPal','BorrowBox','StudySprint'].map(label=>({querySelector:selector=>({textContent:selector==='.pitch-title'?label:`A practice pitch for ${label}.`})}));
  const originals={document:globalThis.document,fetch:globalThis.fetch};
  globalThis.document={getElementById:id=>elements.get(id),createElement:node};globalThis.fetch=request;
  let busy=false;const attached=[];
  const ui=createPitchSuggestions('/api',{busy:()=>busy,attach:text=>attached.push(text)});
  t.after(()=>{ui.close();Object.assign(globalThis,originals);});
  return{ui,attached,elements,busy:v=>{busy=v;ui.refresh();},buttons:()=>elements.get('pitch-options').children.map(li=>li.children[0])};
}
const suggestions=[{label:'Direct',reply:'We have not tested that yet.'},{label:'Next step',reply:'I would test this with five customers.'},{label:'Clarify',reply:'Which part would you test first?'}];
const response=revision=>({ok:true,json:async()=>({revision,suggestions})});
test('starter pitches need no API call; completed round uses its revision and attaches without sending',async t=>{
  const calls=[];const f=setup(t,async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return response(4);});
  assert.equal(calls.length,0);assert.equal(f.buttons().length,3);
  f.buttons()[0].events.click();assert.match(f.attached[0],/PantryPal/);
  f.ui.begin();assert.equal(f.buttons().length,0);
  f.busy(true);await f.ui.complete(4);
  assert.deepEqual(calls,[{url:'/api/coach',body:{revision:4}}]);
  assert.ok(f.buttons().every(b=>b.disabled));
  f.buttons()[1].events.click();assert.equal(f.attached.length,1);
  f.busy(false);f.buttons()[1].events.click();assert.equal(f.attached[1],suggestions[1].reply);
});
test('reset or a new founder turn discards a late suggestion response',async t=>{
  let release;const f=setup(t,()=>new Promise(resolve=>{release=resolve;}));
  f.ui.begin();const pending=f.ui.complete(4);f.ui.reset();
  release(response(4));await pending;assert.match(f.buttons()[0].children[0].textContent,/PantryPal/);
  const next=f.ui.complete(5);f.ui.begin();release(response(5));await next;assert.equal(f.buttons().length,0);
});
test('model failure does not attach text or make another paid request',async t=>{
  let calls=0;const f=setup(t,async()=>{calls++;return{ok:false,json:async()=>({error:'Model unavailable'})};});
  f.ui.begin();await f.ui.complete(3);assert.equal(calls,1);assert.equal(f.attached.length,0);
  assert.equal(f.elements.get('pitch-status').textContent,'Model unavailable');
});
