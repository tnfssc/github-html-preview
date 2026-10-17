// Captures raw store screenshots from live public GitHub pages with the built
// extension loaded. Fresh, unauthenticated, throwaway profile per run.
//
//   corepack pnpm build && node store/capture.mjs [shot ...]
//
// Writes store/raw/<shot>.png at deviceScaleFactor 2.
import { chromium } from '@playwright/test';
import path from 'node:path';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';

const root = path.resolve(import.meta.dirname, '..');
const ext = path.join(root, '.output/chrome-mv3');
const rawDir = path.join(root, 'store/raw');
const tmpDir = path.join(root, '.tmp/screenshots');
mkdirSync(rawDir, { recursive: true });
mkdirSync(tmpDir, { recursive: true });

const VIEWPORT = { width: 1440, height: 900 };
const LIVE = 45_000;

const BLOB_CARDS =
  'https://github.com/bradtraversy/50projects50days/blob/master/expanding-cards/index.html';
const BLOB_METRIK =
  'https://github.com/Crepify/metrik/blob/ee22dcaa0716d2ebea3915a8d4083bce25ee53fc/index.html';
const BLOB_FINALE =
  'https://github.com/nrubin29/finale-landing/blob/61a6a930c6c29dddf3ec8cc09b12bc296cebb456/index.html';
const PR_URL = 'https://github.com/bwghughes/cognitivelayer/pull/2/files';

async function launch(colorScheme) {
  const profile = mkdtempSync(path.join(tmpDir, 'profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    colorScheme,
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    args: [
      '--headless=new',
      `--disable-extensions-except=${ext}`,
      `--load-extension=${ext}`,
    ],
  });
  const close = async () => {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  };
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page, close };
}

// Strip GitHub signed-out marketing chrome and cookie banners.
const CLEANUP_CSS = `
  .js-cookie-consent-banner, cookie-consent-banner, [data-testid="cookie-banner"],
  .flash-full, .js-notice, .Popover, tool-tip { display: none !important; }
`;

async function settle(page, ms = 4000) {
  await page.addStyleTag({ content: CLEANUP_CSS }).catch(() => {});
  await page.mouse.move(0, VIEWPORT.height - 1);
  await page.waitForTimeout(ms);
}

async function collapseFileTree(page) {
  const btn = page
    .locator(
      'button[aria-label="Collapse file tree"], button[aria-label*="Collapse file tree"], button[data-testid="collapse-file-tree-button"]',
    )
    .first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(600);
  }
}

async function openBlobPreview(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: LIVE });
  const tab = page.getByRole('tab', { name: 'Preview' });
  await tab.waitFor({ timeout: LIVE });
  await collapseFileTree(page);
  await tab.click();
  const iframe = page.locator(
    '.gh-html-preview-container iframe[title="Executable HTML preview"]',
  );
  await iframe.waitFor({ timeout: LIVE });
  await page
    .locator('.gh-html-preview-container a', { hasText: 'Open full preview' })
    .and(page.locator(':not([aria-disabled="true"])'))
    .waitFor({ timeout: LIVE })
    .catch(() => {});
  await settle(page, 6000);
}

// Record CSS-pixel boxes of key UI so templates can place callouts.
async function saveBoxes(page, name, locators) {
  const out = { viewport: VIEWPORT };
  for (const [key, locator] of Object.entries(locators)) {
    out[key] = await locator.first().boundingBox().catch(() => null);
  }
  writeFileSync(`${rawDir}/${name}.json`, JSON.stringify(out, null, 2) + '\n');
}

const blobTabs = (page) => ({
  previewTab: page.getByRole('tab', { name: 'Preview' }),
  codeTab: page.getByRole('button', { name: 'Code', exact: true }),
  tabBar: page.locator('ul[class*="SegmentedControl"][aria-label="File view"]'),
});

