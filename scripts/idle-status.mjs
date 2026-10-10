import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

const db=new DatabaseSync(join(import.meta.dirname,'../data/automation.sqlite'),{readOnly:true});
try {
  const {count}=db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE status IN ('running','queued','waiting_approval') OR turn_id IS NOT NULL").get();
  console.log(count);
} finally { db.close(); }
