import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealtimeVoice } from '../../frontend/confidence-panel/src/realtime-voice.ts';
import { createReplyPlayer } from '../../frontend/confidence-panel/src/reply-player.ts';

function harness(token=async()=> 'temporary-token') {
  const handlers=new Map(), states=[], transcripts=[], errors=[];
  let muted=false, closed=0, options;
  const socket={on:(event,callback)=>handlers.set(event,callback),mute:()=>{muted=true;},unmute:()=>{muted=false;},close:()=>{closed++;handlers.get('close')?.();}};
  const voice=createRealtimeVoice({onFinal:text=>transcripts.push(text),onInterim:()=>{},onState:state=>states.push(state),onError:error=>errors.push(error)},token,config=>{options=config;return socket;});
  return {voice,states,transcripts,errors,emit:(event,data)=>handlers.get(event)?.(data),get muted(){return muted;},get closed(){return closed;},get options(){return options;}};
}

test('live microphone uses VAD, mutes before a committed turn, ignores late transcripts, and resumes', async t=>{
  const h=harness();t.after(()=>h.voice.stop());
  await h.voice.start();assert.equal(h.options.commitStrategy,'vad');
  assert.equal(h.states.at(-1),'connecting');
  h.emit('audio_started');assert.equal(h.states.at(-1),'listening');
  h.emit('committed_transcript',{text:'My pitch.'});
  assert.equal(h.muted,true);assert.deepEqual(h.transcripts,['My pitch.']);
  h.emit('committed_transcript',{text:'Late echo.'});assert.equal(h.transcripts.length,1);
  h.voice.resume();assert.equal(h.muted,false);
  h.emit('committed_transcript',{text:'Next answer.'});assert.equal(h.transcripts.length,2);
  h.voice.stop();h.emit('committed_transcript',{text:'After leaving.'});assert.equal(h.transcripts.length,2);
});

test('stop during token acquisition cannot reopen a microphone', async()=>{
  let release;
  const h=harness(()=>new Promise(resolve=>{release=resolve;}));
  const starting=h.voice.start();h.voice.stop();release('temporary-token');await starting;
  assert.equal(h.options,undefined);assert.equal(h.voice.enabled,false);
});

test('connection errors close capture instead of reconnecting repeatedly', async()=>{
  const h=harness();await h.voice.start();h.emit('audio_started');h.emit('error',{});
  assert.equal(h.voice.enabled,false);assert.equal(h.closed,1);assert.equal(h.errors.length,1);
});

function audioMock(play=()=>Promise.resolve()) {
  return {hidden:true,src:'',onended:null,onerror:null,play,pause(){},load(){},removeAttribute(){this.src='';}};
}
test('new playback stops the previous reply; stop resolves pending playback', async()=>{
  const audio=audioMock();const player=createReplyPlayer(audio,()=>{});
  const first=player.play('/one');const second=player.play('/two');
  assert.equal(await first,false);assert.equal(audio.src,'/two');player.stop();assert.equal(await second,false);
});
test('blocked autoplay waits for explicit play or skip without generating a new request', async()=>{
  let blocked=0;const audio=audioMock(()=>Promise.reject({name:'NotAllowedError'}));
  const player=createReplyPlayer(audio,()=>blocked++);const playing=player.play('/one');
  await Promise.resolve();assert.equal(blocked,1);audio.onended();assert.equal(await playing,true);
});
