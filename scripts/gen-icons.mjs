#!/usr/bin/env node
/**
 * Generates the Cashflow brand assets.
 *
 * The mark is a transcription of the web app's `LogoMark.tsx` (a gold coin with
 * an embossed C), pixel geometry taken straight from its 64-unit viewBox so the
 * two clients ship the *same* logo rather than two drawings of one idea:
 *
 *   <circle r="23" fill="#b08d3f" stroke="#8f7233" stroke-width="2" />
 *   <path d="M42 25A12 12 0 1 0 42 39" stroke="#2b3138" stroke-width="6"
 *         stroke-linecap="round" />
 *
 * Written with zlib and a hand-rolled PNG encoder rather than a raster library:
 * it is two circles and an arc, and a dependency that exists to draw them is a
 * dependency that has to be maintained forever.
 *
 * Two rules encoded here, both learned the expensive way on the sibling app:
 *
 *  1. **`icon.png` has no alpha channel.** App Store Connect rejects an icon
 *     with transparency at *upload*, before review, so it is written as RGB.
 *     It is also square and full-bleed — iOS applies its own corner mask, and
 *     baking the corners in (as the web `logo-icon-1024.png` does) shows up as
 *     white notches on the home screen.
 *  2. The Android adaptive foreground keeps its alpha and stays inside the
 *     66% safe zone, or the launcher crops the mark.
 *
 * Run: npm run gen:icons
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

/**
 * Palette. The three coin colours are BRAND values owned by `LogoMark.tsx` —
 * they are deliberately not theme tokens, because the logo does not restyle
 * itself per scheme. The background is the token (`--background`, dark).
 */
const INK = [0x10, 0x10, 0x14]; // --background (dark), and the C cut out of the coin
const COIN = [0xb0, 0x8d, 0x3f]; // coin face
const RING = [0x8f, 0x72, 0x33]; // coin rim
const WHITE = [0xff, 0xff, 0xff];

// ── PNG encoding ────────────────────────────────────────────────────────────

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

/** `pixels` is RGB or RGBA, row-major. */
const encodePng = (width, height, pixels, hasAlpha) => {
  const channels = hasAlpha ? 4 : 3;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = hasAlpha ? 6 : 2; // colour type: RGBA / RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// ── The mark, in the web logo's 64-unit coordinate space ────────────────────

const OUTER = 24; // coin rim, outer edge (r=23 + half of the 2-wide stroke)
const FACE = 22; // coin rim, inner edge — inside this is the coin face
const ARC_OUTER = 15; // C stroke: r=12 ± half of the 6-wide stroke
const ARC_INNER = 9;
const CAP = 3; // stroke-linecap="round" — a disc at each arc endpoint
const CAP_X = 10; // endpoints (42,25) and (42,39), relative to the centre (32,32)
const CAP_Y = 7;
const GAP = Math.atan2(CAP_Y, CAP_X); // the wedge the C opens to the right

/**
 * Which material a point lands on, or `null` for the canvas behind the coin.
 * Coordinates are relative to the coin's centre, in viewBox units.
 */
const material = (x, y) => {
  const distance = Math.hypot(x, y);
  if (distance > OUTER) return null;

  const onArc =
    distance >= ARC_INNER && distance <= ARC_OUTER && Math.abs(Math.atan2(y, x)) >= GAP;
  const onCap =
    Math.hypot(x - CAP_X, y + CAP_Y) <= CAP || Math.hypot(x - CAP_X, y - CAP_Y) <= CAP;
  if (onArc || onCap) return INK;

  return distance >= FACE ? RING : COIN;
};

/**
 * Average colour and coverage of one pixel, sampled 4×4.
 *
 * `scale` shrinks the mark within the canvas; 1 puts the coin at 75% of the
 * width, which is the footprint the web icon already ships.
 */
const sample = (px, py, size, scale) => {
  const unit = (size / 64) * scale;
  const centre = size / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  let hits = 0;

  for (let sy = 0; sy < 4; sy += 1) {
    for (let sx = 0; sx < 4; sx += 1) {
      const colour = material(
        (px + (sx + 0.5) / 4 - centre) / unit,
        (py + (sy + 0.5) / 4 - centre) / unit,
      );
      if (!colour) continue;
      r += colour[0];
      g += colour[1];
      b += colour[2];
      hits += 1;
    }
  }

  if (hits === 0) return null;
  return [r / hits, g / hits, b / hits, hits / 16];
};

/** The mark on a solid background. No alpha channel. */
const renderOpaque = (size, background, scale = 1) => {
  const pixels = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const hit = sample(x, y, size, scale);
      const offset = (y * size + x) * 3;
      for (let c = 0; c < 3; c += 1) {
        pixels[offset + c] = hit
          ? Math.round(background[c] * (1 - hit[3]) + hit[c] * hit[3])
          : background[c];
      }
    }
  }
  return encodePng(size, size, pixels, false);
};

/**
 * The mark on transparency.
 *
 * `flatten` replaces every material with one colour — the Android monochrome
 * layer, where the launcher wants a silhouette, not a two-tone coin.
 */
const renderTransparent = (size, scale = 1, flatten = null) => {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const hit = sample(x, y, size, scale);
      if (!hit) continue;
      const offset = (y * size + x) * 4;
      pixels[offset] = Math.round(flatten ? flatten[0] : hit[0]);
      pixels[offset + 1] = Math.round(flatten ? flatten[1] : hit[1]);
      pixels[offset + 2] = Math.round(flatten ? flatten[2] : hit[2]);
      pixels[offset + 3] = Math.round(hit[3] * 255);
    }
  }
  return encodePng(size, size, pixels, true);
};

const solid = (size, colour) => {
  const pixels = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i += 1) {
    pixels[i * 3] = colour[0];
    pixels[i * 3 + 1] = colour[1];
    pixels[i * 3 + 2] = colour[2];
  }
  return encodePng(size, size, pixels, false);
};

const write = (name, buffer) => {
  writeFileSync(join(ASSETS, name), buffer);
  console.log(`  ${name.padEnd(30)} ${(buffer.length / 1024).toFixed(1)} KB`);
};

console.log('Generating Cashflow brand assets…');
// Square and full-bleed: iOS masks the corners itself.
write('icon.png', renderOpaque(1024, INK));
// The coin drawn edge-to-edge, for the in-app <LogoMark />. Its circle is the
// image's bounding circle, so the component can clip the gleam with a plain
// borderRadius instead of pulling in an SVG renderer.
write('logo-coin.png', renderTransparent(512, 64 / 48));
// Splash marks are transparent so the plugin's backgroundColor shows through.
// The coin carries its own colour, so light and dark get the same file — the
// gold reads on both #101014 and #FAF7EF.
write('splash-icon.png', renderTransparent(1024));
write('splash-icon-light.png', renderTransparent(1024));
// 0.72 keeps the mark inside the adaptive-icon safe zone.
write('android-icon-foreground.png', renderTransparent(1024, 0.72));
write('android-icon-background.png', solid(1024, INK));
write('android-icon-monochrome.png', renderTransparent(1024, 0.72, WHITE));
write('favicon.png', renderOpaque(64, INK));
console.log('Done.');
