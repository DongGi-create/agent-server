import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';

test('conversation pages contain only the requested task, newest first by page',t=>{
  const store=new Store(':memory:');
  t.after(()=>store.close());
  const task=store.create({id:'11111111',title:'대화 테스트',goal:'첫 지시',cwd:'test'});
  store.create({id:'22222222',title:'다른 작업',goal:'섞이면 안 됨',cwd:'test'});
  for(let i=1;i<=44;i++)store.message(task.id,'assistant','응답 '+i);

  const newest=store.messagesPage(task.id);
  const middle=store.messagesPage(task.id,newest.nextBefore);
  const oldest=store.messagesPage(task.id,middle.nextBefore);
  assert.deepEqual([newest.messages.length,middle.messages.length,oldest.messages.length],[20,20,5]);
  assert.deepEqual([newest.hasMore,middle.hasMore,oldest.hasMore],[true,true,false]);
  assert.equal(oldest.nextBefore,null);
  assert.deepEqual([...oldest.messages,...middle.messages,...newest.messages].map(m=>m.id),store.messages(task.id).map(m=>m.id));
  assert.ok(newest.messages.every(m=>m.task_id===task.id));
  assert.deepEqual(store.messagesPage('22222222').messages.map(m=>m.text),['섞이면 안 됨']);
});
