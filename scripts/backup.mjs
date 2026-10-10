import { DatabaseSync,backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from '../src/config.mjs';
const dir=join(dataDir,'backups');mkdirSync(dir,{recursive:true});
const source=new DatabaseSync(join(dataDir,'automation.sqlite'));
const dest=join(dir,'automation-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');
await backup(source,dest);source.close();console.log(dest);
