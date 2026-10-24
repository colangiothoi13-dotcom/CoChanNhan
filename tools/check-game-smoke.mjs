#!/usr/bin/env node
/** Real Chrome gameplay smoke checks, using built-in Node WebSocket only.
 * Start Vite, then run: node tools/check-game-smoke.mjs
 * Options: --base-url=http://127.0.0.1:5173 --out=.tmp/game-smoke-recheck
 * All actions use trusted CDP mouse/keyboard events. Runtime evaluation only
 * observes DOM/storage, scrolls controls into view, or requests lifecycle save.
 */
import { mkdir, writeFile, lstat, realpath, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [key, ...value] = arg.replace(/^--/, '').split('=');
  return [key, value.length ? value.join('=') : true];
}));
const base = new URL(args['base-url'] || 'http://127.0.0.1:5173');
const chrome = args.chrome || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const artifacts = path.resolve(root, '.tmp');
const out = path.resolve(root, args.out || '.tmp/game-smoke-recheck');
if (out !== artifacts && !out.startsWith(artifacts + path.sep)) {
  throw new Error('Smoke artifacts must stay within the workspace root .tmp directory.');
}
const id = Date.now() + '-' + process.pid;
const profile = path.join(out, 'profile-' + id);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const result = {
  status: 'running', startedAt: new Date().toISOString(), baseUrl: base.href,
  viewport: { width: 1440, height: 900 }, checks: [], failures: [],
  browserExceptions: [], failedAssetRequests: [], screenshots: [],
};
await mkdir(out, { recursive: true });
const artifactReal = await realpath(artifacts);
const outReal = await realpath(out);
if (outReal !== artifactReal && !outReal.startsWith(artifactReal + path.sep)) {
  throw new Error('Smoke artifact directory resolves outside the workspace artifact root.');
}
// An exclusively created directory proves ownership and guarantees fresh storage.
await mkdir(profile);
let child, socket, closed, chromeClosed = false, timer;
let stderr = '';
let nextId = 0;
const pending = new Map();
const requests = new Map();
let sessionId;
const command = (method, params = {}, selectedSession) => new Promise((resolve, reject) => {
  const requestId = ++nextId;
  const requestTimer = setTimeout(() => {
    pending.delete(requestId);
    reject(new Error('DevTools command timed out: ' + method));
  }, 15000);
  pending.set(requestId, { resolve, reject, timer:requestTimer });
  socket.send(JSON.stringify({ id: requestId, method, params,
    ...(selectedSession ? { sessionId: selectedSession } : {}) }));
});
const page = (method, params = {}) => command(method, params, sessionId);
async function evaluate(expression) {
  const response = await page('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error('Browser evaluation failed: ' + JSON.stringify(response.exceptionDetails));
  return response.result?.value;
}
async function until(expression, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate(expression)) return;
    await delay(80);
  }
  throw new Error('Timed out waiting for ' + expression);
}
function check(name, passed, evidence) {
  const entry = { name, passed: !!passed, evidence };
  result.checks.push(entry);
  if (!entry.passed) result.failures.push(entry);
  console.log(JSON.stringify(entry));
}
async function screenshot(name) {
  const shot = await page('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const filename = path.join(out, name + '.png');
  await writeFile(filename, Buffer.from(shot.data, 'base64'));
  result.screenshots.push(filename);
}
async function click(selector) {
  const point = await evaluate(`(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    if (!e) throw new Error('Missing control: ' + ${JSON.stringify(selector)});
    e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
    const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
    const hit=document.elementFromPoint(x,y);
    return {x,y,disabled:!!e.disabled,visible:r.width>0&&r.height>0,
      hit:hit===e||e.contains(hit),hitElement:hit?.id||hit?.tagName};
  })()`);
  if (!point.visible || point.disabled || !point.hit) {
    throw new Error('Control is not clickable: ' + selector + ' ' + JSON.stringify(point));
  }
  await page('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await page('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await page('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await delay(60);
}
async function key(key, options = {}) {
  const code = { ArrowRight:'ArrowRight', ArrowLeft:'ArrowLeft', ArrowDown:'ArrowDown',
    ArrowUp:'ArrowUp', Escape:'Escape', Enter:'Enter', Tab:'Tab', Home:'Home', End:'End' }[key] || key;
  const keyCode = { ArrowRight:39, ArrowLeft:37, ArrowDown:40, ArrowUp:38, Escape:27,
    Enter:13, Tab:9, Home:36, End:35 }[key];
  const params = { key, code, ...(keyCode ? { windowsVirtualKeyCode:keyCode, nativeVirtualKeyCode:keyCode } : {}), ...options };
  await page('Input.dispatchKeyEvent', { type:'keyDown', ...params });
  await page('Input.dispatchKeyEvent', { type:'keyUp', ...params });
  await delay(40);
}
async function saveSnapshot(resume = false) {
  return evaluate(`(() => {
    window.dispatchEvent(new Event('cotienlo:pause'));
    const saved=JSON.parse(localStorage.getItem('cotienlo_save_v1')||'null');
    ${resume ? "window.dispatchEvent(new Event('cotienlo:resume'));" : ''}
    return saved;
  })()`);
}
const itemCount = (save, item) => save?.items?.find(entry => entry.id === item)?.count || 0;

try {
  child = spawn(chrome, ['--headless=new','--no-sandbox','--disable-gpu',
    '--disable-gpu-sandbox','--disable-software-rasterizer','--no-first-run',
    '--no-default-browser-check','--hide-scrollbars','--force-device-scale-factor=1',
    '--window-size=1440,900','--user-data-dir=' + profile,
    '--remote-debugging-port=0','about:blank'], { windowsHide: true });
  closed = new Promise(resolve => child.once('close', () => { chromeClosed = true; resolve(); }));
  timer = setTimeout(() => child.kill(), 90000);
  const endpoint = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => reject(new Error('Chrome exited before ready: ' + code)));
    child.stderr.on('data', part => {
      stderr += part;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) resolve(match[1]);
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once:true });
    socket.addEventListener('error', reject, { once:true });
  });
  socket.addEventListener('close', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('Chrome DevTools connection closed.'));
    }
    pending.clear();
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
      return;
    }
    if (message.sessionId !== sessionId) return;
    const p = message.params || {};
    if (message.method === 'Runtime.exceptionThrown') result.browserExceptions.push(p.exceptionDetails);
    if (message.method === 'Network.requestWillBeSent') requests.set(p.requestId, p.request.url);
    if (message.method === 'Network.responseReceived' && p.response.status >= 400 &&
        p.response.url.startsWith(base.origin) && !p.response.url.includes('/favicon.ico')) {
      result.failedAssetRequests.push({ url:p.response.url, status:p.response.status });
    }
    if (message.method === 'Network.loadingFailed') {
      const url = requests.get(p.requestId);
      if (url?.startsWith(base.origin) && !url.includes('/favicon.ico') && !p.canceled) {
        result.failedAssetRequests.push({ url, error:p.errorText });
      }
    }
  });
  const target = await command('Target.createTarget', { url:'about:blank' });
  sessionId = (await command('Target.attachToTarget', { targetId:target.targetId, flatten:true })).sessionId;
  await page('Page.enable');
  await page('Runtime.enable');
  await page('Network.enable');
  await page('Emulation.setDeviceMetricsOverride', { width:1440,height:900,deviceScaleFactor:1,mobile:false });
  await page('Page.navigate', { url:base.href });
  await until("document.querySelector('#game-canvas')?.width > 0 && document.querySelector('#hud-hp-text')?.textContent.includes('/')");
  await delay(400);
  const startup = await evaluate(`(() => {
    const canvas=document.querySelector('#game-canvas'),ctx=canvas.getContext('2d');
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,colors=new Set();
    let opaque=0;
    for(let p=0;p<pixels.length;p+=4*101){if(pixels[p+3])opaque++;colors.add(pixels[p]+','+pixels[p+1]+','+pixels[p+2]+','+pixels[p+3]);}
    return {width:canvas.width,height:canvas.height,colors:colors.size,opaque,
      title:document.title,canvasRect:{width:canvas.clientWidth,height:canvas.clientHeight},
      saveInitiallyEmpty:localStorage.getItem('cotienlo_save_v1')===null};
  })()`);
  check('fresh-start-and-render', startup.width === 1440 && startup.height === 900 && startup.colors > 10 && startup.opaque > 100 && startup.saveInitiallyEmpty, startup);
  await screenshot('01-game-start');

  // Complete the actual first-visit introduction before exercising combat controls.
  await until("document.querySelector('#modal-tutorial')?.classList.contains('active') || localStorage.getItem('cotienlo_tutorial_seen') === 'true'");
  if (await evaluate("document.querySelector('#modal-tutorial')?.classList.contains('active')")) {
    await click('#btn-tutorial-confirm');
    await until("!document.querySelector('#modal-tutorial')?.classList.contains('active')");
  }
  check('first-visit-introduction-completes', await evaluate("localStorage.getItem('cotienlo_tutorial_seen') === 'true'"));

  // Leave the sanctuary through real input so its extra 15 MP/s cannot hide skill cost.
  await page('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
  await delay(1900);
  await page('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
  const moved = await saveSnapshot(true);
  check('trusted-movement-leaves-sanctuary', Math.hypot(moved.x - 1200, moved.y - 960) > 260,
    { x: moved.x, y: moved.y, sanctuary: { x:1200, y:960, radius:260 } });

  const beforeSkill = await saveSnapshot(true);
  await click('#btn-gu-moonlight');
  const afterSkill = await saveSnapshot();
  const skillDelta = beforeSkill.mp - afterSkill.mp;
  const skillElapsed = Math.max(0, afterSkill.savedAt - beforeSkill.savedAt) / 1000;
  // Chân nguyên regenerates at 4/s while Chrome processes trusted pointer events.
  // Bound that recovery by the observed save interval instead of assuming fast CDP.
  check('trusted-combat-skill-deducts-mp', skillDelta > 0 && skillDelta <= 15.01 && skillDelta >= 15 - 4 * skillElapsed - 0.25,
    { before:beforeSkill.mp,after:afterSkill.mp,cost:15,deduction:skillDelta,elapsedSeconds:skillElapsed });
  await evaluate("window.dispatchEvent(new Event('cotienlo:resume'))");

  const audioBefore = await evaluate("document.querySelector('#btn-audio-toggle').getAttribute('aria-pressed')");
  await click('#btn-audio-toggle');
  const audioOff = await evaluate("({pressed:document.querySelector('#btn-audio-toggle').getAttribute('aria-pressed'),label:document.querySelector('#btn-audio-toggle').getAttribute('aria-label')})");
  await click('#btn-audio-toggle');
  const audioOn = await evaluate("({pressed:document.querySelector('#btn-audio-toggle').getAttribute('aria-pressed'),label:document.querySelector('#btn-audio-toggle').getAttribute('aria-label')})");
  check('audio-aria-toggle', audioBefore === 'true' && audioOff.pressed === 'false' && audioOn.pressed === 'true' && audioOff.label !== audioOn.label, {audioBefore,audioOff,audioOn});

  await click('#btn-open-inventory');
  const beforeFeed = await saveSnapshot(true);
  await click('.btn-feed[data-guid="moonlight"]');
  const afterFeed = await saveSnapshot(true);
  check('feed-consumes-one-and-saves-hunger', itemCount(beforeFeed,'moon_stone') - itemCount(afterFeed,'moon_stone') === 1 && afterFeed.guHunger.moonlight === 100,
    {beforeCount:itemCount(beforeFeed,'moon_stone'),afterCount:itemCount(afterFeed,'moon_stone'),beforeHunger:beforeFeed.guHunger.moonlight,afterHunger:afterFeed.guHunger.moonlight});
  const feedState = await evaluate("({disabled:document.querySelector('.btn-feed[data-guid=moonlight]').disabled,focused:document.activeElement.className})");
  check('fed-gu-disabled-with-focus-retained', feedState.disabled && feedState.focused.includes('gu-card'),feedState);
  await click('#tab-gu');
  await key('ArrowRight');
  const itemTab = await evaluate("({selected:document.querySelector('#tab-items').getAttribute('aria-selected'),focused:document.activeElement.id,hidden:document.querySelector('#tab-items-content').hidden,itemCount:document.querySelectorAll('#items-inventory-grid .item-slot').length})");
  check('inventory-tabs-trusted-keyboard', itemTab.selected === 'true' && itemTab.focused === 'tab-items' && !itemTab.hidden && itemTab.itemCount >= 3,itemTab);
  await screenshot('02-inventory-items');
  await key('Escape');
  check('inventory-escape-restores-focus', await evaluate("document.querySelector('#modal-inventory').hidden && document.activeElement.id==='btn-open-inventory'"),{});

  await click('#btn-open-refine');
  const recipe = await evaluate("({cost:document.querySelector('#refine-cost').textContent,chance:document.querySelector('#refine-chance').textContent,selected:[...document.querySelectorAll('#refine-available-gu [aria-pressed=true]')].map(e=>e.dataset.guId)})");
  check('auto-selected-first-recipe', recipe.selected.includes('moonlight') && recipe.selected.includes('boar') && /^10\D/.test(recipe.cost),recipe);
  const beforeRefine = await saveSnapshot(true);
  await click('#btn-execute-refine');
  const afterRefine = await saveSnapshot(true);
  check('refinement-cost-exactly-ten', beforeRefine.stones - afterRefine.stones === 10,
    {before:beforeRefine.stones,after:afterRefine.stones,outcome:afterRefine.ownedGuIds.includes('moonblade')?'success':'failure',hasRefinedGu:afterRefine.hasRefinedGu});
  check('refinement-keeps-input-gu', ['moonlight','boar'].every(id => afterRefine.ownedGuIds.includes(id)) && afterRefine.hasRefinedGu === afterRefine.ownedGuIds.includes('moonblade'),
    {ownedGuIds:afterRefine.ownedGuIds,hasRefinedGu:afterRefine.hasRefinedGu});
  await screenshot('03-refinement-result');
  await key('Escape');

  await click('#btn-open-wiki');
  await click('#wiki-tim');
  await page('Input.insertText', { text:'Nguyệt Quang' });
  await until("!document.querySelector('#wiki-tim-kq').hidden && document.querySelectorAll('#wiki-tim-kq [data-search-idx]').length>0");
  const matches = await evaluate("[...document.querySelectorAll('#wiki-tim-kq [data-search-idx]')].map(e=>({title:e.textContent.trim(),gu:e.dataset.wikiGu,goto:e.dataset.wikiGoto}))");
  await screenshot('04-wiki-search');
  await key('ArrowDown');
  await key('Enter');
  const wikiDetail = await evaluate("({hidden:document.querySelector('#wiki-tim-kq').hidden,text:document.querySelector('#wiki-main-content').textContent,guPage:document.querySelector('[data-wiki-tab=co]').getAttribute('aria-pressed'),back:!!document.querySelector('[data-wiki-back]')})");
  check('wiki-search-keyboard-opens-detail', matches.length > 0 && wikiDetail.hidden && wikiDetail.guPage === 'true' && wikiDetail.back && wikiDetail.text.includes('Nguyệt Quang'),
    {matches:matches.slice(0,3),hidden:wikiDetail.hidden,guPage:wikiDetail.guPage,back:wikiDetail.back,detailExcerpt:wikiDetail.text.slice(0,200)});
  await click('.wiki-nav-pills [data-wiki-tab="ban-do"]');
  const mapPage = await evaluate("({active:document.querySelector('.wiki-nav-pills [data-wiki-tab=ban-do]').getAttribute('aria-pressed'),text:document.querySelector('#wiki-main-content').textContent.slice(0,250)})");
  check('wiki-category-navigation', mapPage.active === 'true' && mapPage.text.length > 40,mapPage);
  await click('.wiki-nav-pills [data-wiki-tab="co"]');
  await click('.wiki-loc-btn:nth-child(2)');
  const filterBefore = await evaluate("({code:document.activeElement.getAttribute('data-loc'),isFilter:document.activeElement.classList.contains('wiki-loc-btn')})");
  await key('Enter');
  const filterAfter = await evaluate("({code:document.activeElement.getAttribute('data-loc'),isFilter:document.activeElement.classList.contains('wiki-loc-btn'),selected:document.activeElement.classList.contains('chon'),tag:document.activeElement.tagName})");
  check('wiki-filter-retains-keyboard-focus-after-render',filterBefore.isFilter && filterAfter.isFilter && filterBefore.code === filterAfter.code && filterAfter.selected,
    {before:filterBefore,after:filterAfter});
  await click('#wiki-tim');
  await key('a',{code:'KeyA',windowsVirtualKeyCode:65,nativeVirtualKeyCode:65,modifiers:2});
  await page('Input.insertText', { text:'cổ' });
  await until("!document.querySelector('#wiki-tim-kq').hidden");
  const broadMatches = await evaluate("document.querySelectorAll('#wiki-tim-kq [data-search-idx]').length");
  for(let match = 0; match < broadMatches; match++) await key('ArrowDown');
  const highlighted = await evaluate(`(() => {
    const box=document.querySelector('#wiki-tim-kq'),selected=box.querySelector('.chon');
    const b=box.getBoundingClientRect(),r=selected?.getBoundingClientRect();
    return {count:box.querySelectorAll('[data-search-idx]').length,selectedIndex:selected?.getAttribute('data-search-idx'),
      scrollTop:box.scrollTop,scrollHeight:box.scrollHeight,clientHeight:box.clientHeight,
      selected:r?{top:r.top,bottom:r.bottom}:null,container:{top:b.top,bottom:b.bottom},
      fullyVisible:!!r&&r.top>=b.top-1&&r.bottom<=b.bottom+1};
  })()`);
  check('wiki-keyboard-last-result-remains-visible',broadMatches > 3 && highlighted.selectedIndex === String(broadMatches-1) && highlighted.fullyVisible,highlighted);
  await screenshot('05-wiki-keyboard-last-result');
  await key('Escape');
  const firstEscape = await evaluate("({modalOpen:document.querySelector('#modal-wiki').classList.contains('active'),dropdownHidden:document.querySelector('#wiki-tim-kq').hidden})");
  check('wiki-first-escape-dismisses-search',firstEscape.modalOpen && firstEscape.dropdownHidden,firstEscape);
  await key('Escape');
  const secondEscape = await evaluate("({closed:document.querySelector('#modal-wiki').hidden,focused:document.activeElement.id})");
  check('wiki-second-escape-closes-dialog',secondEscape.closed && secondEscape.focused === 'btn-open-wiki',secondEscape);
  if (!secondEscape.closed) await click('#btn-close-wiki');

  const skillPoint = await evaluate("(() => {const r=document.querySelector('#btn-gu-moonlight').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
  await click('#btn-open-cultivator');
  const beforeBlocked = await saveSnapshot(true);
  const overlayHit = await evaluate(`(() => {const e=document.elementFromPoint(${skillPoint.x},${skillPoint.y});return {element:e?.id||e?.className,skill:e===document.querySelector('#btn-gu-moonlight')||document.querySelector('#btn-gu-moonlight').contains(e)};})()`);
  await page('Input.dispatchMouseEvent',{type:'mousePressed',...skillPoint,button:'left',clickCount:1});
  await page('Input.dispatchMouseEvent',{type:'mouseReleased',...skillPoint,button:'left',clickCount:1});
  const afterBlocked = await saveSnapshot(true);
  check('modal-blocks-trusted-background-combat',!overlayHit.skill && afterBlocked.mp >= beforeBlocked.mp - 0.01,
    {overlayHit,beforeMp:beforeBlocked.mp,afterMp:afterBlocked.mp});
  if (await evaluate("document.querySelector('#modal-cultivator').classList.contains('active')")) await key('Escape');

  const beforeReload = await saveSnapshot();
  await page('Page.reload',{ignoreCache:true});
  await until("document.querySelector('#game-canvas')?.width === 1440 && document.querySelector('#currency-count')?.textContent === '" + beforeReload.stones + "'");
  const afterReload = await saveSnapshot();
  const persisted = save => ({stones:save.stones,items:save.items,ownedGuIds:save.ownedGuIds,guHunger:save.guHunger,hasRefinedGu:save.hasRefinedGu});
  check('reload-persists-economy-refinement-and-feed',JSON.stringify(persisted(beforeReload)) === JSON.stringify(persisted(afterReload)),
    {before:persisted(beforeReload),after:persisted(afterReload)});
  await screenshot('06-reloaded-game');
  check('no-uncaught-browser-exceptions',result.browserExceptions.length === 0,result.browserExceptions);
  check('no-failed-game-asset-requests',result.failedAssetRequests.length === 0,result.failedAssetRequests);
  result.status = result.failures.length ? 'failed' : 'passed';
} catch (error) {
  result.status = 'error';
  result.error = error.stack || String(error);
  console.error(result.error);
  if (sessionId) await screenshot('error').catch(() => {});
} finally {
  clearTimeout(timer);
  if (socket?.readyState === WebSocket.OPEN) await Promise.race([command('Browser.close'),delay(400)]).catch(() => {});
  socket?.close();
  child?.kill();
  if (closed) await Promise.race([closed,delay(3000)]);
  if (child && !chromeClosed) {
    result.cleanupError = 'Chrome did not exit; profile retained for safety.';
  } else {
    const resolved = path.resolve(profile);
    if (path.dirname(resolved) !== out || path.basename(resolved) !== 'profile-' + id || !resolved.startsWith(artifacts + path.sep)) {
      throw new Error('Unsafe profile cleanup target: ' + resolved);
    }
    const entry = await lstat(resolved).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (entry) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('Profile is not an ordinary owned directory.');
      if (path.dirname(await realpath(resolved)) !== outReal) throw new Error('Profile resolves outside the owned artifact directory.');
      await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:100});
    }
    result.profileCleaned = true;
  }
  result.finishedAt = new Date().toISOString();
  await writeFile(path.join(out,'results.json'),JSON.stringify(result,null,2));
  await writeFile(path.join(out,'chrome.log'),stderr);
  console.log(JSON.stringify({status:result.status,checks:result.checks.length,failures:result.failures.length,artifact:path.join(out,'results.json'),profileCleaned:result.profileCleaned}));
  process.exitCode = result.status === 'passed' && !result.cleanupError ? 0 : 1;
}
