import {build} from 'esbuild';
import {cp, mkdir, readdir, rm, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const cloudflare = process.argv.includes('--cloudflare');
const output = path.join(root, 'dist');
if (cloudflare) {
  await rm(output, {recursive: true, force: true});
  await mkdir(output, {recursive: true});
}
await build({
  absWorkingDir: root,
  entryPoints: ['assets/app.mjs'],
  bundle: true,
  outfile: cloudflare ? 'dist/script.js' : 'script.js',
  format: 'iife',
  loader: {'.glb': cloudflare ? 'file' : 'binary'},
  assetNames: 'assets/models/[name]-[hash]',
  target: ['chrome110', 'firefox110', 'safari16'],
  minify: true,
  legalComments: 'eof',
});

if (cloudflare) {
  const publicFiles = ['index.html', 'style.css', 'gallery.css', 'visitor.css', 'walk.css', 'motion.css', 'theme-light.css', 'games', 'assets/THREE-LICENSE.txt'];
  for (const file of publicFiles) await cp(path.join(root, file), path.join(output, file), {recursive: true});
  // Fail the build before upload if a future model exceeds the platform limit.
  const assets = [];
  async function checkAssets(directory) {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await checkAssets(file);
      else {
        const {size} = await stat(file);
        if (size > 25 * 1024 ** 2) throw new Error(`Cloudflare asset exceeds 25 MiB: ${path.relative(output, file)}`);
        assets.push({file, size});
      }
    }
  }
  await checkAssets(output);
  const largest = assets.reduce((a, b) => a.size > b.size ? a : b);
  console.log(`Cloudflare build: ${assets.length} assets in dist; largest ${path.relative(output, largest.file)} (${(largest.size / 1024 ** 2).toFixed(2)} MiB)`);
} else {
  console.log('AlexNet offline bundle built: script.js');
}
