import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir,config } from '../src/config.mjs';
const token=readFileSync(join(dataDir,'access-token'),'utf8').trim();
const res=await fetch('http://127.0.0.1:'+config.port+'/api/shutdown',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});
if(!res.ok)throw new Error(await res.text());
console.log('Stopped.');
