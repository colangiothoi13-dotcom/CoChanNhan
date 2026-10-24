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
const out = path.join(root, '.tmp/gu-resource/browser');
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
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
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
let pc;
try {
  let info;
  for(let i=0;i<100;i++){try{info=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');break;}catch{await delay(100);}}
  if(!info)throw new Error('Chrome did not start');debugPort=info[0].trim();
  browserCall=await connect('ws://127.0.0.1:'+debugPort+info[1]);
  pc=await page('127.0.0.1');await pc.call('Emulation.setFocusEmulationEnabled',{enabled:true});
  await pc.fill('#wp-name','Người Thử Vòng Đời Cổ');await pc.click('#wp-join');await pc.ready();
  const state=()=>pc.snapshot(), bag=s=>s.resources, count=(s,id)=>bag(s).items.find(item=>item.id===id)?.quantity??0;
  const tab=async id=>{await pc.click('[data-resource-tab="'+id+'"]');await delay(80);};
  const close=async()=>{if(await pc.evaluate('!!document.querySelector("#modal-resources.active")'))await pc.click('[data-resource-close]');};
  const open=async id=>{if(!await pc.evaluate('!!document.querySelector("#modal-resources.active")'))await pc.click('#btn-open-resources');if(id)await tab(id);};
  const action=async(option,id)=>{await delay(420);const selector='button[data-resource-option="'+option+'"]'+(id?'[data-resource-payload*="'+id+'"]':'');await pc.click(selector);await delay(150);};
  const choose=async(selector,value)=>{
    const index=await pc.evaluate('(()=>{const s=document.querySelector('+JSON.stringify(selector)+');return [...s.options].findIndex(o=>o.value==='+JSON.stringify(value)+')})()');
    if(index<0)throw new Error('Missing select option '+value);await pc.click(selector);await pc.press('Home','Home',36);for(let i=0;i<index;i++)await pc.press('ArrowDown','ArrowDown',40);await pc.press('Enter','Enter',13);
  };
  const replace=async(selector,value)=>{await pc.click(selector);await pc.call('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await pc.call('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await pc.call('Input.insertText',{text:String(value)});};
  const buy=async(id,quantity)=>{await tab('market');const before=await state();const form='form[data-resource-option="buy-resource"]';await choose(form+' [data-resource-field="resourceId"]',id);await replace(form+' [data-resource-field="quantity"]',quantity);await pc.click(form+' button[type="submit"]');await untilState(async()=>{const s=await state();return count(s,id)>=count(before,id)+quantity?s:null},'buy '+id);};
  const held=new Set(),letters={KeyW:'w',KeyA:'a',KeyS:'s',KeyD:'d'};
  const setKeys=async next=>{for(const code of held)if(!next.has(code)){await pc.key('keyUp',letters[code],code);held.delete(code);}for(const code of next)if(!held.has(code)){await pc.key('keyDown',letters[code],code);held.add(code);}};
  const walk=async target=>{await close();const end=Date.now()+25000;try{while(Date.now()<end){const s=await state(),dx=target.x-s.x,dy=target.y-s.y;if(Math.hypot(dx,dy)<55)return;const next=new Set();if(Math.abs(dx)>16)next.add(dx>0?'KeyD':'KeyA');if(Math.abs(dy)>16)next.add(dy>0?'KeyS':'KeyW');await setKeys(next);await delay(120);}throw new Error('Walk timeout '+JSON.stringify(target));}finally{await setKeys(new Set());await delay(230);}};
  const visit=async node=>{await walk(node);await pc.press('f','KeyF');await pc.until('!!document.querySelector("#modal-resources.active")');await tab('capture');};
  let first=await state();
  check('new resource world preserves an empty Gu birth and distinct physical resource ledger',first.guIds.length===0&&bag(first).gu.length===0&&bag(first).items.length===0&&bag(first).nearbyNodes.length<=24);
  await open('resources');
  check('resource management exposes all six real lifecycle tabs',await pc.evaluate('document.querySelectorAll("[data-resource-tab]").length===6'));
  check('Moonlight feeding uses Moon Orchid petals separately from essence cost',bag(first).catalog.gu.find(g=>g.typeId==='moonlight').foodId==='moon-orchid-petal');
  const hidden=bag(first).recipes.find(r=>r.id==='moonbeam');check('unknown recipes do not reveal complete ingredients before research',!hidden.known&&hidden.definition.inputs.length===0);
  await action('work');await untilState(async()=>(await state()).stones>first.stones,'NPC work earns stones');
  check('nearby NPC work earns resources through an authoritative command',true);
  await buy('capture-net',2);await buy('bait',2);await buy('moon-orchid-seed',1);await buy('water',2);
  await tab('production');await pc.click('form[data-resource-option="plant"][data-resource-payload*="moon-orchid"] button[type="submit"]');
  await untilState(async()=>bag(await state()).farms.length===1,'plant first production source');
  await close();await pc.press('f','KeyF');await pc.until('!!document.querySelector("#modal-academy.active")');await pc.click('[data-academy-option="claim-gu"][data-gu="moonlight"]');
  await untilState(async()=>(await state()).guIds.includes('moonlight'),'first Gu claim');await pc.click('[data-academy-close]');await pc.press('b','KeyB');await pc.until('!!document.querySelector("#modal-resources.active")');
  let s=await state();const moon=bag(s).gu.find(g=>g.typeId==='moonlight');
  check('B opens server Gu care and the first Gu is held but not controlled',!moon.controlled&&moon.holderLifeId===s.lifeId&&moon.starterGrantLifeId===s.lifeId);
  await action('tame',moon.id);await untilState(async()=>bag(await state()).gu.find(g=>g.id===moon.id)?.usable,'first individual Gu completes timed refinement',18000);
  check('individual taming grants actual server permission after elapsed time',true);
  const nodes=bag(await state()).nearbyNodes, garden=nodes.find(n=>n.id.endsWith(':moon-orchid')),herbs=nodes.find(n=>n.id.endsWith(':herbs')),ore=nodes.find(n=>n.id.endsWith(':ore')),glade=nodes.find(n=>n.id.endsWith(':light-glade'));
  for(const[node,id,times]of[[garden,'moon-orchid-petal',2],[herbs,'spirit-herb',1],[ore,'copper-ore',1]]){
    await visit(node);await action('scout',node.id);await untilState(async()=>bag(await state()).nearbyNodes.find(n=>n.id===node.id)?.discovered,'scout '+id);const start=count(await state(),id);for(let i=0;i<times;i++)await action('harvest',node.id);await untilState(async()=>count(await state(),id)>start,'harvest '+id);
  }
  s=await state();check('ordinary movement and scouting harvest actual food and recipe materials',count(s,'moon-orchid-petal')>=4&&count(s,'spirit-herb')>=1&&count(s,'copper-ore')>=1);
  await visit(glade);await action('scout',glade.id);await untilState(async()=>bag(await state()).wildTargets.length>=2,'discover real live Gu targets');
  for(let i=0;i<2;i++){
    const target=bag(await state()).wildTargets.find(t=>t.nodeId===glade.id);const before=bag(await state()).gu.filter(g=>g.typeId==='smalllight'&&g.healthBps>0).length;
    await action('bait',target.id);await action('weaken',target.id);await action('capture',target.id);await untilState(async()=>bag(await state()).gu.filter(g=>g.typeId==='smalllight'&&g.healthBps>0).length>before,'capture separate live Gu');
  }
  s=await state();const small=bag(s).gu.filter(g=>g.typeId==='smalllight'&&g.healthBps>0);
  check('capture creates two different injured, untamed individuals and consumes real nets',small.length===2&&small[0].id!==small[1].id&&small.every(g=>!g.controlled&&g.healthBps<10000)&&count(s,'capture-net')===0);
  await pc.screenshot('captured-gu');await walk(s.facilities.find(f=>f.role==='academy'));await open('gu');
  await action('feed',moon.id);s=await state();
  check('feeding consumes the specified petals without spending the activation resource',count(s,'moon-orchid-petal')===2&&bag(s).gu.find(g=>g.id===moon.id).feeding.state==='fed');
  for(const gu of small){await action('tame',gu.id);await untilState(async()=>bag(await state()).gu.find(g=>g.id===gu.id)?.controlled,'tame '+gu.id,18000);}
  await tab('recipes');await action('research','moonbeam');await untilState(async()=>bag(await state()).recipes.find(r=>r.id==='moonbeam')?.known,'research a complete recipe',12000);
  s=await state();const recipe=bag(s).recipes.find(r=>r.id==='moonbeam');
  check('research unlocks the exact one-Moonlight plus two-Small-Light recipe',recipe.definition.inputs.some(i=>i.typeId==='smalllight'&&i.count===2)&&recipe.definition.inputs.some(i=>i.typeId==='moonlight'&&i.count===1));
  await pc.until('document.querySelectorAll("input[data-resource-draft=recipe-inputs-moonbeam]").length>=3');
  for(const id of [moon.id,...small.map(g=>g.id)])await pc.click('input[data-resource-draft="recipe-inputs-moonbeam"][value="'+id+'"]');
  await pc.click('form[data-resource-option="start-refine"][data-resource-payload*="moonbeam"] button[type="submit"]');
  s=await untilState(async()=>{const p=await state();return bag(p).jobs.some(j=>j.recipeId==='moonbeam'&&j.status==='running')?p:null},'start timed exact-instance recipe');
  check('recipe locks all three actual inputs and disables simultaneous skill use',bag(s).gu.filter(g=>[moon.id,...small.map(x=>x.id)].includes(g.id)).every(g=>g.lock?.kind==='refining')&&!s.usableGuIds.includes('moonlight'));
  await pc.screenshot('recipe-in-progress');
  s=await untilState(async()=>{const p=await state();return bag(p).jobs.some(j=>j.recipeId==='moonbeam'&&j.status==='success')?p:null},'complete real timed recipe',18000);
  const made=bag(s).gu.find(g=>g.typeId==='moonbeam'&&g.healthBps>0);
  check('successful refinement consumes three inputs once and creates one rank-two Moonbeam',!!made&&made.rank===2&&bag(s).gu.filter(g=>[moon.id,...small.map(x=>x.id)].includes(g.id)).every(g=>g.healthBps===0)&&s.guIds.includes('moonbeam')&&!s.guIds.includes('moonlight'));
  check('owning a higher-rank result does not grant unsupported combat power',s.cultivation.rank===1&&!made.usable&&!s.usableGuIds.includes('moonbeam'));
  const farm=bag(s).farms[0];await tab('production');await untilState(async()=>bag(await state()).farms[0].stored>0,'source matures while exploring');const foodBefore=count(await state(),'moon-orchid-petal');await action('harvest-farm',farm.id);s=await untilState(async()=>{const p=await state();return count(p,'moon-orchid-petal')>foodBefore?p:null},'harvest production');
  check('seed, water, time and production yield form a real repeatable food supply',count(s,'moon-orchid-petal')>foodBefore&&bag(s).farms[0].produced>0);
  await pc.screenshot('mortal-loop-complete');await close();const lifeBefore=await state();await pc.reload();s=await state();
  check('reload preserves instance identity, paid recipe result and farm rather than minting copies',s.lifeId===lifeBefore.lifeId&&bag(s).gu.filter(g=>g.id===made.id).length===1&&bag(s).jobs.filter(j=>j.status==='success').length===1&&bag(s).farms[0].id===farm.id);
  await pc.press('h','KeyH');await pc.until('!!document.querySelector("#modal-resources.active")&&document.querySelector("[data-resource-tab=recipes]").getAttribute("aria-selected")==="true"');check('H routes to canonical recipe management instead of the old two-slot furnace',!await pc.evaluate('!!document.querySelector("#modal-refine.active")'));await close();
  const phone=await page('localhost',true);await phone.call('Emulation.setFocusEmulationEnabled',{enabled:true});await phone.fill('#wp-name','Người Quản Kho');await phone.click('#wp-join');await phone.ready();await phone.click('#btn-open-resources');
  for(const size of [{width:375,height:812},{width:568,height:320}]){
    await phone.call('Emulation.setDeviceMetricsOverride',{...size,deviceScaleFactor:1,mobile:true});await delay(200);
    for(const name of ['resources','capture','gu','recipes','production','market']){await phone.click('[data-resource-tab="'+name+'"]');}
    check('all six resource tabs remain reachable at '+size.width+'x'+size.height,await phone.evaluate('(()=>{const p=document.querySelector(".rp-panel").getBoundingClientRect(),b=document.querySelector("#resource-content");return p.left>=0&&p.right<=innerWidth+1&&p.top>=0&&p.bottom<=innerHeight+1&&b.clientHeight>40&&document.documentElement.scrollWidth<=innerWidth+1})()'));
    await phone.screenshot('resource-'+size.width+'x'+size.height);
  }
  check('no uncaught browser exceptions',report.exceptions.length===0,report.exceptions);
}catch(error){report.failures.push({name:'execution',error:String(error.stack||error)});console.error(String(error.stack||error));if(pc){try{report.lastState=await pc.snapshot();report.lastUI=await pc.evaluate('document.body.innerText.slice(-7000)');await pc.screenshot('failure')}catch{}}}
finally{
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));if(browserCall){try{await browserCall('Browser.close')}catch{}}for(const socket of sockets)socket.close();
  if(chrome.exitCode===null)await new Promise(resolve=>{chrome.once('exit',resolve);setTimeout(()=>{chrome.kill();resolve()},3000)});
  await new Promise(resolve=>{server.closeAllConnections();server.close(resolve)});try{const actual=await realpath(profile);if(actual.startsWith((await realpath(out))+path.sep))await rm(actual,{recursive:true,force:true})}catch{}
}
if(report.failures.length)process.exitCode=1;
