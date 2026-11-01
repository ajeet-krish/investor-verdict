import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createReplyCoach } from './reply-coach.mjs';
import { createApiServer } from './app.mjs';
import { createAgentBridge } from './agent-bridge.mjs';
const env = { openai_key: 'private-coach-test-value' };
const answer = { summary: 'The panel asked about customers.', focus: 'Say what you know.', suggestions: [{label:'Direct',reply:'We have five demo users so far.'},{label:'Next step',reply:'I will check customer usage.'},{label:'Clarify',reply:'Which customer group matters most to you?'}] };
const response = () => ({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(answer) }] }] }) });
const context = { revision: 2, busy: false, history: [{ founder: 'Five people tested our demo.', responses: [{ role: 'market_signals_researcher', reply: 'Who pays?' }] }], lastResult: { responses: [{ panelist: 'The VP', reason: 'private scoring rationale', pendingConcern: { text: 'Who pays?' } }] } };

test('coach uses server history and public concerns, keeps key server-side, and caches identical requests', async () => {
  const calls = [];
  const coach = createReplyCoach({ env, fetchImpl: async (url, options) => { calls.push({ url, options }); return response(); } });
  const first = await coach.recommend('room', context, { revision: 2, note: 'Make it short.', history: 'spoofed' });
  assert.deepEqual(first, { revision: 2, ...answer });
  assert.deepEqual(await coach.recommend('room', context, { revision: 2, note: 'Make it short.' }), first);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${env.openai_key}`);
  const request = JSON.parse(calls[0].options.body);
  assert.equal(request.model, 'gpt-6.1-terra'); assert.deepEqual(request.reasoning, { effort: 'medium' });
  assert.equal(request.store, false); assert.equal(request.text.format.strict, true);
  assert.ok(request.input.includes('Five people tested'));
  assert.ok(!request.input.includes('private scoring rationale'));
  assert.ok(!request.input.includes('spoofed'));
  assert.ok(!JSON.stringify(first).includes(env.openai_key));
  coach.close();
});

test('missing key, stale rounds and oversized notes do not call the provider', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return response(); };
  await assert.rejects(createReplyCoach({ env: {}, fetchImpl }).recommend('r', context, { revision: 2 }), { status: 503 });
  const coach = createReplyCoach({ env, fetchImpl });
  for (const [state, body, status] of [[context,{revision:1},409],[{...context,busy:true},{revision:2},409],[context,{revision:2,note:'a'.repeat(1001)},400]]) {
    await assert.rejects(coach.recommend('r', state, body), { status });
  }
  assert.equal(calls, 0); coach.close();
});

test('provider failures are sanitized and never retried automatically', async () => {
  let calls = 0;
  const coach = createReplyCoach({ env, fetchImpl: async () => { calls++; throw new Error(env.openai_key); } });
  await assert.rejects(coach.recommend('r',context,{revision:2}), error => error.status === 502 && !error.message.includes(env.openai_key));
  assert.equal(calls,1);coach.close();
  const incomplete = createReplyCoach({ env, fetchImpl: async () => ({ ok:true,json:async()=>({status:'incomplete'}) }) });
  await assert.rejects(incomplete.recommend('r',context,{revision:2}),{status:502});incomplete.close();
});

test('reset cancels paid generation and clears cached suggestions', async () => {
  let started;
  const ready = new Promise(resolve => { started=resolve; });
  const coach = createReplyCoach({ env, fetchImpl: (_url, options) => new Promise((_resolve,reject) => {
    options.signal.addEventListener('abort',()=>reject(new Error('cancelled')));started();
  }) });
  const pending = coach.recommend('r',context,{revision:2});
  await ready;
  await assert.rejects(coach.recommend('r',context,{revision:2}),{status:409});
  coach.reset('r');await assert.rejects(pending,{status:502});coach.close();
});

test('coach rate limit bounds repeated paid refinements', async () => {
  let calls=0;
  const coach=createReplyCoach({env,fetchImpl:async()=>{calls++;return response();}});
  for(let i=0;i<6;i++)await coach.recommend('r',context,{revision:2,note:`variation ${i}`});
  await assert.rejects(coach.recommend('r',context,{revision:2,note:'extra'}),{status:429});
  assert.equal(calls,6);coach.close();
});

test('HTTP coach requires room ownership and rejects results from a reset conversation',async t=>{
  const bridge=createAgentBridge();const room=bridge.ensure();
  const ticket=bridge.begin(room,{pitch:'My real pitch'});
  const revision=bridge.finish(ticket,{turn:1,scores:[50,50,50,50],speakingOrder:[],responses:[]});
  let release;let calls=0;
  const server=createApiServer({env:{},agentBridge:bridge,replyCoach:{recommend:async(_room,c)=>{calls++;await new Promise(r=>{release=r;});return{...answer,revision:c.revision};}}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();bridge.close();});
  const request=(cookie='',origin='http://127.0.0.1:5173')=>fetch(`http://127.0.0.1:${server.address().port}/api/coach`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,Origin:origin},body:JSON.stringify({revision})});
  assert.equal((await request()).status,410);
  assert.equal((await request(`verdict_room=${room}`,'https://other.example')).status,403);
  assert.equal(calls,0);
  const pending=request(`verdict_room=${room}`);
  while(!release)await new Promise(r=>setTimeout(r,5));
  bridge.reset(room);release();
  const res=await pending;assert.equal(res.status,409);assert.equal(res.headers.get('cache-control'),'no-store');
});

test('coach can tailor opening options before any founder message',async()=>{
  let sent;
  const coach=createReplyCoach({env,fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body);return response();}});
  const opening=await coach.recommend('new-room',{revision:0,busy:false,history:[],lastResult:null},{revision:0,note:'An app for university startup clubs.'});
  assert.equal(opening.suggestions.length,3);
  assert.deepEqual(JSON.parse(sent.input).conversation,[]);
  assert.equal(JSON.parse(sent.input).founderNote,'An app for university startup clubs.');
  coach.close();
});

test('invalid or missing option lists are rejected without an automatic retry',async()=>{
  let calls=0;
  const coach=createReplyCoach({env,fetchImpl:async()=>{calls++;return{ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({...answer,suggestions:[]})}]}]})};}});
  await assert.rejects(coach.recommend('r',context,{revision:2}),{status:502});assert.equal(calls,1);coach.close();
});
test('PantryPal suggestions receive fixed case facts, not filler from the prior founder reply',async()=>{
  let sent;
  const coach=createReplyCoach({env,fetchImpl:async(_url,options)=>{sent=JSON.parse(JSON.parse(options.body).input);return response();}});
  const state={...context,history:[{founder:'I am building PantryPal.',responses:[]},{founder:'I spoke with [people].',responses:[]}],practiceCaseId:'pantrypal'};
  await coach.recommend('case',state,{revision:2});
  assert.equal(sent.fixedFictionalPracticeCase.interviews.count,12);
  assert.equal(sent.fixedFictionalPracticeCase.interviews.people[0].name,'Maya Chen');
  assert.match(sent.fixedFictionalPracticeCase.interviews.paymentFeedback,/8 of the 12/);
  assert.equal(sent.fixedFictionalPracticeCase.fictional,true);coach.close();
});
test('placeholder suggestions cannot reach the composer',async()=>{
  const withPlaceholder={...answer,suggestions:[{label:'Answer',reply:'I spoke to [people].'},...answer.suggestions.slice(1)]};
  const coach=createReplyCoach({env,fetchImpl:async()=>({ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(withPlaceholder)}]}]})})});
  await assert.rejects(coach.recommend('r',context,{revision:2}),{status:502});coach.close();
});
