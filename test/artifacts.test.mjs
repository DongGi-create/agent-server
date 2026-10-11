import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {listOutputFiles,resolveOutputFile} from '../src/artifacts.mjs';

test('only user-facing output files appear and can be downloaded',t=>{
  const workspace=mkdtempSync(join(tmpdir(),'artifact-boundary-'));
  t.after(()=>rmSync(workspace,{recursive:true,force:true}));
  mkdirSync(join(workspace,'work'));mkdirSync(join(workspace,'output'));
  writeFileSync(join(workspace,'work','session-notes.md'),'internal');
  writeFileSync(join(workspace,'output','result.txt'),'deliverable');
  const listed=listOutputFiles(workspace);
  assert.deepEqual(listed.files.map(file=>file.path),['output/result.txt']);
  assert.equal(resolveOutputFile(workspace,'output/result.txt'),join(workspace,'output','result.txt'));
  assert.throws(()=>resolveOutputFile(workspace,'work/session-notes.md'));
  assert.throws(()=>resolveOutputFile(workspace,'output/../work/session-notes.md'));
});
