import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {config,dataDir,root} from '../src/config.mjs';

if(!process.env.AUTOMATION_DATA_DIR||resolve(dataDir)===resolve(root,'data')||config.port===4317){
  throw new Error('Use a separate AUTOMATION_DATA_DIR and nondefault test port for this browser test.');
}

const runtime=join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const {chromium}=await import(pathToFileURL(runtime).href);
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const origin='http://127.0.0.1:'+config.port;
  const unauthenticated=await page.request.get(origin+'/api/maintenance-requests');
  assert.equal(unauthenticated.status(),401);
  const token=readFileSync(join(dataDir,'access-token'),'utf8').trim();
  await page.goto(origin+'/#'+token);
  await page.locator('#workspace').waitFor({state:'visible'});
  const before=await page.evaluate(async()=>await (await fetch('/api/state')).json());
  await page.locator('[data-view="improvements"]').click();
  await page.locator('#improvement-title').fill('모바일 개선 요청 테스트');
  await page.locator('#improvement-description').fill('휴대폰에서 개선 사항을 따로 접수하고 싶습니다.');
  await page.getByRole('button',{name:'요청 접수'}).click();
  await page.locator('#improvement-detail').waitFor({state:'visible'});
  assert.match(await page.locator('#improvement-detail').innerText(),/휴대폰에서 개선 사항/);
  await page.locator('.improvement-note-form textarea').fill('추가로 목록에서도 확인하고 싶습니다.');
  await page.getByRole('button',{name:'추가 내용 저장'}).click();
  await page.waitForFunction(()=>document.querySelector('#improvement-detail')?.textContent.includes('추가로 목록에서도'));
  await page.reload();
  await page.locator('#workspace').waitFor({state:'visible'});
  await page.locator('[data-view="improvements"]').click();
  await page.locator('.improvement-item').first().click();
  await page.waitForFunction(()=>document.querySelector('#improvement-detail')?.textContent.includes('추가로 목록에서도'));
  assert.match(await page.locator('#improvement-detail').innerText(),/추가로 목록에서도/);
  await page.locator('.improvement-note-form textarea').fill('작성 중인 메모');
  await page.evaluate(async()=>{await refresh();await new Promise(resolve=>setTimeout(resolve,100));});
  assert.equal(await page.locator('.improvement-note-form textarea').inputValue(),'작성 중인 메모');
  await page.screenshot({path:join(dataDir,'maintenance-mobile.png'),fullPage:true});
  const after=await page.evaluate(async()=>await (await fetch('/api/state')).json());
  assert.equal(after.tasks.length,before.tasks.length,'an improvement request must not start a task');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  assert.deepEqual(errors,[]);
  console.log('PASS: mobile improvement intake, notes, persistence, authentication, and no task execution.');
}finally{await browser.close();}
