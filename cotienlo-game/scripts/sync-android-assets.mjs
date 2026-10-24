import { copyFile, lstat, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function isInside(parent, child) {
  const path = relative(parent, child);
  return path !== '' && path !== '..' && !path.startsWith(`..\\`) && !path.startsWith('../') && !isAbsolute(path);
}

async function filesIn(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Asset directories must not contain symbolic links: ${path}`);
    if (entry.isDirectory()) files.push(...await filesIn(root, path));
    else if (entry.isFile()) files.push(relative(root, path));
    else throw new Error(`Unsupported asset: ${path}`);
  }
  return files.sort();
}

export async function syncAndroidAssets(sourceDirectory, destinationDirectory) {
  const source = resolve(sourceDirectory);
  const destination = resolve(destinationDirectory);
  if (source === destination || isInside(source, destination) || isInside(destination, source)) {
    throw new Error('The build and Android asset directories must not overlap.');
  }
  const sourceFiles = await filesIn(source);
  const html = await readFile(join(source, 'index.html'), 'utf8');
  for (const [, reference] of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    if (/^(?:https?:|data:|#|\/\/)/i.test(reference)) continue;
    const asset = resolve(source, decodeURIComponent(reference.split(/[?#]/, 1)[0]));
    if (!isInside(source, asset)) throw new Error(`Asset reference escapes outside the build: ${reference}`);
    const info = await stat(asset).catch(() => null);
    if (!info?.isFile()) throw new Error(`Missing generated asset: ${reference}`);
  }

  const destinationInfo = await lstat(destination).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (destinationInfo?.isSymbolicLink()) throw new Error(`Android asset directory must not be a symbolic link: ${destination}`);
  await mkdir(destination, { recursive: true });
  const oldFiles = await filesIn(destination);
  for (const file of sourceFiles) {
    const target = join(destination, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(source, file), target);
  }
  const currentFiles = new Set(sourceFiles);
  for (const file of oldFiles) {
    if (!currentFiles.has(file)) await rm(join(destination, file));
  }
  return sourceFiles.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const gameDirectory = fileURLToPath(new URL('../', import.meta.url));
  const destination = resolve(gameDirectory, '../app/src/main/assets/cotienlo');
  const count = await syncAndroidAssets(join(gameDirectory, 'dist'), destination);
  console.log(`Synced ${count} validated game files to Android assets.`);
}
