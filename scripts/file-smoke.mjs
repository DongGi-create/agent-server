import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config,dataDir } from '../src/config.mjs';
const base='http://127.0.0.1:'+config.port;
const token=readFileSync(join(dataDir,'access-token'),'utf8').trim();
async function api(path,body){const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();if(!r.ok)throw new Error(JSON.stringify(data));return data;}
const text='파일 생성 기능 점검입니다. 작업 폴더에 automation-smoke.txt 파일을 UTF-8로 생성하고 정확히 AUTOMATION_OK 한 줄을 넣으세요. 가능하면 apply_patch 도구를 사용하세요. 외부 서비스나 다른 폴더는 수정하지 마세요. 파일 생성 결과를 검증한 뒤 완료 상태로 보고하세요.';
const key=randomUUID();const input={target:'new',text,key};
const created=process.argv[2]?{taskId:process.argv[2]}:await api('/inbox',input);if(process.argv[2])await api('/tasks/'+created.taskId+'/resume',{});else{const duplicate=await api('/inbox',input);assert.equal(created.taskId,duplicate.taskId);}console.log('Created file task '+created.taskId+'; duplicate suppressed.');
const started=Date.now();let finished=false;
while(Date.now()-started<180000){await new Promise(r=>setTimeout(r,2000));const state=await api('/state');const task=state.tasks.find(t=>t.id===created.taskId);
  if(['failed','recovery','paused'].includes(task.status))throw new Error(task.status+': '+task.error);
  if(task.status==='waiting_approval'){const d=state.decisions.find(d=>d.task_id===task.id);console.log('Approval pending: '+JSON.stringify({id:d.id,payload:d.payload}));process.exit(2);}
  if(task.status==='waiting'){console.log('Question: '+state.decisions.find(d=>d.task_id===task.id).question);process.exit(2);}
  if(task.status==='completed'){
    const files=await api('/tasks/'+task.id+'/files');assert.ok(files.files.some(f=>f.path==='automation-smoke.txt'));
    const download=await fetch(base+'/api/tasks/'+task.id+'/files?path=automation-smoke.txt',{headers:{Authorization:'Bearer '+token}});assert.equal(download.status,200);assert.equal((await download.text()).trim(),'AUTOMATION_OK');
    const traversal=await fetch(base+'/api/tasks/'+task.id+'/files?path='+encodeURIComponent(join(dataDir,'access-token')),{headers:{Authorization:'Bearer '+token}});assert.equal(traversal.status,400);
    writeFileSync(join(dataDir,'file-smoke-result.json'),JSON.stringify({taskId:task.id,completedAt:new Date().toISOString(),checks:['real file creation','artifact download','path escape rejected','duplicate input rejected']},null,2));finished=true;break;
  }
}
if(!finished)throw new Error('File task timed out');
console.log('PASS: real file task, downloadable artifact, traversal rejection and durable input deduplication.');
