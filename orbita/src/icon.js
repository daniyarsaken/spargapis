'use strict';

// Draws the Orbita mark (a ring with a small satellite) as PNG at runtime,
// so the repository needs no binary image files.

const zlib = require('zlib');
const { nativeImage } = require('electron');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// coverage(x, y) in a unit square -> 0..1, supersampled 4x4 per pixel
function rasterize(size, shapes) {
  const rgba = Buffer.alloc(size * size * 4);
  const ss = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss) / size;
          const v = (y + (sy + 0.5) / ss) / size;
          for (let i = shapes.length - 1; i >= 0; i--) {
            const s = shapes[i];
            if (s.hit(u, v)) {
              r += s.color[0]; g += s.color[1]; b += s.color[2]; a += s.color[3];
              break;
            }
          }
        }
      }
      const n = ss * ss;
      const o = (y * size + x) * 4;
      const alpha = a / n;
      rgba[o] = alpha ? Math.round(r / n / (alpha / 255)) : 0;
      rgba[o + 1] = alpha ? Math.round(g / n / (alpha / 255)) : 0;
      rgba[o + 2] = alpha ? Math.round(b / n / (alpha / 255)) : 0;
      rgba[o + 3] = Math.round(alpha);
    }
  }
  return rgba;
}

const dist = (u, v, cx, cy) => Math.hypot(u - cx, v - cy);

function markShapes({ fill, ring }) {
  const shapes = [];
  if (fill) shapes.push({ color: fill, hit: (u, v) => dist(u, v, 0.5, 0.5) <= 0.5 });
  shapes.push({ color: ring, hit: (u, v) => Math.abs(dist(u, v, 0.5, 0.5) - 0.27) <= 0.06 });
  shapes.push({ color: ring, hit: (u, v) => dist(u, v, 0.7, 0.3) <= 0.1 });
  return shapes;
}

function image(builder, sizes) {
  const img = nativeImage.createEmpty();
  for (const [size, scaleFactor] of sizes) {
    img.addRepresentation({ scaleFactor, buffer: encodePng(size, builder(size)) });
  }
  return img;
}

// Menu bar / system tray icon. On macOS it is a template image so the system
// tints it for light and dark menu bars.
function trayIcon() {
  if (process.platform === 'darwin') {
    const img = image((s) => rasterize(s, markShapes({ ring: [0, 0, 0, 255] })), [[18, 1], [36, 2]]);
    img.setTemplateImage(true);
    return img;
  }
  return image(
    (s) => rasterize(s, markShapes({ fill: [0, 113, 227, 255], ring: [255, 255, 255, 255] })),
    [[16, 1], [32, 2]],
  );
}

function appIcon() {
  return image(
    (s) => rasterize(s, markShapes({ fill: [0, 113, 227, 255], ring: [255, 255, 255, 255] })),
    [[256, 1], [512, 2]],
  );
}

module.exports = { trayIcon, appIcon, encodePng };
