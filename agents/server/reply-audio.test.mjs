import test from 'node:test';
import assert from 'node:assert/strict';
import { createReplyAudio, INVESTOR_VOICES } from './reply-audio.mjs';
import { PanelError } from './text-panel.mjs';
const collect = async stream => { const parts=[]; for await (const part of stream) parts.push(Buffer.from(part)); return Buffer.concat(parts).toString(); };

test('only the authorized selected reply is synthesized, streamed and cached once', async t => {
  let calls=0, release;
  const waiting=new Promise(resolve=>{release=resolve;});
  const service=createReplyAudio({
    textPanel:{getSpeech:(session,turn)=>{assert.equal(session,'session');assert.equal(turn,2);return {role:'interrogator',text:'A selected reply.'};}},
    synthesize:async ({voiceId,text})=>{calls++;assert.equal(voiceId,INVESTOR_VOICES.interrogator);assert.equal(text,'A selected reply.');return (async function*(){yield Buffer.from('first');await waiting;yield Buffer.from('second');})();},
  });
  t.after(()=>service.close());
  const first=service.open('session',2);
  assert.equal(Buffer.from((await first.next()).value).toString(),'first','first bytes stream before generation completes');
  const replay=collect(service.open('session',2));
  release();
  assert.equal(Buffer.from((await first.next()).value).toString(),'second');
  await first.next();
  assert.equal(await replay,'firstsecond');
  assert.equal(await collect(service.open('session',2)),'firstsecond');
  assert.equal(calls,1);
});

test('silence, expired cookies and old turns cannot synthesize audio', () => {
  let calls=0;
  const service=createReplyAudio({textPanel:{getSpeech:()=>{throw new PanelError('No selected reply.',404);}},synthesize:async()=>{calls++;}});
  assert.throws(()=>service.open('missing',1),/No selected reply/);
  assert.equal(calls,0);service.close();
});

test('reset aborts an active synthesis and releases its listener', async () => {
  let signal;
  const service=createReplyAudio({textPanel:{getSpeech:()=>({role:'sympathizer',text:'Selected.'})},synthesize:async args=>{
    signal=args.signal;
    return (async function*(){await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));})();
  }});
  const stream=service.open('session',1);
  const pending=stream.next();
  const rejected=assert.rejects(pending,/stopped|failed/);
  service.reset('session');
  await rejected;
  assert.equal(signal.aborted,true);service.close();
});

test('provider failures are sanitized and never retried automatically', async () => {
  let calls=0;
  const service=createReplyAudio({textPanel:{getSpeech:()=>({role:'technical_expert',text:'Selected.'})},synthesize:async()=>{calls++;throw new Error('private-api-key');}});
  await assert.rejects(collect(service.open('session',1)),error=>!error.message.includes('private-api-key'));
  await assert.rejects(collect(service.open('session',1)));
  assert.equal(calls,1);service.close();
});

test('disconnect cancels generation when no listeners remain', async () => {
  let upstreamSignal;
  const service=createReplyAudio({textPanel:{getSpeech:()=>({role:'technical_expert',text:'Selected.'})},synthesize:async ({signal})=>{
    upstreamSignal=signal;
    return (async function*(){yield Buffer.from('first');await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));})();
  }});
  const abort=new AbortController();
  const stream=service.open('session',1,abort.signal);
  await stream.next();abort.abort();await stream.next();
  assert.equal(upstreamSignal.aborted,true);service.close();
});
