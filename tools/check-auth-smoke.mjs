#!/usr/bin/env node
// Isolated browser acceptance: real UI/HTTP, memory-only accounts and a captured test mailbox.
// Production AuthStore never exposes OTPs. This fixture sends no external email.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuthStore } from '../cotienlo-game/server/auth-store.mjs';
import { WorldStore } from '../cotienlo-game/server/world-store.mjs';
import { createWorldServer } from '../cotienlo-game/server/http-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.tmp/requirements-audit/auth-browser');
await mkdir(out, { recursive: true });
const profile = path.join(out, 'profile-' + Date.now());
await mkdir(profile);
const mail = new Map();
const auth = new AuthStore({ filePath: null, mailer: (email, otp) => { mail.set(email, otp); } });
const world = new WorldStore({ randomIndex: () => 0 });
const server = createWorldServer({ store: world, authStore: auth, checkpointIntervalMs: 0 });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const report = { checks: [], failures: [], exceptions: [], screenshots: [] };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-gpu-sandbox', '--disable-software-rasterizer',
  '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const sockets = [];
function check(name, passed, evidence) {
  const item = { name, passed: !!passed, ...(evidence === undefined ? {} : { evidence }) };
  report.checks.push(item);
  if (!passed) report.failures.push(item);
  console.log(JSON.stringify(item));
}
function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    sockets.push(socket);
    const pending = new Map();
    let id = 0;
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.method === 'Runtime.exceptionThrown') report.exceptions.push(message.params.exceptionDetails);
      const request = pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer); pending.delete(message.id);
      message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
    });
    socket.addEventListener('open', () => resolve((method, params = {}) => new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(method + ' timed out')); }, 15000);
      pending.set(requestId, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    })), { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
}
let browserCall;
async function page(hostname) {
  const { targetId } = await browserCall('Target.createTarget', { url: 'about:blank' });
  const call = await connect(`ws://127.0.0.1:${debugPort}/devtools/page/${targetId}`);
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const until = async (expression, timeout = 12000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await evaluate(expression)) return; await delay(80); }
    throw new Error('Timeout: ' + expression + '\n' + await evaluate('document.body.innerText.slice(-1500)'));
  };
  const click = async selector => {
    const point = await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;return{x,y,disabled:e.disabled,hit:e.contains(document.elementFromPoint(x,y))}})()`);
    if (!point.hit || point.disabled) throw new Error('Blocked control: ' + selector);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await delay(100);
  };
  const fill = async (selector, text) => { await click(selector); await call('Input.insertText', { text }); };
  const openAuth = async () => {
    if (await evaluate('!!document.querySelector("#modal-auth.active")')) return;
    await click('#btn-open-cultivator');
    await click('#btn-open-auth-from-char');
    await until('document.querySelector("#modal-auth").classList.contains("active")');
  };
  const screenshot = async label => {
    const image = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const filename = path.join(out, hostname + '-' + label + '.png');
    await writeFile(filename, Buffer.from(image.data, 'base64')); report.screenshots.push(filename);
  };
  await call('Page.enable'); await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: `http://${hostname}:${port}/` });
  await until('!!document.querySelector("#btn-open-cultivator")');
  await until('document.querySelector("#modal-tutorial")?.classList.contains("active") || localStorage.getItem("cotienlo_tutorial_seen")==="true"');
  if (await evaluate('!!document.querySelector("#modal-tutorial.active")')) await click('#btn-tutorial-confirm');
  return { call, evaluate, until, click, fill, openAuth, screenshot };
}
let debugPort;
try {
  let info;
  for (let index = 0; index < 100; index++) {
    try { info = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n'); break; }
    catch { await delay(100); }
  }
  if (!info) throw new Error('Chrome failed to start');
  debugPort = info[0].trim();
  browserCall = await connect('ws://127.0.0.1:' + debugPort + info[1]);
  const first = await page('127.0.0.1');
  await first.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
  await delay(600);
  await first.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
  await first.openAuth();
  await first.fill('#auth-email-input', 'qa.player@gmail.com');
  await first.fill('#auth-name-input', '<img src=x onerror=alert(1)>');
  await first.fill('#auth-password-input', 'QaPassword123');
  await first.click('[data-auth-action="send-otp"]');
  await first.until('document.querySelector("#auth-status-msg").textContent.includes("gửi")');
  if (!mail.get('qaplayer@gmail.com')) throw new Error('No captured test delivery');
  await first.fill('#auth-otp-input', mail.get('qaplayer@gmail.com'));
  await first.click('[data-auth-action="verify-otp"]');
  await first.until('!!document.querySelector("[data-auth-action=save-cloud]")');
  check('OTP registration through real UI and HTTP', true);
  check('hostile display name rendered as text', await first.evaluate('document.querySelector(".auth-user-name").textContent==="<img src=x onerror=alert(1)>" && !document.querySelector(".auth-user-name img")'));
  await first.click('[data-auth-action="save-cloud"]');
  await first.until('document.querySelector("#auth-status-msg").textContent.includes("Đã lưu")');
  const savedToken = await first.evaluate('Object.keys(localStorage).filter(k=>k.includes("auth")&&k.includes("session")).map(k=>localStorage.getItem(k)).find(Boolean)');
  // Read-only server assertions use the captured session from the test browser; never print it.
  const saved = auth.getUserByToken(savedToken);
  if (!saved?.savedProgress) throw new Error('No persisted progress after upload');
  const expectedX = saved.savedProgress.localSave.x;
  check('full practice snapshot stored with life, Gu and chronicle', !!saved.savedProgress.localSave.localLife && !!saved.savedProgress.soulChronicle && Array.isArray(saved.savedProgress.localSave.ownedGuIds));
  await first.screenshot('account-desktop');
  const second = await page('localhost');
  await second.openAuth();
  await second.click('[data-auth-action="switch-mode"][data-target-mode="password"]');
  await second.fill('#auth-login-email', 'qa.player@gmail.com');
  await second.fill('#auth-login-pass', 'QaPassword123');
  await second.click('[data-auth-action="password-login"]');
  await second.until('!!document.querySelector("[data-auth-action=load-cloud]")');
  check('new device login does not automatically import local gameplay', await second.evaluate('Number(JSON.parse(localStorage.getItem("cotienlo_save_v1")||"{}").x||1200)') !== expectedX);
  await second.click('[data-auth-action="load-cloud"]');
  await second.until(`JSON.parse(localStorage.getItem('cotienlo_save_v1')||'{}').x===${JSON.stringify(expectedX)}`);
  check('explicit download restores the complete saved practice', true);
  await second.openAuth();
  await second.click('[data-auth-action="connect-world"]');
  // Opening the panel restores the latest server snapshot before enabling actions.
  await second.until('document.querySelector("#wp-investigate")?.disabled === false');
  await second.click('#wp-investigate');
  await second.until('!!document.querySelector("#wp-summary-duong-truc")');
  check('verified account creates authoritative world life', true);
  await second.click('#wp-close');
  await first.click('[data-auth-action="connect-world"]');
  await first.until('!!document.querySelector("#wp-summary-duong-truc")');
  check('another device resumes the same verified world and investigation', true);
  await first.click('#wp-close');
  await second.openAuth();
  await second.call('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  const width = await second.evaluate('({page:document.documentElement.scrollWidth,viewport:innerWidth,card:document.querySelector("#modal-auth .modal-card").getBoundingClientRect().width})');
  check('account form fits phone width', width.page <= width.viewport + 1 && width.card <= width.viewport, width);
  await second.screenshot('account-phone');
  await second.click('[data-auth-action="logout"]');
  await second.until('!document.querySelector(".auth-user-name") && !!document.querySelector("#auth-email-input,#auth-login-email")');
  check('logout clears the linked world view', await second.evaluate('!document.querySelector("#wp-investigate")'));
  await second.click('#btn-close-auth');
  await second.click('#btn-open-cultivator');
  await second.click('#btn-open-rules');
  await second.until('!!document.querySelector("#rules-amount")');
  check('rules lab is labelled as an isolated simulation', await second.evaluate('document.querySelector("#modal-rules").innerText.toLowerCase().includes("mô phỏng")'));
  for (let index = 0; index < 4; index++) await second.click('#rules-spend');
  check('44 percent aperture supports four absolute ten-point uses', await second.evaluate('document.querySelector("#rules-amount").textContent.trim()==="4%"'));
  await second.click('#rules-spend');
  check('insufficient essence never partially spends', await second.evaluate('document.querySelector("#rules-amount").textContent.trim()==="4%" && document.querySelector("#rules-result").dataset.ok==="false"'));
  await second.click('[data-rules-view="permission"]');
  await second.click('#rules-borrow-use');
  check('borrowing requires the owner permission and custody', await second.evaluate('document.querySelector("#rules-result").dataset.ok==="false" && document.querySelector("#rules-borrower-amount").textContent==="44%"'));
  await second.click('#rules-grant');
  await second.click('#rules-borrow-use');
  const afterBorrow = await second.evaluate('document.querySelector("#rules-borrower-amount").textContent');
  check('authorized borrowed Gu spends the borrower essence', afterBorrow !== '44%' && await second.evaluate('document.querySelector("#rules-result").dataset.ok==="true"'));
  await second.click('#rules-revoke');
  await second.click('#rules-borrow-use');
  check('revoked permission blocks use without another spend', await second.evaluate(`document.querySelector("#rules-result").dataset.ok==="false" && document.querySelector("#rules-borrower-amount").textContent===${JSON.stringify(afterBorrow)}`));
  await second.click('[data-rules-view="refinement"]');
  await second.click('#rules-refine-a');
  check('first immortal refinement reserves the target', await second.evaluate('document.querySelector("#rules-result").dataset.ok==="true" && document.querySelector(".rules-card").innerText.includes("Đang luyện")'));
  await second.click('#rules-refine-b');
  check('another rank cannot bypass the immortal type reservation', await second.evaluate('document.querySelector("#rules-result").dataset.ok==="false"'));
  await second.click('#rules-finish-bad');
  await second.click('#rules-refine-b');
  check('failed refinement releases the reservation for another actor', await second.evaluate('document.querySelector("#rules-result").dataset.ok==="true"'));
  await second.click('[data-rules-view="ascension"]');
  await second.click('#rules-shatter');
  await second.click('#rules-absorb');
  await second.click('#rules-release');
  check('three-step ascension grants neither lifespan nor an immortal Gu', await second.evaluate('document.querySelector("#rules-ascender-rank").textContent.includes("6") && document.querySelector("#rules-ascender-life").textContent==="80 năm" && document.querySelector("#rules-immortal-owned").textContent==="0"'));
  await second.click('[data-rules-action="reset"]');
  await second.click('#rules-shatter');
  await second.click('#rules-absorb-risk');
  check('risky absorption demonstrates fatal imbalance', await second.evaluate('document.querySelector("#rules-result").dataset.ok==="false" && document.querySelector(".rules-card").innerText.includes("Đã mất")'));
  await second.click('[data-rules-view="time"]');
  await second.click('#rules-advance-one');
  await second.click('#rules-ratio-20');
  await second.click('#rules-advance-one');
  check('piecewise ratio preserves the earlier interval', await second.evaluate('document.querySelector("#rules-inner-years").textContent.trim()==="21"'));
  await second.click('[data-rules-view="tribulation"]');
  await second.click('#rules-advance-three-hundred');
  check('three hundred inner years keep overlapping thirty earthly and three heavenly events', await second.evaluate('document.querySelector("#rules-earth-count").textContent.trim()==="30" && document.querySelector("#rules-heaven-count").textContent.trim()==="3"'));
  await second.click('#rules-defend');
  check('owner survives the lesson and can pay to defend a tribulation', await second.evaluate('document.querySelector("#rules-result").dataset.ok==="true" && document.querySelector("#rules-dao-marks").textContent==="10"'));
  await second.click('#rules-fail-tribulation');
  check('failed tribulation resolves without another dao-mark reward', await second.evaluate('document.querySelector("#rules-result").dataset.ok==="true" && document.querySelector("#rules-dao-marks").textContent==="10"'));
  await second.screenshot('rules-phone');
  check('rules lab fits phone width', await second.evaluate('document.documentElement.scrollWidth <= innerWidth+1'));
  check('no uncaught browser exceptions', report.exceptions.length === 0, report.exceptions);
} catch (error) {
  report.failures.push({ name: 'execution', error: String(error.stack || error) });
  console.error(String(error.stack || error));
} finally {
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  if (browserCall) { try { await browserCall('Browser.close'); } catch {} }
  for (const socket of sockets) socket.close();
  if (chrome.exitCode === null) await new Promise(resolve => { chrome.once('exit', resolve); setTimeout(() => { chrome.kill(); resolve(); }, 3000); });
  await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
  try { const actual = await realpath(profile); if (actual.startsWith((await realpath(out)) + path.sep)) await rm(actual, { recursive: true, force: true }); } catch {}
}
if (report.failures.length) process.exitCode = 1;
