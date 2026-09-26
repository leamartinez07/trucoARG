import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_PATH || 'sharp');
await mkdir('public/cards', { recursive: true });
const suits = { espadas: 'swords', bastos: 'clubs', oros: 'coins', copas: 'cups' };
const tasks = Object.entries(suits).flatMap(([suit, english]) =>
  [1, 2, 3, 4, 5, 6, 7, 10, 11, 12].map((value) => ({ suit, value, english })),
);
let count = 0;
async function worker() {
  while (tasks.length) {
    const { suit, value, english } = tasks.shift();
    const url = `https://raw.githubusercontent.com/gjenkins20/spanish-playing-cards-svg/main/card_${english}_${String(value).padStart(2, '0')}.svg`;
    const response = await fetch(url);
    if (!response.ok) throw Error(`${url}: ${response.status}`);
    const svg = Buffer.from(await response.arrayBuffer());
    const image = await sharp(svg, { limitInputPixels: 10000000 })
      .resize(360, 554, { fit: 'contain' })
      .webp({ quality: 85 })
      .toBuffer();
    await writeFile(`public/cards/${suit}-${value}.webp`, image);
    console.log(`${++count}/40 ${suit}-${value}`);
  }
}
await Promise.all(Array.from({ length: 5 }, worker));
