import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function files(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}

test('Cloudflare build ships the complete website with every asset under 25 MiB', () => {
  const offlineHash = hash(readFileSync(path.join(root, 'script.js')));
  const result = spawnSync(process.execPath, ['build.mjs', '--cloudflare'], {cwd: root, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  const output = path.join(root, 'dist');
  assert.ok(existsSync(path.join(output, 'index.html')), 'Cloudflare build must create dist/index.html');
  const assets = files(output);
  for (const asset of assets) {
    assert.ok(statSync(asset).size <= 25 * 1024 ** 2, `Asset too large: ${path.relative(output, asset)}`);
    assert.ok(!/\.(?:blend|mjs)$/.test(asset), `Source archive must not be published: ${asset}`);
  }
  const models = assets.filter(asset => asset.endsWith('.glb'));
  const originals = [
    'compute-system-live.glb', 'accelerator-live.glb', 'history-neuron-v003.glb',
    'history-rules-v003.glb', 'history-search-v003.glb', 'history-learning-v003.glb',
    'learning-sculpture.glb',
  ];
  assert.equal(models.length, originals.length);
  assert.deepEqual(models.map(file => hash(readFileSync(file))).sort(),
    originals.map(file => hash(readFileSync(path.join(root, 'assets/models', file)))).sort(),
    'Published models must preserve the original geometry and animations');
  for (const name of ['index.html', 'style.css', 'gallery.css', 'visitor.css', 'walk.css', 'motion.css', 'theme-light.css']) {
    assert.deepEqual(readFileSync(path.join(output, name)), readFileSync(path.join(root, name)));
  }
  for (const original of files(path.join(root, 'games'))) {
    assert.deepEqual(readFileSync(path.join(output, path.relative(root, original))), readFileSync(original));
  }
  assert.ok(existsSync(path.join(output, 'assets/THREE-LICENSE.txt')));
  assert.equal(hash(readFileSync(path.join(root, 'script.js'))), offlineHash, 'Cloudflare build must preserve the offline bundle');
});
