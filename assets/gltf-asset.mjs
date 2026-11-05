import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

// Offline builds embed Uint8Arrays; web builds emit URLs to individual GLBs.
export async function loadGltfAsset(asset) {
  let buffer;
  if (typeof asset === 'string') {
    const response = await fetch(asset);
    if (!response.ok) throw new Error(`Failed to load GLB (${response.status}): ${asset}`);
    buffer = await response.arrayBuffer();
  } else {
    buffer = asset.buffer.slice(asset.byteOffset, asset.byteOffset + asset.byteLength);
  }
  return new GLTFLoader().parseAsync(buffer, '');
}
