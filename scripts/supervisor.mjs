import { spawn } from 'node:child_process';
import { createWriteStream,writeFileSync,existsSync,statSync,renameSync } from 'node:fs';
import { join } from 'node:path';
import { root,dataDir } from '../src/config.mjs';
let retries=0,child,stopping=false;
writeFileSync(join(dataDir,'server.pid'),String(process.pid));
function logStream(name){const file=join(dataDir,name);if(existsSync(file)&&statSync(file).size>10*1024*1024)renameSync(file,file+'.'+Date.now()+'.old');return createWriteStream(file,{flags:'a'});}
function start(){
  const out=logStream('worker.log'),err=logStream('worker-error.log');const started=Date.now();
  child=spawn(process.execPath,[join(root,'src/server.mjs')],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(out);child.stderr.pipe(err);
  child.on('error',e=>console.error(e.message));
  child.on('exit',code=>{
    out.end();err.end();
    if(stopping||code===0)process.exit(0);
    if(Date.now()-started>300000)retries=0;
    if(++retries>5){console.error('Repeated server failures; inspect worker-error.log');process.exit(1);}
    const delay=Math.min(30000,1000*2**retries);console.error('Server stopped; restart in '+delay+'ms');setTimeout(start,delay);
  });
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;child?.kill();});
start();
