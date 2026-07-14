/**
 * Regenerate app icon variants from the master clover asset.
 * Master: assets/images/LottoAI-clover-white-1024.png (white clover, transparent bg)
 *
 * Usage: node scripts/generate-icons.mjs
 */
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(__dirname, '../assets/images');
const CLOVER = path.join(ASSETS, 'LottoAI-clover-white-1024.png');

const BRAND_GREEN = { r: 28, g: 158, b: 115, alpha: 1 };
const APP_BG_LIGHT = { r: 244, g: 245, b: 247, alpha: 1 };
const APP_BG_DARK = { r: 14, g: 18, b: 18, alpha: 1 };
const CLOVER_EMERALD = path.join(ASSETS, 'LottoAI-clover-emerald-1024.png');

// Sizes are expressed as the fraction of the icon side that the *visible*
// clover artwork (ink) spans — the master PNG's transparent padding is
// trimmed away first, so these numbers map directly to what you see.
//
// iOS / square tiles keep a fuller glyph (~78% of the tile).
// Android launcher icons use a slightly smaller clover for breathing room:
// launchers mask the 108dp canvas to a 72dp circle (66.7%), so
// ANDROID_INK * (108/72) ≈ visible fill of the circle (~72% at 0.48).
const ANDROID_INK = 0.48;
const ANDROID_CIRCLE_FILL = ANDROID_INK / (72 / 108); // ~0.72
const SQUARE_ICON_INK = 0.78; // iOS/App Store tiles
const MASKABLE_INK = 0.78; // PWA maskable safe zone is an 80% circle
const SPLASH_INK = 0.574; // unchanged from the previous look

const trimmedCache = new Map();
async function trimmedClover(source = CLOVER) {
  if (!trimmedCache.has(source)) {
    trimmedCache.set(source, await sharp(source).trim().png().toBuffer());
  }
  return trimmedCache.get(source);
}

async function centeredClover(size, source = CLOVER, ink = SQUARE_ICON_INK) {
  const inkSize = Math.round(size * ink);
  const layer = await sharp(await trimmedClover(source))
    .resize(inkSize, inkSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const offset = Math.round((size - inkSize) / 2);
  return { layer, offset };
}

async function iconWithBg(size, bg, cloverSource = CLOVER, ink = SQUARE_ICON_INK) {
  const { layer, offset } = await centeredClover(size, cloverSource, ink);
  return sharp({
    create: { width: size, height: size, channels: 4, background: bg },
  })
    .composite([{ input: layer, left: offset, top: offset }])
    .png()
    .toBuffer();
}

async function transparentForeground(size, ink = ANDROID_INK) {
  const { layer, offset } = await centeredClover(size, CLOVER, ink);
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: layer, left: offset, top: offset }])
    .png()
    .toBuffer();
}

async function writeBuffer(buf, filename) {
  const out = path.join(ASSETS, filename);
  await sharp(buf).toFile(out);
  console.log('  wrote', filename);
}

async function resizeFrom(sourceBuffer, size, filename) {
  await sharp(sourceBuffer).resize(size, size).png().toFile(path.join(ASSETS, filename));
  console.log('  wrote', filename);
}

async function main() {
  console.log('Generating icons from', path.basename(CLOVER));

  const appStore = await iconWithBg(1024, BRAND_GREEN);
  await writeBuffer(appStore, 'LottoAI-AppStore-1024.png');

  await writeBuffer(
    await iconWithBg(1024, APP_BG_LIGHT, CLOVER_EMERALD, SPLASH_INK),
    'splash-icon-light.png'
  );
  await writeBuffer(await iconWithBg(1024, APP_BG_DARK, CLOVER, SPLASH_INK), 'splash-icon-dark.png');
  // App splash (expo-splash-screen) — koyu zemin + beyaz yonca; solid dosya da aynı içeriği taşısın.
  await writeBuffer(await iconWithBg(1024, APP_BG_DARK, CLOVER, SPLASH_INK), 'splash-solid-0E1212.png');

  await writeBuffer(await transparentForeground(1024), 'android-icon-foreground.png');
  await writeBuffer(await transparentForeground(1024), 'android-icon-monochrome.png');

  const maskable = await iconWithBg(1024, BRAND_GREEN, CLOVER, MASKABLE_INK);
  await resizeFrom(maskable, 512, 'LottoAI-maskable-512.png');

  // Play Store matches Android launcher circle fill, not the fuller iOS tile.
  await writeBuffer(
    await iconWithBg(512, BRAND_GREEN, CLOVER, ANDROID_CIRCLE_FILL),
    'LottoAI-PlayStore-512.png'
  );

  const sizes = [
    [180, 'LottoAI-iOS-180.png'],
    [167, 'LottoAI-iOS-167.png'],
    [152, 'LottoAI-iOS-152.png'],
    [120, 'LottoAI-iOS-120.png'],
    [512, 'LottoAI-favicon-512.png'],
    [192, 'LottoAI-favicon-192.png'],
    [48, 'LottoAI-favicon-48.png'],
    [32, 'LottoAI-favicon-32.png'],
    [16, 'LottoAI-favicon-16.png'],
    [512, 'favicon.png'],
  ];

  for (const [size, name] of sizes) {
    await resizeFrom(appStore, size, name);
  }

  await writeBuffer(await transparentForeground(96), 'android-notification-icon.png');

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
