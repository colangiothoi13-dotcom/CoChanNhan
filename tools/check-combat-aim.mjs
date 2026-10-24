#!/usr/bin/env node
// Real mouse and two-finger touch acceptance. Fixture observes render arguments only;
// it never sets player state or exposes test hooks in the production game.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, realpath, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.tmp/combat-aim/browser');
const fixtureDir = path.join(root, 'cotienlo-game/.tmp');
const fixture = path.join(fixtureDir, 'combat-aim-acceptance.html');
await mkdir(out, { recursive: true }); await mkdir(fixtureDir, { recursive: true });
const monitor = `<script type="module">
import { Cultivator } from '/src/entities/Cultivator.ts';
import { Projectile } from '/src/entities/Projectile.ts';
import { CombatAimInput } from '/src/engine/CombatAimInput.ts';
const qa = window.__combatQa = { player: null, shots: [], inputEvents: [], drag: null };
for (const type of ['pointerdown','pointerup','pointercancel','lostpointercapture','touchstart','touchend','touchcancel'])
  document.addEventListener(type, e => qa.inputEvents.push({type,id:e.pointerId,target:e.target.id,pointerType:e.pointerType,
    touches:e.touches ? [...e.touches].map(t=>t.identifier) : undefined}), {capture:true,passive:true});
const preview = CombatAimInput.prototype.getDragPreview;
CombatAimInput.prototype.getDragPreview = function() { const value=preview.call(this);qa.drag=value;return value; };
const seen = new WeakSet();
const renderPlayer = Cultivator.prototype.render;
Cultivator.prototype.render = function(ctx, camera) {
  qa.player = {x:this.x,y:this.y,mp:this.mp,facing:this.facingAngle,dashing:this.isDashing,
    screen:camera.worldToScreen(this.x,this.y)};
  return renderPlayer.call(this,ctx,camera);
};
const renderShot = Projectile.prototype.render;
Projectile.prototype.render = function(ctx,camera) {
  if (!seen.has(this)) {seen.add(this);qa.shots.push({type:this.type,vx:this.vx,vy:this.vy,angle:this.angle});}
  return renderShot.call(this,ctx,camera);
};
</script>`;
const html = (await readFile(path.join(root, 'cotienlo-game/index.html'), 'utf8'))
  .replaceAll('./src/', '/src/').replace('</body>', monitor + '\n</body>');
await writeFile(fixture, html);
const profile = path.join(out, 'profile-' + Date.now()); await mkdir(profile);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-gpu-sandbox', '--disable-software-rasterizer',
  '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { checks: [], failures: [], exceptions: [], screenshots: [] };
