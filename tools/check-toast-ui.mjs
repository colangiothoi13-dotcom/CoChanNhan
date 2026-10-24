#!/usr/bin/env node
// UI-only acceptance on a fresh Chrome profile. Never creates an account or writes actor state.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.tmp/toast-corner/browser'); await mkdir(out, { recursive: true });
const profile = path.join(out, 'profile-' + Date.now()); await mkdir(profile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { checks: [], failures: [], exceptions: [], screenshots: [], cases: [] };
const sockets = [];
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-gpu-sandbox', '--disable-software-rasterizer',
  '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let browser, debugPort;
function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url); sockets.push(socket); let sequence = 0; const pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.method === 'Runtime.exceptionThrown') report.exceptions.push(message.params.exceptionDetails);
      const task = pending.get(message.id); if (!task) return;
      pending.delete(message.id); clearTimeout(task.timer);
      message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
    });
    socket.addEventListener('open', () => resolve((method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')); }, 12000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    })), { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
}
function check(name, passed, evidence) {
  const item = { name, passed: !!passed, ...(evidence === undefined ? {} : { evidence }) };
  report.checks.push(item); if (!passed) report.failures.push(item);
  console.log(JSON.stringify(passed ? { name, passed: true } : item));
}
async function runCase(label, width, height, largeText = false) {
  const { targetId } = await browser('Target.createTarget', { url: 'about:blank' });
  const call = await connect(`ws://127.0.0.1:${debugPort}/devtools/page/${targetId}`);
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const until = async expression => {
    const end = Date.now() + 12000;
    while (Date.now() < end) { if (await evaluate(expression)) return; await delay(80); }
    throw new Error('Timed out: ' + expression + '\n' + await evaluate('JSON.stringify({active:[...document.querySelectorAll(".game-modal.active")].map(e=>e.id),text:document.body.innerText.slice(-1800)})'));
  };
  const click = async selector => {
    const point = await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  };
  await call('Page.enable'); await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 800 });
  await call('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await until('!!document.querySelector("#modal-world.active #wp-close")');
  await delay(350);
  await click('#wp-close'); await delay(1050);
  if (await evaluate('!!document.querySelector("#modal-tutorial.active")')) await click('#btn-tutorial-confirm');
  await until('!document.querySelector(".game-modal.active")');
  if (largeText) {
    await evaluate('document.querySelector("#hud-name").style.fontSize="32px"');
    await until('document.documentElement.dataset.largeText === "true"');
  }
  await evaluate(`(async()=>{const {Toast}=await import('/src/ui/Toast.ts');for(let n=0;n<5;n++)Toast.show('Chiêu đang hồi. Hãy chờ một chút.',6000);})()`);
  const duplicate = await evaluate('[...document.querySelectorAll("#toast-container .toast-msg")].filter(e=>e.textContent==="Chiêu đang hồi. Hãy chờ một chút.").length');
  check(label + ': duplicate message remains one node', duplicate === 1, { duplicate });
  await evaluate(`(async()=>{const {Toast}=await import('/src/ui/Toast.ts');Toast.show('Một thông báo khác để kiểm tra góc màn hình.',6000);})()`);
  await delay(350);
  const metrics = await evaluate(`(() => {
    const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
    const container=document.querySelector('#toast-container');const all=[...container.querySelectorAll('.toast-msg')];
    const visible=all.filter(e=>getComputedStyle(e).display!=='none');const hud=box(document.querySelector('#top-hud'));
    return {viewport:{width:innerWidth,height:innerHeight,pageWidth:document.documentElement.scrollWidth},container:box(container),hud,
      pointerEvents:getComputedStyle(container).pointerEvents,position:getComputedStyle(container).position,
      count:all.length,visible:visible.map(box),centerCovered:visible.some(e=>{const r=e.getBoundingClientRect();return innerWidth/2>=r.left&&innerWidth/2<=r.right&&innerHeight/2>=r.top&&innerHeight/2<=r.bottom})};
  })()`);
  report.cases.push({ label, ...metrics });
  check(label + ': at most two distinct nodes', metrics.count <= 2, metrics);
  check(label + ': corner aligned inside viewport', metrics.viewport.width - metrics.container.right >= 0 && metrics.viewport.width - metrics.container.right <= 20 && metrics.container.x >= 0 && metrics.viewport.pageWidth <= width + 1, metrics);
  check(label + ': never intercepts clicks or covers center', metrics.pointerEvents === 'none' && !metrics.centerCovered, metrics);
  check(label + ': expected vertical anchor', largeText ? metrics.position === 'fixed' && metrics.container.top >= 0 && metrics.container.top <= 20 : metrics.container.top >= metrics.hud.bottom + 8, metrics);
  check(label + ': visible notices fit height', metrics.visible.every(box=>box.top >= 0 && box.bottom <= height), metrics);
  if (height <= 520 && width > height) check(label + ': short landscape shows newest only', metrics.visible.length === 1, metrics);
  const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const filename = path.join(out, label + '.png'); await writeFile(filename, Buffer.from(shot.data, 'base64')); report.screenshots.push(filename);
  await browser('Target.closeTarget', { targetId });
}
try {
  let info;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { info = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n'); break; }
    catch { await delay(100); }
  }
  if (!info) throw new Error('Chrome did not start'); debugPort = info[0].trim();
  browser = await connect('ws://127.0.0.1:' + debugPort + info[1]);
  await runCase('desktop-1440x900', 1440, 900);
  await runCase('phone-375x812', 375, 812);
  await runCase('landscape-568x320', 568, 320);
  await runCase('large-text-375x812', 375, 812, true);
  check('no uncaught browser exceptions', report.exceptions.length === 0, report.exceptions);
} catch (error) {
  report.failures.push({ name: 'execution', error: String(error.stack || error) }); console.error(String(error.stack || error));
} finally {
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  if (browser) { try { await browser('Browser.close'); } catch {} }
  for (const socket of sockets) socket.close();
  if (chrome.exitCode === null) await new Promise(resolve => { chrome.once('exit', resolve); setTimeout(() => { chrome.kill(); resolve(); }, 3000); });
  try { const actual = await realpath(profile); if (actual.startsWith((await realpath(out)) + path.sep)) await rm(actual, { recursive: true, force: true }); } catch {}
}
if (report.failures.length) process.exitCode = 1;
