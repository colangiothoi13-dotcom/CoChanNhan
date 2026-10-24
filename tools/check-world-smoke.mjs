#!/usr/bin/env node
/** Real-browser shared-world acceptance. Start `npm run server` and `npm run dev` first.
 * node tools/check-world-smoke.mjs --base-url=http://127.0.0.1:5173
 * Uses isolated guest profiles; never imports practice inventory or edits world state.
 */
import { mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const [key, ...rest] = value.replace(/^--/, '').split('='); return [key, rest.join('=')];
}));
const base = new URL(args['base-url'] || 'http://127.0.0.1:5173');
const out = path.resolve(root, args.out || '.tmp/shared-world/browser-qa');
const artifactRoot = path.resolve(root, '.tmp');
if (!out.startsWith(artifactRoot + path.sep)) throw new Error('Output must remain within workspace .tmp.');
await mkdir(out, { recursive: true });
const profile = path.join(out, 'profile-' + Date.now());
await mkdir(profile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { checks: [], failures: [], exceptions: [], screenshots: [], protocolTrace: [] };
const chrome = spawn(args.chrome || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-gpu-sandbox',
  '--disable-software-rasterizer', '--no-first-run', '--no-default-browser-check',
  '--force-device-scale-factor=1', '--window-size=1440,900',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let socket;
let debugPort;
const pageSockets = [];
const pending = new Map();
let nextId = 0;
function command(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')); }, 15000);
    pending.set(id, { resolve, reject, timeout });
    report.protocolTrace.push({ sent: method, id, sessionId });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
function check(name, condition, evidence = '') {
  const record = { name, passed: !!condition, evidence };
  report.checks.push(record);
  if (!condition) report.failures.push(record);
  console.log(JSON.stringify(record));
}
async function page(name) {
  // Localhost and 127.0.0.1 have separate browser storage and use the same local world.
  const address = new URL(base);
  if (name === 'second') address.hostname = base.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
  const { targetId } = await command('Target.createTarget', { url: 'about:blank' });
  const pageSocket = new WebSocket(`ws://127.0.0.1:${debugPort}/devtools/page/${targetId}`);
  pageSockets.push(pageSocket);
  await new Promise((resolve, reject) => { pageSocket.addEventListener('open', resolve, { once: true }); pageSocket.addEventListener('error', reject, { once: true }); });
  const requests = new Map();
  let nextRequest = 0;
  pageSocket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Runtime.exceptionThrown') report.exceptions.push(message.params.exceptionDetails);
    const request = requests.get(message.id);
    if (request) { clearTimeout(request.timeout); requests.delete(message.id); message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextRequest;
    const timeout = setTimeout(() => { requests.delete(id); reject(new Error(method + ' timed out in ' + name)); }, 15000);
    requests.set(id, { resolve, reject, timeout });
    pageSocket.send(JSON.stringify({ id, method, params }));
  });
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Page.navigate', { url: address.href + '?world=1' });
  async function evaluate(expression) {
    const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error('Evaluation: ' + JSON.stringify(response.exceptionDetails));
    return response.result.value;
  }
  async function until(expression, timeout = 12000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return;
      await delay(80);
    }
    throw new Error('Timeout: ' + expression + '\n' + await evaluate('document.body.innerText.slice(-2500)'));
  }
  async function click(selector) {
    const point = await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el)throw new Error('Missing '+${JSON.stringify(selector)});el.scrollIntoView({block:'center',inline:'nearest'});const r=el.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;const hit=document.elementFromPoint(x,y);return{x,y,disabled:!!el.disabled,hit:hit===el||el.contains(hit)};})()`);
    if (point.disabled || !point.hit) throw new Error('Cannot click ' + selector + ': ' + JSON.stringify(point));
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await delay(100);
  }
  async function screenshot(suffix) {
    const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const filename = path.join(out, name + '-' + suffix + '.png');
    await writeFile(filename, Buffer.from(result.data, 'base64'));
    report.screenshots.push(filename);
  }
  async function layout(label, width, height, scale = 1) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    if (scale !== 1) await evaluate(`document.documentElement.style.fontSize=${JSON.stringify(16 * scale + 'px')}`);
    await delay(200);
    const measurements = await evaluate(`(() => {const card=document.querySelector('#modal-world .modal-card');const bounds=card.getBoundingClientRect();const controls=[...card.querySelectorAll('button,input:not([type=checkbox]),select,summary')].filter(el=>el.getClientRects().length&&!el.closest('[hidden]')&&getComputedStyle(el).visibility!=='hidden');return {width:innerWidth,document:document.documentElement.scrollWidth,card:{x:bounds.x,right:bounds.right,width:bounds.width},overflows:controls.filter(el=>{const r=el.getBoundingClientRect();return r.x<bounds.x-1||r.right>bounds.right+1}).map(el=>el.id),small:controls.filter(el=>{const r=el.getBoundingClientRect();return r.width<43.9||r.height<43.9}).map(el=>({id:el.id,w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height}))}})()`);
    check(name + ' layout ' + label, measurements.document <= width + 1 && measurements.card.x >= -1 && measurements.card.right <= width + 1 && !measurements.overflows.length && !measurements.small.length, measurements);
    await screenshot(label);
  }
  return { call, evaluate, until, click, screenshot, layout };
}

try {
  let portInfo;
  for (let i = 0; i < 100; i++) {
    try { portInfo = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n'); break; }
    catch { await delay(100); }
  }
  if (!portInfo) throw new Error('Chrome did not start.');
  debugPort = portInfo[0].trim();
  socket = new WebSocket('ws://127.0.0.1:' + portInfo[0] + portInfo[1]);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (report.protocolTrace.length < 80) report.protocolTrace.push({ received: message.method || 'response', id: message.id, sessionId: message.sessionId, error: message.error });
    if (message.method === 'Runtime.exceptionThrown') report.exceptions.push(message.params.exceptionDetails);
    const request = pending.get(message.id);
    if (request) { clearTimeout(request.timeout); pending.delete(message.id); message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result); }
  });
  const first = await page('first');
  await first.until('!!document.querySelector("#wp-name")');
  await first.layout('phone-login', 375, 812);
  await first.click('#wp-name');
  await first.call('Input.insertText', { text: 'QA Luot Mot ' + Date.now().toString(36).slice(-4) });
  await first.click('#wp-join');
  await first.until('!!document.querySelector("#wp-investigate")');
  check('shared world entered through normal UI', true);
  check('entering the world resets welcome-form scroll', await first.evaluate('document.querySelector(".wp-scroll").scrollTop < 2'));
  await first.layout('desktop-atlas', 1440, 900);
  await first.click('#wp-investigate');
  await first.until('!!document.querySelector("#wp-summary-duong-truc")');
  await first.click('#wp-summary-duong-truc');
  await first.click('#wp-consent-duong-truc');
  await first.click('#wp-commit-duong-truc');
  await first.until('!!document.querySelector("#wp-choice-rush")');
  check('commitment opens authoritative trial', true);
  await first.click('#wp-choice-rush');
  await first.until('document.querySelector("#wp-trial-title") && document.querySelector(".wp-trial").innerText.includes("2/3")');
  check('first error is recoverable', true);
  await first.click('#wp-choice-rush');
  await first.until('!!document.querySelector("[data-world-action=rebirth]")');
  check('decisive failure ends current life', true);
  await first.screenshot('death');
  await first.call('Page.reload', { ignoreCache: true });
  await first.until('!!document.querySelector("[data-world-action=rebirth]")');
  check('reload preserves death', true);
  await first.click('[data-world-action=rebirth][data-value=east]');
  await first.until('document.querySelector("#wp-investigate") && document.querySelector("#modal-world").innerText.includes("Vịnh Hai Triều")');
  check('new origin begins in another region', true);
  await first.click('#wp-tab-journal');
  check('account journal survives death', await first.evaluate('document.querySelector("#modal-world").innerText.includes("Dưỡng Trúc")'));
  await first.layout('phone-journal', 375, 812);
  await first.layout('landscape-journal', 812, 375);
  await first.layout('large-text-journal', 375, 812, 2);
  const second = await page('second');
  await second.until('!!document.querySelector("#wp-name")');
  await second.click('#wp-name');
  await second.call('Input.insertText', { text: 'QA Luot Hai ' + Date.now().toString(36).slice(-4) });
  await second.click('#wp-join');
  await second.until('!!document.querySelector("#wp-investigate")');
  await second.click('#wp-investigate');
  await second.until('!!document.querySelector("#wp-summary-duong-truc")');
  await second.click('#wp-summary-duong-truc');
  await second.click('#wp-consent-duong-truc');
  await second.click('#wp-commit-duong-truc');
  await second.until('!!document.querySelector("#wp-choice-prepare")');
  for (let stage = 0; stage < 3; stage++) {
    await second.click('#wp-choice-prepare');
    if (stage < 2) await second.until(`document.querySelector('.wp-trial-top')?.innerText.includes('CỬA ${stage + 2}')`);
  }
  await second.until('!document.querySelector("#wp-choice-prepare") && !!document.querySelector("#wp-investigate")');
  check('prepared route grants inheritance without death', await second.evaluate('document.querySelector("#modal-world").innerText.includes("Dưỡng Trúc")'));
  await second.click('#wp-tab-world');
  await second.screenshot('world-history');
  await first.evaluate('document.documentElement.style.fontSize="16px"');
  await first.click('#wp-tab-world');
  await first.until('document.querySelector("#modal-world").innerText.includes("QA Luot Hai")');
  check('separate browser account observes same world history', true);
  check('no uncaught browser exception', report.exceptions.length === 0, report.exceptions);
} catch (error) {
  report.failures.push({ name: 'execution', error: String(error.stack || error) });
  console.error(String(error.stack || error));
} finally {
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  if (socket?.readyState === WebSocket.OPEN) { try { await command('Browser.close'); } catch { /* already closing */ } }
  for (const request of pending.values()) { clearTimeout(request.timeout); request.reject(new Error('Browser closed')); }
  socket?.close();
  for (const pageSocket of pageSockets) pageSocket.close();
  if (chrome.exitCode === null) await new Promise(resolve => { chrome.once('exit', resolve); setTimeout(() => { chrome.kill(); resolve(); }, 3000); });
  try { const resolved = await realpath(profile); const output = await realpath(out); if (resolved.startsWith(output + path.sep)) await rm(resolved, { recursive: true, force: true }); } catch { /* leave locked test artifact for inspection */ }
}
if (report.failures.length) process.exitCode = 1;