const shots = {
  // Blob page, Preview tab, light GitHub.
  async 'blob-preview-light'() {
    const { page, close } = await launch('light');
    try {
      await openBlobPreview(page, BLOB_CARDS);
      await page.screenshot({ path: `${rawDir}/blob-preview-light.png` });
      await saveBoxes(page, 'blob-preview-light', blobTabs(page));
      // Same route, Code tab, for the Code <-> Preview pair.
      await page.getByRole('button', { name: 'Code', exact: true }).first().click();
      await settle(page, 1500);
      await page.screenshot({ path: `${rawDir}/blob-code-light.png` });
      await saveBoxes(page, 'blob-code-light', blobTabs(page));
    } finally {
      await close();
    }
  },

  // Blob page, Preview tab, dark GitHub.
  async 'blob-preview-dark'() {
    const { page, close } = await launch('dark');
    try {
      await openBlobPreview(page, BLOB_METRIK);
      await page.screenshot({ path: `${rawDir}/blob-preview-dark.png` });
      await saveBoxes(page, 'blob-preview-dark', blobTabs(page));
    } finally {
      await close();
    }
  },

  // PR Files changed, before/after side by side.
  async 'pr-split-light'() {
    const { page, close } = await launch('light');
    try {
      await page.goto(process.env.PR_URL ?? PR_URL, { waitUntil: 'domcontentloaded', timeout: LIVE });
      await page
        .getByRole('tab', { name: 'Display before and after previews' })
        .first()
        .waitFor({ timeout: LIVE });
      await collapseFileTree(page);
      const frames = page.locator('iframe[title$="HTML preview for index.html"]');
      await frames.nth(1).waitFor({ timeout: LIVE });
      await settle(page, 7000);
      const card = page.locator('[data-path="index.html"]').first();
      const box = await card.boundingBox();
      if (box) {
        // Park the file card just below GitHub's sticky PR header.
        await page.evaluate((y) => window.scrollBy(0, y - 64), box.y);
        await settle(page, 2000);
      }
      await page.screenshot({ path: `${rawDir}/pr-split-light.png` });
      await saveBoxes(page, 'pr-split-light', {
        previewTab: page.getByRole('tab', { name: 'Display before and after previews' }),
        codeTab: page.getByRole('tab', { name: 'Display code diff' }),
        before: page.locator('iframe[title^="Before HTML preview"]'),
        after: page.locator('iframe[title^="After HTML preview"]'),
      });
    } finally {
      await close();
    }
  },

  // Dedicated full-tab preview opened from "Open full preview".
  async 'full-preview'() {
    const { context, page, close } = await launch('dark');
    try {
      await openBlobPreview(page, BLOB_FINALE);
      const link = page.locator('.gh-html-preview-container a', {
        hasText: 'Open full preview',
      });
      await page.waitForFunction(
        () =>
          document
            .querySelector('.gh-html-preview-container a')
            ?.getAttribute('aria-disabled') !== 'true',
        null,
        { timeout: LIVE },
      );
      // Same URL the link opens in a new tab; the source tab stays open so
      // the session snapshot remains valid.
      const href = await link.getAttribute('href');
      let [sw] = context.serviceWorkers();
      sw ??= await context.waitForEvent('serviceworker');
      const id = new URL(sw.url()).host;
      const full = await context.newPage();
      await full.goto(href.replace(/^chrome-extension:\/\/[^/]+/, `chrome-extension://${id}`), {
        waitUntil: 'domcontentloaded',
      });
      await full.waitForTimeout(7000);
      await full.screenshot({ path: `${rawDir}/full-preview.png` });
      console.log('full preview url', full.url().replace(/#.*/, ''));
    } finally {
      await close();
    }
  },

  // Toolbar popup rendered as a page.
  async popup() {
    for (const scheme of ['light', 'dark']) {
      const { context, page, close } = await launch(scheme);
      try {
        let [sw] = context.serviceWorkers();
        sw ??= await context.waitForEvent('serviceworker');
        const id = new URL(sw.url()).host;
        await page.setViewportSize({ width: 340, height: 640 });
        await page.goto(`chrome-extension://${id}/popup.html`);
        await page.waitForTimeout(1200);
        await page.locator('.popup').screenshot({
          path: `${rawDir}/popup-${scheme}.png`,
        });
      } finally {
        await close();
      }
    }
  },
};

const wanted = process.argv.slice(2);
for (const name of wanted.length ? wanted : Object.keys(shots)) {
  const t = Date.now();
  try {
    await shots[name]();
    console.log(`ok   ${name} ${Date.now() - t}ms`);
  } catch (error) {
    console.error(`FAIL ${name}: ${error.message.split('\n')[0]}`);
    process.exitCode = 1;
  }
}
