#!/usr/bin/env node
/* ============================================================
 *  HIMARK · IMAGE OPTIMIZER
 * ============================================================
 *
 *  Converts every .jpg / .jpeg / .png in /images to .webp
 *  (and optional responsive variants for hero-class images),
 *  using `npx sharp-cli` so no dependency install is required.
 *
 *  USAGE
 *  ──────────────────────────────────────────────────────────
 *      node scripts/optimize-images.js              # all images
 *      node scripts/optimize-images.js --dry-run    # report only, no writes
 *      node scripts/optimize-images.js --only hero  # only files matching "hero"
 *      node scripts/optimize-images.js --quality 78 # custom WebP quality
 *      node scripts/optimize-images.js --force      # re-run even if .webp exists
 *
 *  OUTPUT
 *  ──────────────────────────────────────────────────────────
 *      For a source file:  images/about-hero.jpg
 *      Generates:          images/about-hero.webp           (full-size)
 *                          images/about-hero@1600.webp      (responsive — hero only)
 *                          images/about-hero@1200.webp      (responsive — hero only)
 *                          images/about-hero@800.webp       (responsive — hero only)
 *
 *  Once optimized, point images.config.js at the .webp variant
 *  (or use the <picture> snippet documented in docs/IMAGES.md).
 *
 * ============================================================ */

'use strict';

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT       = path.resolve(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'images');
const HERO_RX    = /(hero|backdrop|cover)/i;  // files matching this get responsive variants
const HERO_SIZES = [1600, 1200, 800];
const SOURCE_RX  = /\.(jpe?g|png)$/i;

/* ----- args ----- */
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valueOf = (name) => {
  const i = args.indexOf(name);
  return (i !== -1 && args[i + 1]) ? args[i + 1] : null;
};

const DRY      = flag('--dry-run') || flag('-n');
const FORCE    = flag('--force')   || flag('-f');
const ONLY     = valueOf('--only');
const QUALITY  = parseInt(valueOf('--quality') || '82', 10);

if (!fs.existsSync(IMAGES_DIR)) {
  console.error('No /images directory found at', IMAGES_DIR);
  process.exit(1);
}

/* ----- pick targets ----- */
const all = fs.readdirSync(IMAGES_DIR)
  .filter(f => SOURCE_RX.test(f))
  .filter(f => !ONLY || f.toLowerCase().includes(ONLY.toLowerCase()));

if (!all.length) {
  console.log('No matching source files. Run without --only to see all candidates.');
  process.exit(0);
}

/* ----- npx sharp-cli probe ----- */
function probeSharpCli() {
  if (DRY) return true;
  const probe = spawnSync('npx', ['--yes', 'sharp-cli', '--version'], {
    stdio: 'pipe', shell: true, encoding: 'utf8'
  });
  if (probe.status !== 0) {
    console.error('Could not run `npx sharp-cli`. Check your Node + npm install.');
    console.error(probe.stderr || probe.stdout);
    return false;
  }
  return true;
}
if (!probeSharpCli()) process.exit(1);

/* ----- helpers ----- */
function bytes(n){ return (n / 1024).toFixed(0) + ' KB'; }
function exists(p){ try{ return fs.statSync(p).size; }catch{ return 0; } }

function runSharp(input, output, width){
  if (DRY) return { ok:true, dry:true };
  const cmdArgs = [
    '--yes', 'sharp-cli',
    '--input',  input,
    '--output', path.dirname(output),
    '--format', 'webp',
    '--quality', String(QUALITY)
  ];
  if (width) cmdArgs.push('resize', '--width', String(width));
  const r = spawnSync('npx', cmdArgs, { stdio: 'pipe', shell: true, encoding: 'utf8' });
  if (r.status !== 0) {
    return { ok:false, stderr: r.stderr || r.stdout };
  }
  /* sharp-cli writes <basename>.webp into the output dir; rename if a width
     was requested so the variant doesn't overwrite the full-size .webp. */
  const baseName = path.basename(input).replace(/\.(jpe?g|png)$/i, '.webp');
  const written  = path.join(path.dirname(output), baseName);
  if (written !== output && fs.existsSync(written)) {
    fs.renameSync(written, output);
  }
  return { ok:true };
}

/* ----- main loop ----- */
const results = [];
let srcBytes = 0, outBytes = 0;

for (const file of all) {
  const input    = path.join(IMAGES_DIR, file);
  const baseName = file.replace(/\.(jpe?g|png)$/i, '');
  const isHero   = HERO_RX.test(file);
  const srcSize  = exists(input);
  srcBytes += srcSize;

  /* Full-size .webp */
  const fullOut = path.join(IMAGES_DIR, baseName + '.webp');
  if (!FORCE && exists(fullOut)) {
    console.log(`  skip   ${file} (already has .webp; --force to override)`);
  } else {
    const r = runSharp(input, fullOut);
    if (!r.ok) {
      console.warn(`  FAIL   ${file}: ${r.stderr || 'unknown'}`);
      continue;
    }
    if (DRY) {
      console.log(`  plan   ${file.padEnd(36)}  ${bytes(srcSize).padStart(8)} → would write ${baseName}.webp${isHero ? '  (+ @1600/@1200/@800 variants)' : ''}`);
    } else {
      const outSize = exists(fullOut);
      outBytes += outSize;
      const ratio  = srcSize ? Math.round((1 - outSize/srcSize) * 100) : 0;
      results.push({ file, size:srcSize, webp:outSize, ratio });
      console.log(`  webp   ${file.padEnd(36)}  ${bytes(srcSize).padStart(8)} → ${bytes(outSize).padStart(8)}  (${ratio}% smaller)`);
    }
  }

  /* Responsive variants for hero-class files */
  if (isHero && !DRY) {
    for (const w of HERO_SIZES) {
      const variantOut = path.join(IMAGES_DIR, `${baseName}@${w}.webp`);
      if (!FORCE && exists(variantOut)) continue;
      const r = runSharp(input, variantOut, w);
      if (!r.ok) {
        console.warn(`  FAIL   ${file}@${w}: ${r.stderr || 'unknown'}`);
        continue;
      }
      const vSize = exists(variantOut);
      console.log(`         · @${w}w → ${bytes(vSize)}`);
    }
  }
}

/* ----- summary ----- */
console.log('\n' + '─'.repeat(64));
console.log(DRY ? 'DRY RUN — no files written.' : `Optimized ${results.length} image(s).`);
if (!DRY && results.length) {
  const totalRatio = srcBytes ? Math.round((1 - outBytes/srcBytes) * 100) : 0;
  console.log(`Total: ${bytes(srcBytes)} → ${bytes(outBytes)}  (${totalRatio}% smaller).`);
  console.log('\nNext steps:');
  console.log('  1. Point images.config.js keys at the new .webp paths.');
  console.log('  2. For responsive heroes, use the <picture> pattern in docs/IMAGES.md.');
  console.log('  3. Keep originals — they remain the fallback.');
}
