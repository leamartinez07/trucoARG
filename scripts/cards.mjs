import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_PATH || 'sharp');
await mkdir('public/cards', { recursive: true });
// Complete public-domain Catalan-pattern deck, B. P. Grimaud, 1860 (BnF / Commons).
const base = 'https://gallica.bnf.fr/iiif/ark:/12148/btv1b10513825g';
const manifestResponse = await fetch(`${base}/manifest.json`);
if (!manifestResponse.ok) throw Error(`Manifest: ${manifestResponse.status}`);
const manifest = await manifestResponse.json();
const canvases = manifest.sequences[0].canvases;
if (canvases.length !== 80)
  throw Error('El escaneo no contiene los 40 frentes y dorsos esperados.');
const suits = { copas: 0, oros: 20, bastos: 40, espadas: 60 };
const tasks = Object.entries(suits).flatMap(([suit, offset]) =>
  [1, 2, 3, 4, 5, 6, 7, 10, 11, 12].map((value, index) => ({
    suit,
    value,
    canvas: canvases[offset + index * 2],
  })),
);
let count = 0;
async function worker() {
  while (tasks.length) {
    const { suit, value, canvas } = tasks.shift();
    const url = `${canvas.images[0].resource.service['@id']}/full/500,/0/native.jpg`;
    let response;
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await fetch(url, {
        headers: { 'User-Agent': 'TrucoARG/1.0 (public-domain card assets)' },
        signal: AbortSignal.timeout(20000),
      });
      if (response.ok || ![429, 502, 503].includes(response.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 5000 * (attempt + 1)));
    }
    if (!response.ok) throw Error(`${url}: ${response.status}`);
    const original = Buffer.from(await response.arrayBuffer());
    const image = await sharp(original)
      .resize(360, 554, { fit: 'fill' })
      .webp({ quality: 88 })
      .toBuffer();
    await writeFile(`public/cards/${suit}-${value}.webp`, image);
    console.log(`${++count}/40 ${suit}-${value}`);
  }
}
await Promise.all(Array.from({ length: 3 }, worker));
