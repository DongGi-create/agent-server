import { CodexRPC } from '../src/providers/codex-rpc.mjs';
import { config,dataDir } from '../src/config.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const token=readFileSync(join(dataDir,'access-token'),'utf8').trim();
const response=await fetch('http://127.0.0.1:'+config.port+'/api/tasks/'+process.argv[2],{headers:{Authorization:'Bearer '+token}});const detail=await response.json();
const rpc=new CodexRPC(config.codexCommand);
try{await rpc.start();const data=await rpc.call('thread/read',{threadId:detail.task.thread_id,includeTurns:true});console.log(JSON.stringify(data.thread.turns?.at(-1),null,2));}finally{rpc.stop();}
