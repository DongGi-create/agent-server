import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Store } from '../src/store.mjs';
import { Engine } from '../src/engine.mjs';
import { isRateLimitError,limitState } from '../src/rate-limits.mjs';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
const snapshot=(primary=100,secondary=16)=>({rateLimits:{primary:{usedPercent:primary,resetsAt:Math.ceil(Date.now()/1000)+600},secondary:{usedPercent:secondary,resetsAt:Math.ceil(Date.now()/1000)+86400}}});
function setup(t) {
  const store=new Store(':memory:'); t.after(()=>store.close());
  const rpc=new EventEmitter(); rpc.calls=[]; rpc.limits=snapshot(); rpc.starts=0; rpc.n=0;
  rpc.start=async()=>{rpc.starts++;};
  rpc.call=async(method,params)=>{
    rpc.calls.push({method,params});
    if(method==='account/rateLimits/read') { if(rpc.limitError)throw new Error('offline'); return rpc.limits; }
    if(method==='thread/read')return {thread:{status:{type:'idle'}}};
    if(method==='thread/resume')return {thread:{id:params.threadId}};
    if(method==='turn/start') { if(rpc.turnError)throw rpc.turnError; return {turn:{id:'turn-'+(++rpc.n)}}; }
    return {};
  };
  const engine=new Engine(store,rpc,{maxConcurrent:1,turnTimeoutMinutes:30,digestHours:[],timezone:'Asia/Seoul'});
  const task=store.create({title:'limit test',goal:'continue project',cwd:'C:/test'});
  store.patch(task.id,{thread_id:'same-thread'});
  return {store,rpc,engine,task};
}
async function failUsage(ctx) {
  await ctx.engine.tick(); await flush();
  const current=ctx.store.get(ctx.task.id);
  ctx.engine.notification({method:'turn/completed',params:{threadId:current.thread_id,turn:{id:current.turn_id,status:'failed',error:{message:'You’ve hit your usage limit. Try again at 8:59 PM.',codexErrorInfo:'usageLimitExceeded'}}}});
  await flush();
}
function due(store,id) { store.patch(id,{retry_at:new Date(Date.now()-1000).toISOString()}); }

test('real mid-turn usage error waits, preserves delivered input and resumes same thread',async t=>{
  const ctx=setup(t); const {store,rpc,engine,task}=ctx;
  await failUsage(ctx);
  assert.equal(store.get(task.id).status,'rate_limited');
  assert.equal(store.get(task.id).cycles,0);
  assert.equal(Date.parse(store.get(task.id).retry_at),rpc.limits.rateLimits.primary.resetsAt*1000+5000);
  assert.equal(store.messages(task.id)[0].state,'delivered');
  assert.equal(JSON.parse(store.outbox()[0].text).title,'Codex 사용량 한도 대기');
  const count=rpc.calls.filter(c=>c.method==='turn/start').length;
  await engine.tick(); await flush(); assert.equal(rpc.calls.filter(c=>c.method==='turn/start').length,count);
  rpc.limits=snapshot(0,16); due(store,task.id);
  await engine.tick(); await flush();
  assert.equal(store.get(task.id).status,'running');
  assert.equal(store.get(task.id).thread_id,'same-thread');
  assert.equal(store.get(task.id).retry_at,null);
  assert.match(rpc.calls.filter(c=>c.method==='turn/start').at(-1).params.input[0].text,/과거 사용량 한도 오류는 현재 상태를 의미하지 않습니다/);
  assert.equal(store.outbox().length,2);
});
test('only exhausted windows set the reset; both exhausted require the later reset',()=>{
  const now=Date.now(); const s=snapshot(10,100);
  assert.equal(limitState(s,now).retryAt,s.rateLimits.secondary.resetsAt*1000+5000);
  s.rateLimits.primary.usedPercent=100;
  assert.equal(limitState(s,now).retryAt,s.rateLimits.secondary.resetsAt*1000+5000);
  s.rateLimits.secondary.resetsAt=Math.floor(now/1000)-1;
  assert.equal(limitState(s,now).blocked,true);
});
test('missing snapshots, stale exhaustion and failed reads cannot trigger resume',async t=>{
  const ctx=setup(t); await failUsage(ctx);
  const {store,rpc,engine,task}=ctx;
  for(const state of [{}, {rateLimits:{primary:{usedPercent:100,resetsAt:1}}}]) {
    rpc.limits=state; due(store,task.id); await engine.tick(); await flush();
    assert.equal(store.get(task.id).status,'rate_limited');
    assert.ok(Date.parse(store.get(task.id).retry_at)>Date.now()+290000);
  }
  rpc.limitError=true; due(store,task.id); await engine.tick();
  assert.equal(store.get(task.id).status,'rate_limited');
  assert.ok(Date.parse(store.get(task.id).retry_at)>Date.now()+290000);
});
test('pause during awaited limit read is respected',async t=>{
  const ctx=setup(t); await failUsage(ctx);
  const {store,rpc,engine,task}=ctx;
  due(store,task.id); let release;
  rpc.call=()=>new Promise(resolve=>{release=resolve;});
  const checking=engine.tick(); await flush(); await engine.pause(task.id);
  release(snapshot(0,16)); await checking;
  assert.equal(store.get(task.id).status,'paused');
});
test('persisted wait survives recovery and reconnects before reading limits',async t=>{
  const ctx=setup(t); await failUsage(ctx); const {store,rpc,task}=ctx;
  store.recover(); assert.equal(store.get(task.id).status,'rate_limited');
  due(store,task.id); rpc.limits=snapshot(0,16); const starts=rpc.starts;
  const replacement=new Engine(store,rpc,ctx.engine.config);
  await replacement.tick(); await flush();
  assert.equal(store.get(task.id).status,'running'); assert.ok(rpc.starts>starts);
});
test('explicit rejected start can replay its input, uncertain outcomes cannot',async t=>{
  const {store,rpc,engine,task}=setup(t);
  rpc.turnError=Object.assign(new Error('usage limit exceeded'),{rpcRejected:true,data:{codexErrorInfo:'usageLimitExceeded'}});
  await engine.tick(); await flush();
  assert.equal(store.get(task.id).status,'rate_limited'); assert.equal(store.pending(task.id).length,1);
  rpc.turnError=new Error('RPC timeout; outcome unknown'); engine.resume(task.id);
  await engine.tick(); await flush();
  assert.equal(store.get(task.id).status,'recovery'); assert.equal(store.messages(task.id)[0].state,'uncertain');
});
test('billing/authentication and generic 429 are not usage-limit retries',()=>{
  for(const message of ['429 insufficient_quota','Unauthorized','payment required','HTTP 429','capacity exceeded'])assert.equal(isRateLimitError({message}),false);
  assert.equal(isRateLimitError({codexErrorInfo:'usageLimitExceeded'}),true);
  assert.equal(isRateLimitError({codex_error_info:'usage_limit_exceeded'}),true);
});
test('error notification supplies structured usage cause when completion omits it',async t=>{
  const {store,engine,task}=setup(t); await engine.tick(); await flush(); const running=store.get(task.id);
  engine.notification({method:'error',params:{threadId:running.thread_id,turnId:running.turn_id,error:{message:'limit',codexErrorInfo:'usageLimitExceeded'}}});
  engine.notification({method:'turn/completed',params:{threadId:running.thread_id,turn:{id:running.turn_id,status:'failed'}}});
  await flush(); assert.equal(store.get(task.id).status,'rate_limited');
});
