import {existsSync,readdirSync,realpathSync,statSync,lstatSync} from 'node:fs';
import {join,resolve,relative,sep,isAbsolute} from 'node:path';

function inside(base,path){
  const rel=relative(base,path);
  return rel!==''&&rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel);
}
function outputRoot(workspace){
  const root=join(workspace,'output');
  if(!existsSync(root))return null;
  if(lstatSync(root).isSymbolicLink()||!statSync(root).isDirectory()||realpathSync(root).toLowerCase()!==resolve(root).toLowerCase())throw new Error('Invalid output directory');
  return root;
}

export function listOutputFiles(workspace){
  const output=outputRoot(workspace);
  if(!output)return {files:[],truncated:false};
  const files=[];let truncated=false;
  function walk(dir,depth){
    if(depth>8){truncated=true;return;}
    for(const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
      if(entry.isSymbolicLink()||['.git','node_modules','.venv','__pycache__','.next'].includes(entry.name))continue;
      if(files.length>=500){truncated=true;break;}
      const path=join(dir,entry.name);
      if(entry.isDirectory())walk(path,depth+1);
      else if(entry.isFile()){
        const info=statSync(path);
        files.push({path:relative(workspace,path).split(sep).join('/'),size:info.size,modifiedAt:info.mtime.toISOString()});
      }
    }
  }
  walk(output,0);
  files.sort((a,b)=>Date.parse(b.modifiedAt)-Date.parse(a.modifiedAt)||a.path.localeCompare(b.path));
  return {files,truncated};
}

export function resolveOutputFile(workspace,requested){
  const output=outputRoot(workspace);
  if(!output||typeof requested!=='string'||isAbsolute(requested))throw new Error('Invalid output file path');
  const candidate=resolve(workspace,requested);
  if(!inside(output,candidate))throw new Error('Invalid output file path');
  const file=realpathSync(candidate);
  if(!inside(output,file)||!statSync(file).isFile())throw new Error('Invalid output file path');
  return file;
}
