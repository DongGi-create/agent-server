import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

export const maxFileSize=20*1024*1024;
export function safeFileName(name) {
  if(typeof name!=='string'||!name.trim())throw new Error('파일 이름이 필요합니다.');
  return name.replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g,'_').replace(/[. ]+$/g,'').slice(0,180)||'attachment';
}
export function imageType(content) {
  if(content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(content[0]===255&&content[1]===216&&content[2]===255)return 'image/jpeg';
  if(content.subarray(0,4).toString()==='RIFF'&&content.subarray(8,12).toString()==='WEBP')return 'image/webp';
  return 'application/octet-stream';
}
export async function receiveAttachment(store,req,name) {
  name=safeFileName(name);
  if(Number(req.headers['content-length'])>maxFileSize)throw new Error('파일당 최대 20MB까지 첨부할 수 있습니다.');
  const chunks=[];let size=0;
  for await(const chunk of req) {size+=chunk.length;if(size>maxFileSize)throw new Error('파일당 최대 20MB까지 첨부할 수 있습니다.');chunks.push(chunk);}
  const content=Buffer.concat(chunks);
  return store.addAttachment({id:randomUUID(),name,mime:imageType(content),content});
}
export function messageInput(store,messages,directory,prefix='') {
  const paths=[];const texts=messages.map(m=>{
    const files=store.messageAttachments(m.id);
    if(!files.length)return m.text;
    mkdirSync(directory,{recursive:true});
    const refs=files.map(a=>{
      const path=join(directory,a.id+'_'+safeFileName(a.name));
      // The database is the durable original and is included in normal backups.
      writeFileSync(path,store.attachment(a.id,true).content);
      if(a.mime.startsWith('image/'))paths.push({type:'localImage',path});
      return JSON.stringify({name:a.name,path,size:a.size});
    });
    return m.text+'\n\n사용자 첨부 파일 (참고 자료):\n'+refs.join('\n');
  });
  return [{type:'text',text:prefix+(texts.length?texts.join('\n\n--- 추가 지시 ---\n\n'):'현재 목표의 남은 작업을 계속 진행하고 완료 조건을 확인하세요.')},...paths];
}
