import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceCaseById, practiceCaseFromText, practiceCaseForContext } from './practice-cases.mjs';
import { createAgentBridge } from './agent-bridge.mjs';

test('practice cases are explicit fiction, isolated by product and cannot be mutated by a caller',()=>{
  const pantry=practiceCaseFromText("I'm building PantryPal.");
  assert.equal(pantry.fictional,true);assert.equal(pantry.interviews.count,12);assert.equal(pantry.pilot.payingHouseholds,5);
  pantry.interviews.count=99;assert.equal(practiceCaseById('pantrypal').interviews.count,12);
  assert.equal(practiceCaseFromText('A custom business'),null);
  assert.equal(practiceCaseFromText('PantryPal versus BorrowBox'),null);
  assert.equal(practiceCaseById('borrowbox').pilot.platformRevenue,'$19.20');
  assert.equal(practiceCaseById('studysprint').pilot.monthlyRevenue,'$32');
});
test('case selection survives bounded transcript history, can switch products and clears on reset',()=>{
  const bridge=createAgentBridge();const room=bridge.ensure();
  for(let turn=1;turn<=12;turn++){
    const ticket=bridge.begin(room,{pitch:turn===1?'PantryPal pitch':'A follow-up answer'});
    bridge.finish(ticket,{turn,scores:[50,50,50,50],speakingOrder:[],responses:[]});
  }
  const state=bridge.ownerContext(room);
  assert.equal(state.history.length,10);assert.equal(state.practiceCaseId,'pantrypal');
  assert.equal(practiceCaseForContext(state).interviews.count,12);
  const ticket=bridge.begin(room,{pitch:'Now I am pitching StudySprint.'});
  bridge.finish(ticket,{turn:13,scores:[50,50,50,50],speakingOrder:[],responses:[]});
  assert.equal(bridge.ownerContext(room).practiceCaseId,'studysprint');
  bridge.reset(room);assert.equal(bridge.ownerContext(room).practiceCaseId,null);bridge.close();
});
