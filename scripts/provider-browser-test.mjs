import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {dataDir,config} from '../src/config.mjs';

const runtime=join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const {chromium}=await import(pathToFileURL(runtime).href);
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const token=readFileSync(join(dataDir,'access-token'),'utf8').trim();
  await page.goto('http://127.0.0.1:'+config.port+'/#'+token);
  await page.locator('#workspace').waitFor({state:'visible'});
  assert.equal(await page.locator('#artifacts').getAttribute('open'),null);
  await page.locator('[data-view="limits"]').click();
  await page.waitForFunction(()=>document.querySelector('#limits-content')?.textContent.includes('AVAILABLE MODELS'));
  const text=await page.locator('#limits-content').innerText();
  assert.match(text,/한도/);assert.match(text,/AVAILABLE MODELS/);
  await page.locator('[data-view="tasks"]').click();
  if(await page.locator('.task-card').count()){
    await page.locator('.task-card').first().click();
    await page.locator('#edit-task-model').click();
    await page.waitForFunction(()=>document.querySelector('#task-model-select')?.options.length>1);
    assert.ok(await page.locator('#task-effort-select option').count()>1);
    await page.locator('.model-dialog').evaluate(dialog=>dialog.close());
  }
  const state=await page.evaluate(async()=>await (await fetch('/api/state')).json());
  let downloadable=null;
  for(const task of state.tasks){
    const files=await page.evaluate(async id=>await (await fetch('/api/tasks/'+id+'/files')).json(),task.id);
    if(files.files?.length){downloadable=task;break;}
  }
  if(downloadable){
    await page.locator('#filter').selectOption(downloadable.archived_at?'archived':'all');
    const rows=state.tasks.filter(task=>downloadable.archived_at?!!task.archived_at:!task.archived_at);
    await page.locator('.task-card').nth(rows.findIndex(task=>task.id===downloadable.id)).click();
    await page.locator('#artifacts').waitFor({state:'visible'});
    assert.equal(await page.locator('#artifacts').getAttribute('open'),null);
  }
  if(state.decisions.length){
    await page.locator('[data-view="decisions"]').click();
    await page.locator('.decision-context').first().waitFor({state:'visible'});
    assert.ok((await page.locator('.decision-context').first().innerText()).trim().length>0);
    if(state.decisions.some(decision=>decision.payload.optionDetails?.length)){
      await page.locator('.decision-option').first().waitFor({state:'visible'});
      const detail=await page.locator('.decision-option').first().innerText();
      assert.match(detail,/선택하면 수행할 작업/);assert.match(detail,/장점/);assert.match(detail,/단점/);
    }
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  assert.deepEqual(errors,[]);
  console.log('PASS: mobile usage, model chooser, collapsed files, and detailed decision options render without browser errors.');
}finally{await browser.close();}
