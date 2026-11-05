import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {loadGltfAsset} from '../assets/gltf-asset.mjs';

const bytes = readFileSync(new URL('../assets/models/accelerator-live.glb', import.meta.url));
const keys = ['compute', 'fan', 'heatsink', 'pcb', 'vram'];
function checkModel(gltf) {
  assert.deepEqual(gltf.scene.children.map(part => part.userData.key).sort(), keys);
  assert.equal(gltf.animations.length, 1);
  assert.equal(gltf.animations[0].tracks.length, 2);
  gltf.scene.traverse(object => {
    object.geometry?.dispose();
    for (const material of [].concat(object.material ?? [])) material.dispose();
  });
}

test('offline GLB loading respects the byte offset of an embedded array', async () => {
  const padded = Buffer.concat([Buffer.from('padding'), bytes, Buffer.from('suffix')]);
  checkModel(await loadGltfAsset(padded.subarray(7, 7 + bytes.length)));
});

test('web GLB loading retrieves the model and preserves its animation clips', async t => {
  const server = createServer((request, response) => {
    if (request.url === '/model.glb') {
      response.writeHead(200, {'Content-Type': 'model/gltf-binary'});
      response.end(bytes);
    } else {
      response.writeHead(404);
      response.end('Missing asset');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  checkModel(await loadGltfAsset(`${base}/model.glb`));
  await assert.rejects(loadGltfAsset(`${base}/missing.glb`), /404/);
});
