import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { test } from 'node:test';

const { syncAndroidAssets } = await import('./sync-android-assets.mjs').catch(() => ({}));

async function fixture(run) {
  const temporaryDirectory = resolve(tmpdir());
  const root = await mkdtemp(join(temporaryDirectory, 'cotienlo-assets-'));
  const source = join(root, 'dist');
  const destination = join(root, 'android', 'cotienlo');
  await mkdir(join(source, 'assets'), { recursive: true });
  await mkdir(destination, { recursive: true });
  await writeFile(join(source, 'index.html'), '<script type="module" src="./assets/game.js"></script>');
  await writeFile(join(source, 'assets', 'game.js'), 'window.gameReady = true;');
  try {
    assert.equal(typeof syncAndroidAssets, 'function', 'the Android asset sync command is missing');
    await run(source, destination);
  } finally {
    assert.equal(dirname(resolve(root)), temporaryDirectory);
    assert.ok(basename(root).startsWith('cotienlo-assets-'));
    await rm(root, { recursive: true, force: true });
  }
}

test('replaces stale hashed bundles with the current validated web build', async () => {
  await fixture(async (source, destination) => {
    await writeFile(join(destination, 'obsolete.js'), 'old bundle');
    await syncAndroidAssets(source, destination);
    assert.deepEqual((await readdir(destination)).sort(), ['assets', 'index.html']);
    assert.equal(await readFile(join(destination, 'assets', 'game.js'), 'utf8'), 'window.gameReady = true;');
    await syncAndroidAssets(source, destination);
    assert.deepEqual(await readdir(join(destination, 'assets')), ['game.js']);
  });
});

test('keeps packaged assets intact when a generated HTML reference is missing', async () => {
  await fixture(async (source, destination) => {
    await writeFile(join(source, 'index.html'), '<script src="./assets/missing.js"></script>');
    await writeFile(join(destination, 'known-good.js'), 'preserve me');
    await assert.rejects(syncAndroidAssets(source, destination), /missing\.js/);
    assert.equal(await readFile(join(destination, 'known-good.js'), 'utf8'), 'preserve me');
  });
});

test('rejects asset references escaping the generated web build', async () => {
  await fixture(async (source, destination) => {
    await writeFile(join(source, 'index.html'), '<script src="../private.js"></script>');
    await assert.rejects(syncAndroidAssets(source, destination), /outside|escape/i);
  });
});
