import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config,dataDir } from '../src/config.mjs';
const token=readFileSync(join(dataDir,'access-token'),'utf8').trim();
async function api(path,body){const response=await fetch('http://127.0.0.1:'+config.port+'/api'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();if(!response.ok)throw new Error(JSON.stringify(data));return data;}
const health=await fetch('http://127.0.0.1:'+config.port+'/health');assert.equal(health.status,200);
const denied=await fetch('http://127.0.0.1:'+config.port+'/api/state');assert.equal(denied.status,401);
const task=await api('/tasks',{title:'시스템 연결·결정 재개 검증',goal:'이 작업은 자동화 시스템의 대화와 결정 재개 기능을 검증하기 위한 테스트입니다. 도구를 사용하지 마세요. 첫 번째 응답에서는 반드시 최종 JSON status를 waiting으로 하고 question을 "테스트 색상을 선택해주세요."로, options를 ["녹색","파랑"]으로 하세요. 이후 사용자가 녹색이라고 답변하면 완료된 것으로 판단하고 status completed, summary "녹색 선택을 반영했습니다. 작업별 대화와 결정 후 재개 검증을 완료했습니다.", question 빈 문자열, options 빈 배열로 응답하세요.'});
console.log('Created smoke task '+task.id);
let answered=false,threadId;const started=Date.now();
while(Date.now()-started<180000){
  await new Promise(r=>setTimeout(r,2000));const state=await api('/state');const current=state.tasks.find(t=>t.id===task.id);
  if(['failed','recovery','paused'].includes(current.status))throw new Error('Smoke task '+current.status+': '+current.error);
  if(current.status==='waiting'&&!answered){const decision=state.decisions.find(d=>d.task_id===task.id);assert.ok(decision);threadId=current.thread_id;await api('/decisions/'+decision.id,{answer:'녹색'});answered=true;console.log('Answered business decision; resuming same thread.');}
  if(current.status==='completed'){assert.equal(answered,true);assert.equal(current.thread_id,threadId);assert.match(current.summary,/녹색/);await api('/digest',{});writeFileSync(join(dataDir,'smoke-result.json'),JSON.stringify({taskId:task.id,threadId,completedAt:new Date().toISOString(),checks:['HTTP health','unauthenticated access rejected','real Codex turn','business decision','same-thread resume','completion','digest']},null,2));console.log('PASS: real Codex decision/resume round trip, authenticated API and digest.');process.exit(0);}
}
throw new Error('Smoke timed out; inspect task '+task.id+' in dashboard.');
