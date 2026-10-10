import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve,sep } from 'node:path';
import { Store } from '../src/store.mjs';
import { Engine,overlaps } from '../src/engine.mjs';
import { CodexProvider } from '../src/providers/codex.mjs';
class FakeRPC extends EventEmitter {
  connected=true; calls=[]; count=0;
  async start(){}
  async call(method,params){this.calls.push({method,params});if(method==='thread/start')return {thread:{id:'thread-'+(++this.count)}};if(method==='thread/resume')return {thread:{id:params.threadId}};if(method==='turn/start')return {turn:{id:'turn-'+(++this.count)}};return {};}
  respond(id,result){this.calls.push({id,result});} reject(id,error){this.calls.push({id,error});} stop(){}
}
function setup(t) {
  const path=mkdtempSync(join(tmpdir(),'codex-automation-test-'));const store=new Store(join(path,'db.sqlite'));const rpc=new FakeRPC();
  const config={workspaceRoot:path,maxConcurrent:2,maxCycles:3,turnTimeoutMinutes:30,digestHours:[],timezone:'Asia/Seoul'};
  const engine=new Engine(store,new CodexProvider(rpc),config);t.after(()=>{store.close();assert.ok(resolve(path).startsWith(resolve(tmpdir())+sep+'codex-automation-test-'));rmSync(path,{recursive:true,force:true});});return {store,rpc,engine,path};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function installCatalog(rpc) {
  const call=rpc.call.bind(rpc);
  rpc.call=async(method,params)=>method==='model/list'?{data:[
    {model:'catalog-default',isDefault:true,defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'medium'}]},
    {model:'other-model',isDefault:false,defaultReasoningEffort:'low',supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'high'}]}
  ]}:call(method,params);
}
test('editing a running task takes effect only on the next turn and keeps its thread',async t=>{
  const {engine,rpc,store}=setup(t);installCatalog(rpc);const task=engine.create({goal:'change model'});
  await engine.tick();await flush();const running=store.get(task.id);const before=rpc.calls.length;
  await engine.configureTask(task.id,{model:'other-model',effort:'high'});
  assert.equal(rpc.calls.length,before);assert.equal(store.get(task.id).status,'running');assert.equal(store.get(task.id).turn_id,running.turn_id);
  assert.equal(store.get(task.id).settings_revision,1);assert.equal(store.get(task.id).applied_settings_revision,0);
  finish(engine,task.id,{status:'continue',summary:'next',question:'',options:[]});await engine.tick();await flush();
  const saved=store.get(task.id);assert.equal(saved.thread_id,running.thread_id);assert.equal(saved.session_model,'other-model');assert.equal(saved.session_effort,'high');assert.equal(saved.applied_settings_revision,1);
  const turn=rpc.calls.filter(c=>c.method==='turn/start').at(-1).params;assert.equal(turn.model,'other-model');assert.equal(turn.effort,'high');
});
test('automatic selection resets a prior explicit model and effort to catalog defaults',async t=>{
  const {engine,rpc,store}=setup(t);installCatalog(rpc);const task=engine.create({goal:'reset selection'});
  await engine.configureTask(task.id,{model:'other-model',effort:'high'});await engine.tick();await flush();
  finish(engine,task.id,{status:'completed',summary:'done'});
  await engine.configureTask(task.id,{model:null,effort:null});assert.equal(store.get(task.id).status,'completed');
  engine.message(task.id,'next');await engine.tick();await flush();const turn=rpc.calls.filter(c=>c.method==='turn/start').at(-1).params;
  assert.equal(turn.model,'catalog-default');assert.equal(turn.effort,'medium');
  assert.equal(store.get(task.id).model,null);assert.equal(store.get(task.id).effort,null);assert.equal(store.get(task.id).applied_settings_revision,2);
});
test('invalid model or effort cannot change a task or dismiss its decision',async t=>{
  const {engine,rpc,store}=setup(t);installCatalog(rpc);const task=engine.create({goal:'validate selection'});store.patch(task.id,{status:'waiting'});store.decision(task.id,'business','choose');
  for(const input of [{model:'unknown',effort:'low'},{model:'other-model',effort:'ultra'},{model:{},effort:null}])await assert.rejects(()=>engine.configureTask(task.id,input));
  assert.equal(store.get(task.id).settings_revision,0);assert.equal(store.decisions().length,1);assert.equal(store.get(task.id).status,'waiting');
  await engine.configureTask(task.id,{model:'other-model',effort:null});assert.equal(store.get(task.id).status,'waiting');assert.equal(store.decisions().length,1);
});
test('automatic profile displays resolved settings without pinning future model selection',async t=>{
  const {engine,rpc,store}=setup(t);engine.config.profiles={auto:{model:null,effort:null}};
  const call=rpc.call.bind(rpc);rpc.call=async(method,params)=>{const result=await call(method,params);return method==='thread/start'?{...result,model:'resolved-model',reasoningEffort:'high'}:result;};
  const task=engine.create({goal:'check settings',profile:'auto'});await engine.tick();await flush();
  const saved=store.get(task.id);assert.equal(saved.session_model,'resolved-model');assert.equal(saved.session_effort,'high');assert.ok(saved.session_checked_at);assert.equal(saved.model,null);assert.equal(saved.effort,null);
});
test('existing task settings are read without resuming or starting a turn',async t=>{
  const {engine,rpc,store}=setup(t);const task=engine.create({goal:'check metadata'});store.patch(task.id,{status:'completed',thread_id:'saved-thread'});
  rpc.call=async(method,params)=>{rpc.calls.push({method,params});assert.equal(method,'thread/read');return {thread:{model:'saved-model',reasoningEffort:'medium'}};};
  await engine.refreshSessionSettings();const saved=store.get(task.id);assert.equal(saved.session_model,'saved-model');assert.equal(saved.session_effort,'medium');assert.equal(saved.status,'completed');
});
test('explicit full access applies to new and resumed task sessions',async t=>{
  const {engine,rpc}=setup(t);engine.config.accessMode='full';const task=engine.create({goal:'permission check'});
  await engine.tick();await flush();
  const started=rpc.calls.find(c=>c.method==='thread/start').params;
  assert.equal(started.sandbox,'danger-full-access');assert.equal(started.approvalPolicy,'never');assert.equal(started.approvalsReviewer,'user');
  finish(engine,task.id,{status:'completed',summary:'done',question:'',options:[]});engine.message(task.id,'continue');await engine.tick();await flush();
  const resumed=rpc.calls.find(c=>c.method==='thread/resume').params;
  assert.equal(resumed.sandbox,'danger-full-access');assert.equal(resumed.approvalPolicy,'never');
});
test('without explicit full access, sessions retain the workspace sandbox',async t=>{
  const {engine,rpc}=setup(t);engine.create({goal:'permission check'});await engine.tick();await flush();
  const started=rpc.calls.find(c=>c.method==='thread/start').params;
  assert.equal(started.sandbox,'workspace-write');assert.equal(started.approvalPolicy,'on-request');
});
function finish(engine,id,result){const task=engine.getTask(id);engine.provider.translateNotification({method:'item/completed',params:{threadId:task.thread_id,item:{type:'agentMessage',phase:'final_answer',text:JSON.stringify(result)}}});engine.provider.translateNotification({method:'turn/completed',params:{threadId:task.thread_id,turn:{id:task.turn_id,status:'completed'}}});}
test('business decision persists, answer resumes the same thread',async t=>{
  const {engine,store,rpc}=setup(t);const task=engine.create({goal:'report'});await engine.tick();await flush();const thread=store.get(task.id).thread_id;
  finish(engine,task.id,{status:'waiting',summary:'draft ready',question:'A or B?',options:['A','B']});assert.equal(store.get(task.id).status,'waiting');
  const d=store.decisions()[0];await engine.decide(d.id,'A');await engine.tick();await flush();assert.equal(store.get(task.id).thread_id,thread);assert.ok(rpc.calls.some(c=>c.method==='thread/resume'));
  assert.match(rpc.calls.filter(c=>c.method==='turn/start').at(-1).params.input[0].text,/A or B/);
  finish(engine,task.id,{status:'completed',summary:'done',question:'',options:[]});assert.equal(store.get(task.id).status,'completed');
});
test('follow-up arriving during a turn gets a subsequent turn',async t=>{
  const {engine,store,rpc}=setup(t);const task=engine.create({goal:'first'});await engine.tick();await flush();engine.message(task.id,'also second');finish(engine,task.id,{status:'completed',summary:'first done'});assert.equal(store.get(task.id).status,'queued');await engine.tick();await flush();assert.equal(rpc.calls.filter(c=>c.method==='turn/start').at(-1).params.input[0].text,'also second');
});
test('only matching live approvals may be answered and duplicate decisions fail',async t=>{
  const {engine,store,rpc}=setup(t);const task=engine.create({goal:'test'});await engine.tick();await flush();const running=store.get(task.id);
  engine.provider.translateRequest({id:99,method:'item/commandExecution/requestApproval',params:{threadId:running.thread_id,turnId:running.turn_id,command:'echo ok'}});
  const d=store.decisions()[0];assert.equal(store.get(task.id).status,'waiting_approval');await engine.decide(d.id,'decline');assert.deepEqual(rpc.calls.at(-1),{id:99,result:{decision:'decline'}});await assert.rejects(()=>engine.decide(d.id,'accept'));
});
test('restart expires live approvals and does not replay uncertain work',t=>{
  const {store,engine}=setup(t);const task=engine.create({goal:'write once'});store.patch(task.id,{status:'waiting_approval',thread_id:'thr'});store.decision(task.id,'approval','allow?',{});store.recover();assert.equal(store.get(task.id).status,'recovery');assert.equal(store.decisions().length,0);assert.equal(store.decisions(false)[0].status,'expired');
});
test('scheduler respects overlapping folders',async t=>{
  const {store,engine,path}=setup(t);const a=engine.create({goal:'a',cwd:path});const b=engine.create({goal:'b',cwd:join(path,'child')});await engine.tick();await flush();assert.equal(store.get(a.id).status,'running');assert.equal(store.get(b.id).status,'queued');assert.equal(overlaps(path,join(path,'child')),true);
});
test('automatic continuation is bounded',async t=>{
  const {store,engine}=setup(t);const task=engine.create({goal:'long'});store.patch(task.id,{cycles:3});await engine.tick();assert.equal(store.get(task.id).status,'paused');assert.equal(engine.active.size,0);
});
test('failed protocol completion never marks a task done',async t=>{
  const {engine,store}=setup(t);const task=engine.create({goal:'x'});await engine.tick();await flush();engine.finish(task.id,{status:'failed',error:{message:'quota'}});assert.equal(store.get(task.id).status,'failed');assert.equal(store.get(task.id).error,'quota');
});
test('durable idempotency suppresses duplicate incoming instructions',t=>{
  const {store}=setup(t);let calls=0;assert.deepEqual(store.once('message-1',()=>({n:++calls})),{n:1});assert.deepEqual(store.once('message-1',()=>({n:++calls})),{n:1});assert.equal(calls,1);
});
