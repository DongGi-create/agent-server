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
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  assert.deepEqual(errors,[]);
  console.log('PASS: mobile usage windows and model/effort chooser render provider-normalized data without browser errors.');
}finally{await browser.close();}
