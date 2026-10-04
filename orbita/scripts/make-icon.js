'use strict';

// Writes build/icon.ico (16–256 px) for the Windows installer and executable,
// drawn by the same code as the tray icon.

const fs = require('fs');
const path = require('path');
const { encodePng, rasterize, markShapes } = require('../src/icon');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const shapes = markShapes({ fill: [0, 113, 227, 255], ring: [255, 255, 255, 255] });
const images = SIZES.map((size) => encodePng(size, rasterize(size, shapes)));

// ICO container with PNG-compressed entries (supported since Windows Vista)
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(images.length, 4);

let offset = 6 + 16 * images.length;
const entries = images.map((png, i) => {
  const entry = Buffer.alloc(16);
  const size = SIZES[i];
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
  entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += png.length;
  return entry;
});

const out = path.join(__dirname, '..', 'build', 'icon.ico');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([header, ...entries, ...images]));
fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.png'), images[images.length - 1]);
console.log(`icon written: ${path.relative(process.cwd(), out)}`);
