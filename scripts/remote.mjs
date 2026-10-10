import { Store } from '../src/store.mjs';
import { dataDir } from '../src/config.mjs';
import { join } from 'node:path';
const origin=new URL(process.argv[2]);
if(origin.protocol!=='https:'||!origin.hostname.endsWith('.ts.net'))throw new Error('Expected private Tailscale HTTPS origin');
const store=new Store(join(dataDir,'automation.sqlite'));store.set('publicOrigin',origin.origin);store.close();console.log(origin.origin);
