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
import { isInsideSanctuary, getNearbyEncounters } from '../cotienlo-game/shared/overworld-core.mjs';
import { GU_DEFINITIONS } from '../cotienlo-game/shared/cultivation-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.tmp/five-regions/browser');
await mkdir(out, { recursive: true });
const profile = path.join(out, 'profile-' + Date.now()); await mkdir(profile);
const world = new WorldStore({ randomIndex: () => 0 });
const auth = new AuthStore({ filePath: null, mailer: null });
const server = createWorldServer({ store: world, authStore: auth, checkpointIntervalMs: 0 });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { checks: [], failures: [], exceptions: [], screenshots: [], pages: [] };
const sockets = [];
const layoutOnly = process.argv.includes('--layout-only');
let browserCall, debugPort;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-gpu-sandbox', '--disable-software-rasterizer',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
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
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await call('Page.bringToFront');
  await call('Emulation.setDeviceMetricsOverride', { width: mobile ? 375 : 1440, height: mobile ? 812 : 900, deviceScaleFactor: mobile ? 2 : 1, mobile });
  if (mobile) await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await call('Page.navigate', { url: `http://${hostname}:${port}/` });
  await until('!!document.querySelector("#wp-name") && document.querySelector("#modal-world.active")');
  report.pages.push({ host: hostname, mobile });
  return { call, evaluate, until, click, key, press, fill, screenshot, token, snapshot, ready, reload, point };
}
// Preparation uses the same authority commands as the real academy, with real
// keyboard travel and server-time taming. No player state/progress is assigned.
let academyOperation = 0;
async function walkTo(player, destination, { stopWithin = 160, timeout = 12000 } = {}) {
  await player.call('Page.bringToFront');
  const held = new Set();
  const letters = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd' };
  const setKeys = async next => {
    for (const code of held) if (!next.has(code)) { await player.key('keyUp', letters[code], code); held.delete(code); }
    for (const code of next) if (!held.has(code)) { await player.key('keyDown', letters[code], code); held.add(code); }
  };
  const deadline = Date.now() + timeout;
  try {
    while (Date.now() < deadline) {
      const state = await player.snapshot();
      const dx = destination.x - state.x, dy = destination.y - state.y;
      if (state.dead || Math.hypot(dx, dy) <= stopWithin) return state;
      const next = new Set();
      if (Math.abs(dx) > 20) next.add(dx > 0 ? 'KeyD' : 'KeyA');
      if (Math.abs(dy) > 20) next.add(dy > 0 ? 'KeyS' : 'KeyW');
      await setKeys(next); await delay(140);
    }
    throw new Error('Keyboard travel timed out: ' + JSON.stringify({ destination, actual: await player.snapshot() }));
  } finally { await setKeys(new Set()); }
}
async function academyCommand(player, role, option, guId) {
  const state = await player.snapshot();
  const facility = state.facilities.find(f => f.role === role);
  if (!facility) throw new Error('Missing academy facility: ' + role);
  await walkTo(player, facility);
  world.execute(await player.token(), {
    operationId: `five-regions-academy-${++academyOperation}`, lifeId: state.lifeId,
    action: { type: 'academy', payload: { facilityId: facility.id, option, guId } },
  });
}
async function acquireGu(player, guId, purchase = false) {
  await academyCommand(player, purchase ? 'gu-warehouse' : 'academy', purchase ? 'buy-gu' : 'claim-gu', guId);
  await academyCommand(player, 'academy', 'tame-gu', guId);
  await untilState(async () => (await player.snapshot()).usableGuIds.includes(guId), 'server-time taming of ' + guId, 14000);
  await delay(180);
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
  const html = await readFile(path.join(root, 'cotienlo-game/dist/index.html'), 'utf8');
  if (!html.includes('data-game-mode="overworld"')) throw new Error('Build the five-region game before running this acceptance test.');
  let info;
  for (let index = 0; index < 100; index++) {
    try { info = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n'); break; }
    catch { await delay(100); }
  }
  if (!info) throw new Error('Chrome failed to start'); debugPort = info[0].trim();
  browserCall = await connect('ws://127.0.0.1:' + debugPort + info[1]);
  if (layoutOnly) {
    const phone = await page('localhost', true);
    await phone.fill('#wp-name', 'Khách Kiểm Tra Bố Cục'); await phone.click('#wp-join'); await phone.ready();
    await checkLandscapeMenus(phone);
  } else {
  const pc = await page('127.0.0.1');
  await pc.fill('#wp-name', 'Người Kiểm Thử'); await pc.click('#wp-join'); await pc.ready();
  let before = await pc.snapshot();
  check('guest account enters the actual five-region canvas with a server-owned large-map spawn', before.x > 2338 && before.y > 2338 && before.regionId === 'south' && before.lifeNumber === 1 && !before.dead, { x: before.x, y: before.y, regionId: before.regionId, lifeNumber: before.lifeNumber });
  check('a new life starts in a safe settlement without automatically receiving Gu', isInsideSanctuary(before.x, before.y) && before.guIds.length === 0 && before.usableGuIds.length === 0 && before.mp === 44 && before.maxMp === 44);
  check('four skill slots display the left-hand number bindings', await pc.evaluate('["moonlight","bronze","boar","heal"].map(id=>document.querySelector("#btn-gu-"+id+" .skill-key-badge").textContent).join("")==="1234"'));
  await acquireGu(pc, 'moonlight');
  await acquireGu(pc, 'heal', true);
  before = await pc.snapshot();
  check('free first choice plus a paid second Gu must both be tamed with the real starter budget', before.usableGuIds.includes('moonlight') && before.usableGuIds.includes('heal') && before.stones === 0, { usableGuIds: before.usableGuIds, stones: before.stones });
  await pc.key('keyDown', 'd', 'KeyD'); await delay(550); await pc.key('keyUp', 'd', 'KeyD'); await delay(200);
  let after = await pc.snapshot();
  check('trusted movement changes the authoritative field position', after.x > before.x + 35 && after.x < before.x + 180 && Math.abs(after.y - before.y) < 3, { before: { x: before.x, y: before.y }, after: { x: after.x, y: after.y } });
  for (const [digit, action] of [['1', 'moonlight'], ['4', 'heal']]) {
    const prior = await pc.snapshot();
    await pc.press(digit, 'Digit' + digit);
    const state = await untilState(async () => { const s = await pc.snapshot(); return s.cooldowns[action] > 0.3 ? s : null; }, 'Digit ' + digit + ' casts ' + action);
    const cost = GU_DEFINITIONS[action].primevalCostBps / 100;
    check('Digit ' + digit + ' casts the controlled ' + action + ' on the server at its whole-aperture cost', state.mp <= prior.mp - cost + 0.5 && state.cooldowns[action] > 0, { beforeMp: prior.mp, mp: state.mp, expectedCost: cost, cooldown: state.cooldowns[action] });
  }
  before = await pc.snapshot();
  await pc.reload(); after = await pc.snapshot();
  check('reload resumes the same life and saved pose without rerolling spawn', after.lifeId === before.lifeId && Math.hypot(after.x - before.x, after.y - before.y) < 4, { before: { lifeId: before.lifeId, x: before.x, y: before.y }, after: { lifeId: after.lifeId, x: after.x, y: after.y } });
  await pc.click('#btn-open-world'); await pc.until('!!document.querySelector("#modal-overworld-atlas.active")');
  before = await pc.snapshot(); await pc.click('#oa-region-east'); after = await pc.snapshot();
  check('atlas shows five regions and selecting a region never teleports the player', await pc.evaluate('document.querySelectorAll("[data-atlas-region]").length===5 && document.querySelector("#oa-detail-title").textContent==="Đông Hải"') && before.x === after.x && before.y === after.y);
  await pc.screenshot('atlas-desktop'); await pc.click('#oa-return');
  await pc.click('#btn-open-settings'); await pc.until('!!document.querySelector("#modal-action-settings.active")');
  await pc.click('#as-slot-0'); await pc.press('End', 'End', 35); await pc.press('Enter', 'Enter', 13);
  await pc.until('JSON.parse(localStorage.getItem("cotienlo_action_settings_v1")||"{}").slots?.[0]==="heal"');
  check('the player can equip an owned active Gu in a different skill slot', true);
  await pc.click('[data-settings-tab="bindings"]'); await pc.click('#as-bind-slot1'); await pc.press('q', 'KeyQ');
  await pc.until('JSON.parse(localStorage.getItem("cotienlo_action_settings_v1")||"{}").bindings?.slot1==="KeyQ"');
  check('settings capture a custom physical key for slot one', true);
  await pc.click('#as-bind-dash'); await pc.press('e', 'KeyE');
  await pc.until('JSON.parse(localStorage.getItem("cotienlo_action_settings_v1")||"{}").bindings?.dash==="KeyE"');
  await pc.screenshot('bindings-desktop'); await pc.click('.as-close');
  await pc.press('o', 'KeyO'); await pc.until('!!document.querySelector("#modal-action-settings.active")');
  check('O reopens settings while the HUD button still has focus', true);
  await pc.click('.as-close');
  await untilState(async () => (await pc.snapshot()).cooldowns.heal === 0, 'heal cooldown finishes before binding acceptance', 15000);
  await pc.press('1', 'Digit1'); await delay(300); before = await pc.snapshot();
  check('the old slot key stops casting after a rebind', before.cooldowns.heal === 0);
  await pc.press('q', 'KeyQ');
  after = await untilState(async () => { const s = await pc.snapshot(); return s.cooldowns.heal > 10 ? s : null; }, 'custom Q casts newly equipped Heal');
  check('the custom key casts the newly equipped Gu with its shared cooldown', after.buffs.heal > 0 && after.mp <= before.mp - GU_DEFINITIONS.heal.primevalCostBps / 100 + 0.5, { beforeMp: before.mp, afterMp: after.mp, healCooldown: after.cooldowns.heal });
  await pc.press('e', 'KeyE');
  after = await untilState(async () => { const s = await pc.snapshot(); return s.buffs.dash > 0 ? s : null; }, 'custom E dash from HUD focus');
  check('a rebound dash key works even while a HUD button retains focus', after.stamina < 100);
  await pc.reload();
  check('skill loadout and key settings survive a normal reload', await pc.evaluate('(() => {const p=JSON.parse(localStorage.getItem("cotienlo_action_settings_v1"));return p.slots[0]==="heal" && p.bindings.slot1==="KeyQ" && document.querySelector("#btn-gu-moonlight .skill-key-badge").textContent==="Q"})()'));
  await pc.screenshot('world-desktop');

  const phone = await page('localhost', true);
  await phone.fill('#wp-name', 'Người Đồng Hành'); await phone.click('#wp-join'); await phone.ready();
  await acquireGu(phone, 'moonlight');
  const phoneLife = await phone.snapshot(); const firstLife = await pc.snapshot();
  const firstPeer = firstLife.nearbyPlayers.some(p => p.name === 'Người Đồng Hành');
  const secondPeer = phoneLife.nearbyPlayers.some(p => p.name === 'Người Kiểm Thử');
  check('two independent accounts see each other in the same nearby shared field', firstPeer && secondPeer && phoneLife.lifeId !== firstLife.lifeId, { firstPeers: firstLife.nearbyPlayers.length, secondPeers: phoneLife.nearbyPlayers.length });
  const joyCenter = await phone.point('#joystick-base');
  const skillCenter = await phone.point('#btn-gu-moonlight');
  const joy = { id: 1, x: joyCenter.x + 35, y: joyCenter.y, radiusX: 5, radiusY: 5, force: 1 };
  const finger = { id: 2, x: skillCenter.x, y: skillCenter.y, radiusX: 5, radiusY: 5, force: 1 };
  const touch = (type, touchPoints) => phone.call('Input.dispatchTouchEvent', { type, touchPoints });
  await touch('touchStart', [{ ...joy, x: joyCenter.x }]); await touch('touchMove', [joy]); await delay(160);
  before = await phone.snapshot();
  await touch('touchStart', [joy, finger]); await touch('touchMove', [joy, { ...finger, x: finger.x - 60 }]);
  let castWhileHolding = false;
  const holding = await untilState(async () => {
    const s = await phone.snapshot();
    castWhileHolding ||= s.cooldowns.moonlight > 0 || s.projectiles.some(p => p.type === 'moonlight');
    return s.x > before.x + 1 ? s : null;
  }, 'joystick motion acknowledgement during aim', 2000);
  check('touch aiming does not cast before release while the other finger keeps moving', !castWhileHolding && holding.cooldowns.moonlight === 0 && holding.x > before.x, { xBefore: before.x, xWhileHolding: holding.x, moonlightCooldown: holding.cooldowns.moonlight, castWhileHolding });
  await phone.screenshot('two-finger-preview');
  // CDP touchEnd identifies the fingers being lifted; the joystick remains down.
  await touch('touchEnd', [{ ...finger, x: finger.x - 60 }]);
  after = await untilState(async () => { const s = await phone.snapshot(); return s.cooldowns.moonlight > 0.3 ? s : null; }, 'touch release casts Moonlight');
  check('second-finger release casts left and preserves rightward joystick movement', after.x > before.x && after.projectiles.some(p => p.type === 'moonlight' && p.vx < -400), { xBefore: before.x, xAfter: after.x, projectiles: after.projectiles.map(p => ({ type: p.type, vx: p.vx, vy: p.vy })) });
  const xOnRelease = after.x; await delay(250); after = await phone.snapshot();
  check('the joystick continues after releasing the skill finger', after.x > xOnRelease + 10);
  await touch('touchEnd', [joy]);
  check('the main phone interface fits its viewport', await phone.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  await phone.click('#btn-open-settings'); await phone.until('!!document.querySelector("#modal-action-settings.active")');
  check('settings remain usable within phone width', await phone.evaluate('(() => {const r=document.querySelector(".as-panel").getBoundingClientRect();return r.left>=0 && r.right<=innerWidth+1})()'));
  await phone.screenshot('settings-phone'); await phone.click('.as-close'); await phone.screenshot('world-phone');

  // A third, isolated account walks into real PvE using only trusted key events.
  // Snapshot reads steer the keyboard; no test hook changes HP, position or death.
  const { browserContextId } = await browserCall('Target.createBrowserContext');
  const mortal = await page('127.0.0.1', false, browserContextId);
  await mortal.fill('#wp-name', 'Khách Luân Hồi'); await mortal.click('#wp-join'); await mortal.ready();
  await mortal.call('Page.bringToFront');
  const living = await mortal.snapshot();
  // Road encounters have an authored clear approach. The nearest procedural
  // wolf can be behind rocks, which would test pathfinding rather than controls.
  const wolf = getNearbyEncounters(living.x, living.y, 4000).filter(m => m.type === 'wolf' && m.id.includes(':encounter:') && !isInsideSanctuary(m.x, m.y))
    .sort((a, b) => Math.hypot(a.x - living.x, a.y - living.y) - Math.hypot(b.x - living.x, b.y - living.y))[0];
  if (!wolf) throw new Error('No nearby wolf available for normal-input mortality acceptance');
  report.mortality = { target: wolf, start: { x: living.x, y: living.y } };
  const held = new Set();
  const letters = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd' };
  const setKeys = async next => {
    for (const code of held) if (!next.has(code)) { await mortal.key('keyUp', letters[code], code); held.delete(code); }
    for (const code of next) if (!held.has(code)) { await mortal.key('keyDown', letters[code], code); held.add(code); }
  };
  const walkDeadline = Date.now() + 35000;
  let fighting = living;
  while (Date.now() < walkDeadline) {
    fighting = await mortal.snapshot();
    if (fighting.dead || fighting.monsters.some(m => m.state === 'attack' && Math.hypot(m.x - fighting.x, m.y - fighting.y) < 75)) break;
    const dx = wolf.x - fighting.x, dy = wolf.y - fighting.y;
    if (Math.hypot(dx, dy) < 65) break;
    const next = new Set();
    if (Math.abs(dx) > 24) next.add(dx > 0 ? 'KeyD' : 'KeyA');
    if (Math.abs(dy) > 24) next.add(dy > 0 ? 'KeyS' : 'KeyW');
    await setKeys(next); await delay(140);
  }
  await setKeys(new Set());
  const approached = await mortal.snapshot();
  report.mortality.approach = { x: approached.x, y: approached.y, hp: approached.hp, monsters: approached.monsters.filter(m => Math.hypot(m.x - approached.x, m.y - approached.y) < 400) };
  let defeated;
  try { defeated = await untilState(async () => { const s = await mortal.snapshot(); return s.dead ? s : null; }, 'normal AI defeats the idle character', 18000); }
  catch (error) { report.mortality.timeout = await mortal.snapshot(); await mortal.screenshot('mortality-timeout'); throw error; }
  await mortal.until('!!document.querySelector("#modal-field-death.active")');
  const archived = world.snapshot(await mortal.token());
  check('normal keyboard exploration and monster AI end a life and open the death panel once', defeated.hp === 0 && archived.account.pastLives.length === 1, { lifeNumber: defeated.lifeNumber, cause: defeated.cause, pastLives: archived.account.pastLives.length, x: defeated.x, y: defeated.y });
  await mortal.screenshot('normal-ai-death');
  await mortal.click('#btn-world-rebirth');
  await mortal.until('!document.querySelector("#modal-field-death.active") && document.querySelector("#quest-text")?.textContent.includes("Đời 2")');
  const reborn = await mortal.snapshot();
  check('the actual rebirth button starts an empty-Gu life at a safe randomly sampled region spawn', reborn.lifeId !== defeated.lifeId && reborn.lifeNumber === defeated.lifeNumber + 1 && reborn.hp === reborn.maxHp && !reborn.dead && isInsideSanctuary(reborn.x, reborn.y) && reborn.guIds.length === 0 && reborn.usableGuIds.length === 0, { oldLife: defeated.lifeId, newLife: reborn.lifeId, lifeNumber: reborn.lifeNumber, regionId: reborn.regionId, x: reborn.x, y: reborn.y, hp: reborn.hp, seq: reborn.seq, guIds: reborn.guIds });
  await mortal.screenshot('reborn-world');

  await checkLandscapeMenus(phone);
  }
  check('no uncaught browser exceptions', report.exceptions.length === 0, report.exceptions);
} catch (error) {
  report.failures.push({ name: 'execution', error: String(error.stack || error) }); console.error(String(error.stack || error));
} finally {
  await writeFile(path.join(out, layoutOnly ? 'layout-report.json' : 'report.json'), JSON.stringify(report, null, 2));
  if (browserCall) { try { await browserCall('Browser.close'); } catch {} }
  for (const socket of sockets) socket.close();
  if (chrome.exitCode === null) await new Promise(resolve => { chrome.once('exit', resolve); setTimeout(() => { chrome.kill(); resolve(); }, 3000); });
  await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
  try { const actual = await realpath(profile); if (actual.startsWith((await realpath(out)) + path.sep)) await rm(actual, { recursive: true, force: true }); } catch {}
}
if (report.failures.length) process.exitCode = 1;
