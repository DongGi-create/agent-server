import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.mjs';
import {Engine} from '../src/engine.mjs';

class FakeProvider extends EventEmitter {
  id='example';connected=true;
  start(){}stop(){}
  models(){return [{id:'test-model',label:'Test model',isDefault:true,defaultEffort:'low',efforts:['low']}]}
  usage(){return {known:true,blocked:false,retryAt:Date.now()+300000,windows:[]}}
  readSession(){return {active:false,model:'test-model',effort:'low'}}
  openSession({sessionId}){return {sessionId:sessionId||'session-1',model:'test-model',effort:'low'}}
  startTurn(){return {turnId:'turn-1'}}
  steer(){}interrupt(){}answerApproval(){}rejectApproval(){}
  isRateLimitError(){return false}
  prepareInput(_store,messages){return {text:messages.map(m=>m.text).join('\n')}}
  classifyTask(){return {action:'new',title:'New task'}}
}

test('core completes a task through a provider without Codex protocol objects',async t=>{
  const root=mkdtempSync(join(tmpdir(),'provider-contract-'));
  const store=new Store(join(root,'db.sqlite'));
  t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});
  const provider=new FakeProvider();
  const engine=new Engine(store,provider,{workspaceRoot:root,maxConcurrent:1,maxCycles:2,turnTimeoutMinutes:30,digestHours:[],timezone:'Asia/Seoul'});
  const task=engine.create({goal:'Write a report'});
  assert.equal(task.provider_id,'example');
  await engine.tick();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(store.get(task.id).status,'running');
  provider.emit('message',{sessionId:'session-1',turnId:'turn-1',phase:'final_answer',text:JSON.stringify({status:'completed',summary:'Report done',question:'',options:[]})});
  provider.emit('turnCompleted',{sessionId:'session-1',turnId:'turn-1',status:'completed'});
  assert.equal(store.get(task.id).status,'completed');
  assert.equal(store.get(task.id).summary,'Report done');
});
