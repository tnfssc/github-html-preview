// Renders store/templates/*.html to store/screenshots/*.png from captures in
// store/raw/. Run `node store/capture.mjs` first to refresh raw captures.
//
//   node store/render.mjs [template-name ...]
import { chromium } from '@playwright/test';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const storeDir = import.meta.dirname;
const templatesDir = path.join(storeDir, 'templates');
const rawDir = path.join(storeDir, 'raw');
const outDir = path.join(storeDir, 'screenshots');
mkdirSync(outDir, { recursive: true });

const meta = Object.fromEntries(
  readdirSync(rawDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(path.join(rawDir, f), 'utf8'))]),
);

const wanted = process.argv.slice(2);
const templates = readdirSync(templatesDir)
  .filter((f) => f.endsWith('.html'))
  .filter((f) => !wanted.length || wanted.some((w) => f.startsWith(w)));

const browser = await chromium.launch();
try {
  for (const file of templates) {
    const html = readFileSync(path.join(templatesDir, file), 'utf8');
    const [, w, h] = html.match(/<meta name="size" content="(\d+)x(\d+)">/) ?? [];
    if (!w) throw new Error(`${file}: missing <meta name="size">`);
    const page = await browser.newPage({
      viewport: { width: Number(w), height: Number(h) },
      deviceScaleFactor: 1,
    });
    page.on('pageerror', (e) => console.error(`${file}: ${e.message}`));
    await page.addInitScript((m) => { window.STORE_META = m; }, meta);
    await page.goto(pathToFileURL(path.join(templatesDir, file)).href);
    await page.waitForFunction(() => window.STORE_READY);
    await page.evaluate(() => window.STORE_READY);
    const out = path.join(outDir, file.replace(/\.html$/, '.png'));
    await page.screenshot({ path: out, omitBackground: false });
    await page.close();
    // Store wants 24-bit PNG without alpha.
    try {
      execFileSync('magick', [out, '-background', '#15122a', '-alpha', 'remove', '-alpha', 'off', `PNG24:${out}`]);
    } catch {
      console.warn('ImageMagick not found; PNG may keep an alpha channel.');
    }
    console.log(`${path.relative(process.cwd(), out)} ${w}x${h}`);
  }
} finally {
  await browser.close();
}