const sockets = [];
let browserCall, debugPort;
function check(name, passed, evidence) {
  const result = { name, passed: !!passed, ...(evidence === undefined ? {} : { evidence }) };
  report.checks.push(result); if (!passed) report.failures.push(result);
  console.log(JSON.stringify(passed ? { name, passed: true } : result));
}
function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url); sockets.push(socket);
    const pending = new Map(); let id = 0;
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.method === 'Runtime.exceptionThrown') report.exceptions.push(message.params.exceptionDetails);
      const request = pending.get(message.id); if (!request) return;
      clearTimeout(request.timer); pending.delete(message.id);
      message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
    });
    socket.addEventListener('open', () => resolve((method, params = {}) => new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(method + ' timed out')); }, 15000);
      pending.set(requestId, { resolve, reject, timer }); socket.send(JSON.stringify({ id: requestId, method, params }));
    })), { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
}
async function page(host, mobile = false) {
  const { targetId } = await browserCall('Target.createTarget', { url: 'about:blank' });
  const call = await connect(`ws://127.0.0.1:${debugPort}/devtools/page/${targetId}`);
  const evaluate = async expression => {
    const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result.value;
  };
  const until = async expression => {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) { if (await evaluate(expression)) return; await delay(80); }
    throw new Error('Timed out: ' + expression);
  };
  const mouse = async (type, x, y, button = 'none') => call('Input.dispatchMouseEvent', { type, x, y, button, ...(button === 'left' ? { clickCount: 1 } : {}) });
  const click = async selector => {
    const point = await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await mouse('mousePressed', point.x, point.y, 'left'); await mouse('mouseReleased', point.x, point.y, 'left'); await delay(100);
  };
  const key = (type, key, code) => call('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: key === ' ' ? 32 : key.toUpperCase().charCodeAt(0) });
  const center = selector => evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  const state = () => evaluate('structuredClone(window.__combatQa)');
  const screenshot = async name => {
    const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const filename = path.join(out, name + '.png'); await writeFile(filename, Buffer.from(shot.data, 'base64')); report.screenshots.push(filename);
  };
  await call('Page.enable'); await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: mobile ? 375 : 1440, height: mobile ? 812 : 900, deviceScaleFactor: 2, mobile });
  if (mobile) await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await call('Page.navigate', { url: `http://${host}:5173/.tmp/combat-aim-acceptance.html` });
  await until('!!window.__combatQa?.player && !!document.querySelector("#modal-tutorial.active")');
  await click('#btn-tutorial-confirm');
  await until('!document.querySelector(".game-modal.active")');
  await delay(450);
  return { call, evaluate, until, mouse, click, key, center, state, screenshot };
}
try {
  let info;
  for (let index = 0; index < 100; index++) {
    try { info = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n'); break; }
    catch { await delay(100); }
  }
  if (!info) throw new Error('Chrome failed to start'); debugPort = info[0].trim();
  browserCall = await connect('ws://127.0.0.1:' + debugPort + info[1]);
  const pc = await page('127.0.0.1');
  await pc.key('keyDown', 'd', 'KeyD'); await delay(180);
  let before = await pc.state();
  let aim = { x: before.player.screen.x - 170, y: before.player.screen.y };
  await pc.mouse('mouseMoved', aim.x, aim.y);
  await pc.mouse('mousePressed', aim.x, aim.y, 'left'); await pc.mouse('mouseReleased', aim.x, aim.y, 'left'); await delay(150);
  let after = await pc.state();
  check('mouse click fires left while the player keeps running right', after.shots.length === 1 && after.shots[0].vx < -300 && after.player.x > before.player.x, { shot: after.shots[0], facing: after.player.facing });
  await pc.key('keyDown', 'k', 'KeyK'); await pc.key('keyUp', 'k', 'KeyK'); await delay(100);
  after = await pc.state();
  check('K fires Moonlight along the mouse aim independently of movement', after.shots.filter(s => s.type === 'moonlight').length === 1 && after.shots.at(-1).vx < -440);
  const xBeforeDash = after.player.x;
  await pc.key('keyDown', ' ', 'Space'); await pc.key('keyUp', ' ', 'Space'); await delay(100);
  after = await pc.state();
  check('dash continues right while the last shot aims left', after.player.dashing && after.player.x > xBeforeDash && after.player.facing === 0);
  await pc.key('keyUp', 'd', 'KeyD'); await delay(400);
  before = await pc.state(); aim = { x: before.player.screen.x - 170, y: before.player.screen.y };
  await pc.mouse('mouseMoved', aim.x, aim.y);
  await pc.key('keyDown', 'j', 'KeyJ'); await pc.key('keyUp', 'j', 'KeyJ'); await delay(80);
  after = await pc.state();
  check('J shares the same aimed basic attack', after.shots.length === before.shots.length + 1 && after.shots.at(-1).vx < -300);
  await pc.click('#btn-gu-moonlight'); await delay(1200);
  before = await pc.state();
  await pc.mouse('mouseMoved', before.player.screen.x - 170, before.player.screen.y);
  const focusedHud = await pc.evaluate('document.activeElement?.id');
  await pc.key('keyDown', 'j', 'KeyJ'); await pc.key('keyUp', 'j', 'KeyJ');
  await pc.key('keyDown', 'k', 'KeyK'); await pc.key('keyUp', 'k', 'KeyK'); await delay(100);
  after = await pc.state();
  check('J and K remain usable after a real HUD click retains button focus', focusedHud === 'btn-gu-moonlight' && after.shots.length === before.shots.length + 2 && after.shots.slice(-2).every(s=>s.vx < -300));
  await pc.screenshot('mouse-aim-desktop');

  const phone = await page('localhost', true);
  const joystick = await phone.center('#joystick-base');
  const attack = await phone.center('#btn-attack');
  const moon = await phone.center('#btn-gu-moonlight');
  const joy = { id: 1, x: joystick.x + 35, y: joystick.y, radiusX: 5, radiusY: 5, force: 1 };
  const touch = (type, points) => phone.call('Input.dispatchTouchEvent', { type, touchPoints: points });
  await touch('touchStart', [{ ...joy, x: joystick.x }]); await touch('touchMove', [joy]); await delay(140);
  before = await phone.state();
  const finger = { id: 2, x: attack.x, y: attack.y, radiusX: 5, radiusY: 5, force: 1 };
  await touch('touchStart', [joy, finger]);
  await touch('touchMove', [joy, { ...finger, x: attack.x - 65 }]); await delay(140);
  after = await phone.state();
  check('holding an aimed touch does not cast before release', after.shots.length === 0 && after.player.x > before.player.x);
  await phone.screenshot('two-finger-aim-preview');
  // CDP touchEnd lists the fingers being lifted, not the fingers that remain down.
  await touch('touchEnd', [{ ...finger, x: attack.x - 65 }]); await delay(120);
  after = await phone.state();
  check('second finger release fires left while joystick movement continues right', after.shots.length === 1 && after.shots[0].vx < -300 && after.player.x > before.player.x, {before,after});
  const xOnRelease = after.player.x;
  await delay(450); after = await phone.state();
  check('compatibility click does not produce a second slash or release the joystick', after.shots.length === 1 && after.player.x > xOnRelease, {shots:after.shots,player:after.player});
  before = after;
  const guFinger = { ...finger, id: 3, x: moon.x, y: moon.y };
  await touch('touchStart', [joy, guFinger]);
  await touch('touchMove', [joy, { ...guFinger, x: moon.x - 55, y: moon.y - 55 }]); await delay(80);
  await touch('touchEnd', [{ ...guFinger, x: moon.x - 55, y: moon.y - 55 }]); await delay(100); after = await phone.state();
  check('dragging Moonlight diagonally casts once with its normal resource cost', after.shots.filter(s => s.type === 'moonlight').length === 1 && after.shots.at(-1).vx < -300 && after.shots.at(-1).vy < -300 && after.player.mp < before.player.mp - 10, {before,after});
  await delay(400);
  await touch('touchStart', [joy, { ...finger, id: 4 }]); await touch('touchEnd', [{ ...finger, id: 4 }]); await delay(100);
  after = await phone.state();
  check('a quick tap reuses the latest manually chosen direction', after.shots.filter(s => s.type === 'slash').length === 2 && after.shots.at(-1).vx < -200 && after.shots.at(-1).vy < -200);
  await delay(400); before = await phone.state();
  await touch('touchStart', [joy, { ...finger, id: 5 }]);
  await touch('touchMove', [joy, { ...finger, id: 5, x: attack.x - 60 }]);
  await touch('touchCancel', []); await delay(400); after = await phone.state();
  check('cancelled touch never fires later', after.shots.length === before.shots.length);
  await phone.screenshot('touch-aim-phone');
  check('phone layout fits the viewport', await phone.evaluate('document.documentElement.scrollWidth <= innerWidth+1'));
  check('no uncaught browser exceptions', report.exceptions.length === 0, report.exceptions);
} catch (error) {
  report.failures.push({ name: 'execution', error: String(error.stack || error) }); console.error(String(error.stack || error));
} finally {
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  if (browserCall) { try { await browserCall('Browser.close'); } catch {} }
  for (const socket of sockets) socket.close();
  if (chrome.exitCode === null) await new Promise(resolve => { chrome.once('exit', resolve); setTimeout(() => { chrome.kill(); resolve(); }, 3000); });
  try { const actual = await realpath(profile); if (actual.startsWith((await realpath(out)) + path.sep)) await rm(actual, { recursive: true, force: true }); } catch {}
  await unlink(fixture).catch(() => {});
}
if (report.failures.length) process.exitCode = 1;
