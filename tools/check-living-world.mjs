#!/usr/bin/env node
// Real Chrome acceptance against a private memory-only service. No SMTP, real
// accounts, production files or player state are written by this harness.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuthStore } from '../cotienlo-game/server/auth-store.mjs';
import { WorldStore } from '../cotienlo-game/server/world-store.mjs';
import { createWorldServer } from '../cotienlo-game/server/http-server.mjs';
import { isInsideSanctuary, nearestHub } from '../cotienlo-game/shared/overworld-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.tmp/living-world/browser');
await mkdir(out, { recursive: true });
const profile = path.join(out, 'profile-' + Date.now()); await mkdir(profile);
const world = new WorldStore({ filePath: null, randomIndex: () => 0 });
const auth = new AuthStore({ filePath: null, mailer: null });
const server = createWorldServer({ store: world, authStore: auth, checkpointIntervalMs: 0 });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { checks: [], failures: [], exceptions: [], screenshots: [], pages: [] };
const sockets = [];

let browserCall, debugPort;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-gpu-sandbox', '--disable-software-rasterizer',
  '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
function check(name, passed, evidence) {
  const result = { name, passed: !!passed, ...(evidence === undefined ? {} : { evidence }) };
  report.checks.push(result); if (!passed) report.failures.push(result);
  console.log(JSON.stringify(passed ? { name, passed: true } : result));
}
function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url); sockets.push(socket); const pending = new Map(); let sequence = 0;
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.method === 'Runtime.exceptionThrown') report.exceptions.push(message.params.exceptionDetails);
      const item = pending.get(message.id); if (!item) return;
      pending.delete(message.id); clearTimeout(item.timer);
      message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
    });
    socket.addEventListener('open', () => resolve((method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')); }, 15000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    })), { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
}
async function untilState(test, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await test(); if (value) return value; await delay(80); }
  throw new Error('Timed out: ' + label);
}
async function page(hostname, mobile = false, browserContextId) {
  const { targetId } = await browserCall('Target.createTarget', { url: 'about:blank', ...(browserContextId ? { browserContextId } : {}) });
  const call = await connect(`ws://127.0.0.1:${debugPort}/devtools/page/${targetId}`);
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const until = async (expression, timeout = 12000) => {
    try { return await untilState(() => evaluate(expression), expression, timeout); }
    catch (error) { throw new Error(error.message + '\n' + await evaluate('JSON.stringify({active:[...document.querySelectorAll(".game-modal.active")].map(e=>e.id),seen:localStorage.getItem("cotienlo_tutorial_seen"),text:document.body.innerText.slice(-2200)})')); }
  };
  const point = selector => evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,disabled:e.disabled,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})()`);
  const click = async selector => {
    const p = await point(selector);
    if (p.disabled || !p.hit) throw new Error('Blocked control: ' + selector + ' ' + JSON.stringify(p));
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await delay(100);
  };
  const key = async (type, key, code, virtualKey) => call('Input.dispatchKeyEvent', {
    type, key, code, windowsVirtualKeyCode: virtualKey ?? (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0),
  });
  const press = async (keyName, code, virtualKey) => { await key('keyDown', keyName, code, virtualKey); await key('keyUp', keyName, code, virtualKey); };
  const fill = async (selector, text) => { await click(selector); await call('Input.insertText', { text }); };
  const screenshot = async label => {
    const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const filename = path.join(out, hostname + '-' + label + '.png');
    await writeFile(filename, Buffer.from(result.data, 'base64')); report.screenshots.push(filename);
  };
  const token = () => evaluate('localStorage.getItem("cotienlo_world_session_v1:"+encodeURIComponent("/api/world"))');
  const snapshot = async () => world.fieldSnapshot(await token());
  const ready = async () => {
    await until('!document.querySelector("#modal-world.active") && document.querySelector("#quest-text")?.textContent.includes("Đời 1")');
    // Allow the normal first-visit tutorial timer to settle before acknowledging it.
    await delay(950);
    if (await evaluate('!!document.querySelector("#modal-tutorial.active") || localStorage.getItem("cotienlo_tutorial_seen")!=="true"')) {
      if (!await evaluate('!!document.querySelector("#modal-tutorial.active")')) await click('#btn-open-tutorial');
      await until('!!document.querySelector("#modal-tutorial.active")'); await click('#btn-tutorial-confirm');
    }
    await until('!document.querySelector(".game-modal.active")');
  };
  const reload = async () => { await call('Page.reload', { ignoreCache: true }); await ready(); await delay(180); };
  await call('Page.enable'); await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: mobile ? 375 : 1440, height: mobile ? 812 : 900, deviceScaleFactor: mobile ? 2 : 1, mobile });
  if (mobile) await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await call('Page.navigate', { url: `http://${hostname}:${port}/` });
  await until('!!document.querySelector("#wp-name") && document.querySelector("#modal-world.active")');
  report.pages.push({ host: hostname, mobile });
  return { call, evaluate, until, click, key, press, fill, screenshot, token, snapshot, ready, reload, point };
}
async function checkLandscapeMenus(phone) {
  await phone.call('Page.bringToFront');
  for (const size of [{ width: 812, height: 375 }, { width: 568, height: 320 }]) {
    await phone.call('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 1, mobile: true }); await delay(250);
    await phone.click('#btn-open-settings'); await phone.until('!!document.querySelector("#modal-action-settings.active")');
    const settingsBody = await phone.point('.as-body');
    await phone.call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: settingsBody.x, y: settingsBody.y, deltaX: 0, deltaY: 1800 }); await delay(100);
    const measure = async selectors => phone.evaluate(`(() => ({viewport:innerWidth,page:document.documentElement.scrollWidth,height:innerHeight,controls:${JSON.stringify(selectors)}.map(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return{selector,left:r.left,right:r.right,top:r.top,bottom:r.bottom,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})}))()`);
    const settingsLayout = await measure(['.as-close', '.as-reset']);
    await phone.screenshot(`settings-landscape-${size.width}x${size.height}`); await phone.click('.as-close');
    await phone.click('#btn-open-world'); await phone.until('!!document.querySelector("#modal-overworld-atlas.active")');
    const atlasBody = await phone.point('.oa-body');
    await phone.call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: atlasBody.x, y: atlasBody.y, deltaX: 0, deltaY: -5000 }); await delay(100);
    const mapLayout = await phone.evaluate('(() => {const map=document.querySelector(".oa-map").getBoundingClientRect(),body=document.querySelector(".oa-body").getBoundingClientRect();return{height:map.height,visibleHeight:Math.max(0,Math.min(map.bottom,body.bottom)-Math.max(map.top,body.top)),bodyHeight:body.height}})()');
    await phone.screenshot(`atlas-map-top-${size.width}x${size.height}`);
    await phone.call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: atlasBody.x, y: atlasBody.y, deltaX: 0, deltaY: 1800 }); await delay(100);
    const atlasLayout = await measure(['.oa-close', '#oa-return', '#oa-login', '#oa-journey']);
    const fits = layout => layout.page <= layout.viewport + 1 && layout.controls.every(c => c.left >= 0 && c.right <= layout.viewport + 1 && c.top >= 0 && c.bottom <= layout.height + 1 && c.hit);
    check(`new settings and atlas menus remain usable at ${size.width}x${size.height} after scrolling`, fits(settingsLayout) && fits(atlasLayout) && mapLayout.height >= 140 && mapLayout.visibleHeight >= mapLayout.height - 1 && atlasLayout.controls.every(c=>c.bottom-c.top>=43.9), { settings: settingsLayout, atlas: atlasLayout, map: mapLayout });
    await phone.screenshot(`atlas-landscape-${size.width}x${size.height}`); await phone.click('#oa-return');
  }
}
try {
  let info;
  for (let i=0;i<100;i++) { try { info=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n'); break; } catch { await delay(100); } }
  if(!info) throw new Error('Chrome did not start'); debugPort=info[0].trim();
  browserCall=await connect('ws://127.0.0.1:'+debugPort+info[1]);
  const pc=await page('127.0.0.1');
  await pc.fill('#wp-name','Người Học Đầu Đời'); await pc.click('#wp-join'); await pc.ready();
  let before=await pc.snapshot();
  const hub=nearestHub(before.x,before.y);
  check('fresh life has no Gu and a real 44% whole-aperture pool',before.guIds.length===0 && before.usableGuIds.length===0 && before.maxMp===44 && before.cultivation.rank===1,{guIds:before.guIds,maxMp:before.maxMp});
  check('fresh spawn is beside academy inside a large safe settlement',hub.safeRadius===2200 && isInsideSanctuary(before.x,before.y) && before.facilities.some(f=>f.role==='academy'&&Math.hypot(f.x-before.x,f.y-before.y)<220) && before.monsters.length===0,{hub:hub.id,radius:hub.safeRadius,facilities:before.facilities.length});
  check('empty hotbar retains number bindings and disables all four unowned skills',await pc.evaluate('[...document.querySelectorAll("[id^=btn-gu-]")].every(b=>b.disabled) && ["moonlight","bronze","boar","heal"].map(id=>document.querySelector("#btn-gu-"+id+" .skill-key-badge").textContent).join("")==="1234"'));
  await pc.press('f','KeyF'); await pc.until('!!document.querySelector("#modal-academy.active")');
  check('F opens the actual nearby academy NPC',await pc.evaluate('document.querySelector("#academy-title").textContent.includes("Học")'));
  await pc.click('[data-academy-option="claim-gu"][data-gu="moonlight"]');
  before=await untilState(async()=>{const s=await pc.snapshot();return s.guIds.includes('moonlight')?s:null},'unrefined first Gu accepted');
  check('claim gives ownership without control or a free active skill',before.usableGuIds.length===0 && before.cultivation.guInstances.some(g=>g.typeId==='moonlight'&&!g.controlled),{owned:before.guIds,usable:before.usableGuIds});
  await pc.until('!!document.querySelector("[data-academy-option=tame-gu][data-gu=moonlight]")');
  await pc.click('[data-academy-option="tame-gu"][data-gu="moonlight"]');
  before=await untilState(async()=>{const s=await pc.snapshot();return s.cultivation.activity?.kind==='taming'?s:null},'taming server clock');
  await pc.click('[data-academy-close]');
  await pc.call('Page.setWebLifecycleState',{state:'frozen'}); await delay(250);
  const frozen=await pc.snapshot(), ticksBefore=world.runtimeMetrics(); await delay(10500);
  let after=await pc.snapshot(), ticksAfter=world.runtimeMetrics();
  check('server advances and completes taming while browser timers and input are frozen',after.seq===frozen.seq && after.usableGuIds.includes('moonlight') && ticksAfter.ticks>ticksBefore.ticks+150,{seqBefore:frozen.seq,seqAfter:after.seq,ticks:ticksAfter.ticks-ticksBefore.ticks,controlled:after.usableGuIds});
  await pc.call('Page.setWebLifecycleState',{state:'active'}); await pc.call('Page.bringToFront');
  await pc.call('Emulation.setFocusEmulationEnabled',{enabled:true});
  await pc.until('!document.hidden');
  await pc.until('!document.querySelector("#btn-gu-moonlight").disabled');
  await pc.screenshot('academy-settlement');
  before=await pc.snapshot();
  await pc.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:500,y:450});
  await pc.key('keyDown','d','KeyD'); await delay(200); await pc.press('1','Digit1');
  try { after=await untilState(async()=>{const s=await pc.snapshot();return s.x>before.x+5 && s.projectiles.some(p=>p.type==='moonlight')?s:null},'moving aimed cast'); }
  catch(error) { throw new Error(error.message+' '+JSON.stringify(await pc.snapshot())+' '+await pc.evaluate('JSON.stringify({hidden:document.hidden,active:document.activeElement?.outerHTML,modals:[...document.querySelectorAll(".game-modal.active")].map(e=>e.id),toasts:document.querySelector("#toast-container")?.textContent,skill:document.querySelector("#btn-gu-moonlight")?.outerHTML})')); }
  check('number skill shoots toward mouse while moving independently',after.x>before.x+5 && after.projectiles.some(p=>p.type==='moonlight'&&p.vx<0),{dx:after.x-before.x,shots:after.projectiles.map(p=>({vx:p.vx,vy:p.vy}))});
  await pc.key('keyUp','d','KeyD'); await delay(250);
  // Return to the academy entrance using ordinary movement, never assigning state.
  const academy=after.facilities.find(f=>f.role==='academy');
  let pos=await pc.snapshot();
  if(Math.hypot(pos.x-academy.x,pos.y-academy.y)>180){ await pc.key('keyDown','a','KeyA'); await delay(500); await pc.key('keyUp','a','KeyA'); await delay(250); }
  await pc.press('f','KeyF'); await pc.until('!!document.querySelector("#modal-academy.active")');
  await pc.click('[data-academy-option="cultivate"]');
  before=await untilState(async()=>{const s=await pc.snapshot();return s.cultivation.activity?.kind==='cultivating'?s:null},'cultivation starts');
  await pc.click('[data-academy-close]'); await delay(2200); after=await pc.snapshot();
  check('cultivation continues after the NPC panel closes and consumes real essence',after.cultivation.mortal.wallProgress>before.cultivation.mortal.wallProgress,{before:before.cultivation.mortal.wallProgress,after:after.cultivation.mortal.wallProgress});
  await pc.press('f','KeyF'); await pc.until('!!document.querySelector("#modal-academy.active")'); await pc.click('[data-academy-option="stop-cultivating"]'); await pc.click('[data-academy-close]');
  before=await pc.snapshot(); await pc.reload(); after=await pc.snapshot();
  check('reload preserves life, controlled Gu and cultivation progress',after.lifeId===before.lifeId&&after.usableGuIds.includes('moonlight')&&after.cultivation.mortal.wallProgress===before.cultivation.mortal.wallProgress);
  await pc.click('#btn-open-cultivator');
  check('character panel replaces fake combat score and fixed training progress',await pc.evaluate('document.querySelector("#stat-power").textContent.includes("bộ Cổ") && document.querySelector(".tuvi-track .char-bar-text").textContent.includes("Rèn vách")'));
  await pc.screenshot('actual-aperture'); await pc.click('#btn-close-cultivator');
  await pc.click('#btn-open-world'); await pc.until('!!document.querySelector("#modal-overworld-atlas.active")');
  before=await pc.snapshot(); await pc.click('#oa-region-east'); after=await pc.snapshot();
  check('five-region atlas remains free exploration without click teleportation',await pc.evaluate('document.querySelectorAll("[data-atlas-region]").length===5') && before.x===after.x&&before.y===after.y); await pc.click('#oa-return');
  await pc.click('#btn-open-settings'); await pc.click('[data-settings-tab="bindings"]'); await pc.click('#as-bind-slot1'); await pc.press('q','KeyQ'); await pc.click('.as-close');
  await pc.press('q','KeyQ'); after=await untilState(async()=>{const s=await pc.snapshot();return s.cooldowns.moonlight>0?s:null},'custom key cast');
  check('custom keyboard binding still casts a controlled Gu',after.cooldowns.moonlight>0);
  const mutationCounts=await pc.evaluate('new Promise(resolve=>{let hidden=0,hud=0;const w=new MutationObserver(x=>hidden+=x.length);w.observe(document.querySelector("#modal-world"),{subtree:true,childList:true,characterData:true});const h=new MutationObserver(x=>hud+=x.length);h.observe(document.querySelector("#hud-name"),{subtree:true,childList:true,characterData:true});setTimeout(()=>{w.disconnect();h.disconnect();resolve({hidden,hud})},2300)})');
  check('closed world panel stays untouched and HUD updates below animation rate',mutationCounts.hidden===0&&mutationCounts.hud<40,mutationCounts);
  const m0=world.runtimeMetrics(); await delay(600); for(let i=0;i<20;i++) world.snapshot(await pc.token()); const m1=world.runtimeMetrics();
  check('ordinary snapshot reads do not synchronously write world data',m1.durableWrites===m0.durableWrites,{before:m0.durableWrites,after:m1.durableWrites});

  const phone=await page('localhost',true); await phone.fill('#wp-name','Người Học Đồng Hành'); await phone.click('#wp-join'); await phone.ready();
  const phoneLife=await phone.snapshot(); after=await pc.snapshot();
  check('two accounts share nearby server presence without sharing ownership',phoneLife.guIds.length===0 && phoneLife.nearbyPlayers.some(p=>p.name==='Người Học Đầu Đời') && after.nearbyPlayers.some(p=>p.name==='Người Học Đồng Hành'));
  await phone.press('f','KeyF'); await phone.until('!!document.querySelector("#modal-academy.active")');
  check('academy fits portrait phone with scrollable actions',await phone.evaluate('(()=>{const r=document.querySelector(".academy-panel").getBoundingClientRect();const b=document.querySelector(".academy-body");return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&b.scrollHeight>=b.clientHeight&&document.documentElement.scrollWidth<=innerWidth+1})()'));
  await phone.screenshot('academy-phone');
  await phone.call('Emulation.setDeviceMetricsOverride',{width:568,height:320,deviceScaleFactor:1,mobile:true}); await delay(200);
  check('academy remains usable on small landscape phone',await phone.evaluate('(()=>{const r=document.querySelector(".academy-panel").getBoundingClientRect();const b=document.querySelector(".academy-body");return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&b.clientHeight>40})()'));
  await phone.screenshot('academy-landscape'); await phone.click('[data-academy-close]');
  await checkLandscapeMenus(phone);
  check('no uncaught browser exceptions',report.exceptions.length===0,report.exceptions);
} catch(error) { report.failures.push({name:'execution',error:String(error.stack||error)}); console.error(String(error.stack||error)); }
finally {
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  if(browserCall) {try{await browserCall('Browser.close')}catch{}}
  for(const socket of sockets)socket.close();
  if(chrome.exitCode===null) await new Promise(resolve=>{chrome.once('exit',resolve);setTimeout(()=>{chrome.kill();resolve()},3000)});
  await new Promise(resolve=>{server.closeAllConnections();server.close(resolve)});
  try{const actual=await realpath(profile);if(actual.startsWith((await realpath(out))+path.sep))await rm(actual,{recursive:true,force:true})}catch{}
}
if(report.failures.length)process.exitCode=1;
