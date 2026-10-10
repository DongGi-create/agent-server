import assert from 'node:assert/strict';
import { CodexRPC } from '../src/providers/codex-rpc.mjs';
import { routeMessage } from '../src/providers/codex-router.mjs';
import { config } from '../src/config.mjs';
const rpc=new CodexRPC(config.codexCommand);
try{
  const tasks=[{id:'1234abcd',title:'홈페이지 개선',summary:'홈페이지의 디자인과 접근성을 개선하고 있습니다.'},{id:'5678efab',title:'경쟁사 가격 조사',summary:'경쟁사 가격표를 조사합니다.'}];
  const result=await routeMessage(rpc,tasks,'진행 중인 홈페이지 개선 작업에 모바일 화면 개선도 추가해줘.');
  assert.equal(result.action,'existing');assert.equal(result.taskId,'1234abcd');
  console.log('PASS: natural-language instruction routed to the matching existing task.');
}finally{rpc.stop();}
