#!/usr/bin/env node
// Read-only checks of the actual browser origin and its API proxy. No account or mail is created.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const supplied = process.argv.filter(arg => arg.startsWith('--base-url=')).map(arg => arg.slice(11));
const origins = (supplied.length ? supplied : ['http://127.0.0.1:8787']).map(value => {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Use a plain HTTP(S) service origin.');
  return url.origin;
});
const checks = [];
for (const origin of origins) {
  const ui = await fetch(origin + '/', { signal: AbortSignal.timeout(5000) });
  const html = await ui.text();
  if (!ui.ok || !html.includes('data-game-mode="overworld"') || !html.includes('id="btn-open-settings"')) throw new Error('Wrong game UI: ' + origin);
  const request = (route, options = {}) => fetch(origin + route, { signal: AbortSignal.timeout(5000), ...options });
  const health = await request('/api/world/health');
  const field = await request('/api/world/field', { headers: { Origin: origin } });
  const input = await request('/api/world/field/input', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
  const auth = await request('/api/auth/me', { headers: { Origin: origin } });
  const untrusted = await request('/api/world/health', { headers: { Origin: 'https://untrusted.example' } });
  const rawWorld = await request('/.world-data/world.json', { method: 'HEAD' });
  if (rawWorld.ok && /application\/json/i.test(rawWorld.headers.get('content-type') ?? '')) {
    throw new Error('Private world data is exposed outside the authenticated API: ' + origin);
  }
  if (health.status !== 200 || field.status !== 401 || input.status !== 401 || auth.status !== 401 || untrusted.status !== 403) {
    throw new Error('Unexpected API/proxy status: ' + JSON.stringify({ origin, health: health.status, field: field.status, input: input.status, auth: auth.status, untrusted: untrusted.status }));
  }
  checks.push({ origin, ui: ui.status, health: health.status, fieldRequiresSession: field.status,
    inputRequiresSession: input.status, authRequiresSession: auth.status, untrustedOriginRejected: untrusted.status,
    privateWorldDataExposed: false, rawWorldStatus: rawWorld.status });
}
const out = path.join(root, '.tmp/five-regions'); await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'running-services.json'), JSON.stringify({ checks }, null, 2));
console.log(JSON.stringify({ services: checks.length, passed: true, checks }));
