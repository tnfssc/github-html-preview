import { test, expect, type BrowserContext, type FrameLocator } from '@playwright/test';
import { launchWithExtension } from './extensionHarness';
const commit = '0123456789abcdef0123456789abcdef01234567';
const blobUrl =
  'https://github.com/acme/reports/blob/main/reports/weekly/index.html';
const rawBase = `https://raw.githubusercontent.com/acme/reports/${commit}`;
const cdnBase = `https://cdn.jsdelivr.net/gh/acme/reports@${commit}`;
const privateBlobUrl =
  'https://github.com/private-owner/private-repo/blob/main/report/index.html';

const previewHtml = `<!doctype html><html><head>
  <link rel="stylesheet" href="/assets/site.css">
</head><body onload="window.inlineRan = true">
  <h2 id="script-result" class="report">Waiting for script</h2>
  <output id="external-result">Waiting for external script</output>
  <img id="chart" src="./chart.png" alt="Chart">
  <iframe src="https://tracker.example/frame"></iframe>
  <script src="./app.js"></script>
  <script src="https://external.example/analytics.js"></script>
</body></html>`;

const privatePreviewHtml = `<!doctype html><html><head>
  <link rel="stylesheet" href="/assets/private.css">
</head><body>
  <h2 id="private-title">Private report</h2>
  <a id="fragment-link" href="#private-title">Jump to private title</a>
  <img id="private-image" src="./secret.png" alt="Secret chart">
  <p id="classic-result">Classic waiting</p>
  <p id="module-result">Module waiting</p>
  <script src="./classic.js"></script>
  <script type="module" src="./main.js"></script>
</body></html>`;

async function routeProductFixtures(
  context: BrowserContext,
  html = previewHtml,
): Promise<string[]> {
  const requested: string[] = [];
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    requested.push(url);

    if (url === blobUrl) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: githubBlobFixture(html, commit, 'reports/weekly/index.html'),
      });
      return;
    }
    if (url === `${rawBase}/assets/site.css`) {
      await route.fulfill({
        status: 200,
        contentType: 'text/css',
        body: '.report { color: rgb(1, 2, 3) }',
      });
      return;
    }
    if (url === `${rawBase}/reports/weekly/chart.png`) {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from('chart'),
      });
      return;
    }
    if (url === `${rawBase}/reports/weekly/index.html`) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: html });
      return;
    }
    if (url === `${rawBase}/reports/weekly/slow.png`) {
      await delay(400);
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from('slow'),
      });
      return;
    }
    if (url === `${rawBase}/reports/weekly/app.js`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `document.querySelector('#script-result').textContent = 'Script executed';`,
      });
      return;
    }
    if (url === `${cdnBase}/reports/weekly/app.js`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        headers: { 'access-control-allow-origin': '*' },
        body: `document.querySelector('#script-result').textContent = 'Script executed';`,
      });
      return;
    }
    if (url === `${cdnBase}/assets/site.css`) {
      await route.fulfill({
        status: 200,
        contentType: 'text/css',
        headers: { 'access-control-allow-origin': '*' },
        body: 'body { background: rgb(250, 250, 250) }',
      });
      return;
    }
    if (url === `${cdnBase}/reports/weekly/chart.png`) {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: { 'access-control-allow-origin': '*' },
        body: Buffer.from('chart'),
      });
      return;
    }
    if (url === 'https://external.example/analytics.js') {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `document.querySelector('#external-result').textContent = 'External script executed';`,
      });
      return;
    }
    if (url.startsWith('https://tracker.example/')) {
      await route.abort('blockedbyclient');
      return;
    }
    if (url.startsWith('chrome-extension://')) await route.continue();
    else await route.abort('blockedbyclient');
  });
  return requested;
}

test('blob preview embeds local CSS and executable script sources in a sandbox', async () => {
  const { context, page } = await launchWithExtension();
  try {
    await routeProductFixtures(context);
    await page.goto(blobUrl, { waitUntil: 'domcontentloaded' });

    const previewButton = page.getByRole('tab', { name: 'Preview' });
    await expect(previewButton).toBeVisible();
    const blameButton = page.getByRole('button', { name: 'Blame' });
    const previewBox = await previewButton.boundingBox();
    const blameBox = await blameButton.boundingBox();
    expect(Math.abs((previewBox?.y ?? 0) - (blameBox?.y ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((previewBox?.height ?? 0) - (blameBox?.height ?? 0))).toBeLessThanOrEqual(1);
    await previewButton.click();

    const container = page.locator('.gh-html-preview-container');
    await expect(container.getByRole('status')).toBeHidden();
    const iframe = container.locator('iframe[title="Executable HTML preview"]');
    await expect(iframe).toBeVisible();
    await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts');
    expect((await container.boundingBox())?.height).toBeGreaterThanOrEqual(600);
    expect((await iframe.boundingBox())?.height).toBeGreaterThanOrEqual(500);
    const frame = iframe.contentFrame();
    await expect
      .poll(() =>
        frame
          .locator('body')
          .evaluate(
            () =>
              (globalThis as typeof globalThis & { inlineRan?: boolean })
                .inlineRan,
          ),
      )
      .toBe(true);
    await expect(frame.locator('script[src]')).toHaveCount(2);
    await expect(frame.locator('script[src]').first()).toHaveAttribute(
      'src',
      /^data:application\/javascript;base64,/,
    );
    await expect(frame.locator('#script-result')).toHaveText('Script executed');
    await expect(frame.locator('script[src]').last()).toHaveAttribute(
      'src',
      'https://external.example/analytics.js',
    );
    await expect(frame.locator('#chart')).toHaveAttribute(
      'src',
      /^data:image\/png;base64,/,
    );
    await expect(
      frame.locator('meta[http-equiv="Content-Security-Policy" i]'),
    ).toHaveCount(0);
    await expect(frame.locator('link[rel~="stylesheet"]')).toHaveAttribute(
      'href',
      /^data:text\/css;base64,/,
    );
    await expect(frame.locator('#script-result')).toHaveCSS(
      'color',
      'rgb(1, 2, 3)',
    );
    await page.getByRole('button', { name: 'Code' }).click();
    await expect(container).toBeHidden();
    await expect(page.locator('.react-code-lines')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('previews default to dark media queries and a matching canvas independently of host themes', async () => {
  // Use native iframe color-scheme inheritance; Playwright's default light
  // emulation would hide the regression by forcing every frame to light.
  const { context, page } = await launchWithExtension({ colorScheme: null });
  try {
    await routeProductFixtures(context, `<!doctype html><html><head><style>
      @media (prefers-color-scheme: dark) { body { color: white; } }
      .authored-dark { background: #111; color: #eee; }
      .authored-light { background: white; color: black; }
    </style></head><body>
      <p id="theme-text">Readable preview text</p>
      <p class="authored-dark">Author-defined dark styling</p>
      <p class="authored-light">Author-defined light styling</p>
    </body></html>`);
    await page.goto(blobUrl, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      document.documentElement.style.colorScheme = 'light';
      document.documentElement.style.setProperty('--bgColor-default', '#fff');
    });
    await page.getByRole('tab', { name: 'Preview' }).click();

    const inline = page
      .locator('iframe[title="Executable HTML preview"]')
      .contentFrame();
    await expect(inline.locator('#theme-text')).toHaveCSS('color', 'rgb(255, 255, 255)');
    expect(await inline.locator('body').evaluate(() =>
      matchMedia('(prefers-color-scheme: dark)').matches,
    )).toBe(true);
    await expectDarkCanvas(inline);
    await expect(inline.locator('.authored-dark')).toHaveCSS('color', 'rgb(238, 238, 238)');
    await expect(inline.locator('.authored-dark')).toHaveCSS('background-color', 'rgb(17, 17, 17)');
    await expect(inline.locator('.authored-light')).toHaveCSS('color', 'rgb(0, 0, 0)');
    await expect(inline.locator('.authored-light')).toHaveCSS('background-color', 'rgb(255, 255, 255)');

    const fullLink = page.getByRole('link', { name: 'Open full preview' });
    await expect(fullLink).toHaveAttribute('href', /preview\.html\?snapshot=/);
    const popupPromise = context.waitForEvent('page');
    await fullLink.click();
    const fullPage = await popupPromise;
    const full = fullPage
      .locator('iframe[title="Executable HTML preview"]')
      .contentFrame();
    await expect(full.locator('#theme-text')).toBeVisible();
    await fullPage.evaluate(() => {
      document.documentElement.style.colorScheme = 'light';
    });
    await expect(full.locator('#theme-text')).toHaveCSS('color', 'rgb(255, 255, 255)');
    expect(await full.locator('body').evaluate(() =>
      matchMedia('(prefers-color-scheme: dark)').matches,
    )).toBe(true);
    await expectDarkCanvas(full);
    await expect(full.locator('.authored-dark')).toHaveCSS('color', 'rgb(238, 238, 238)');
    await expect(full.locator('.authored-dark')).toHaveCSS('background-color', 'rgb(17, 17, 17)');
    await expect(full.locator('.authored-light')).toHaveCSS('color', 'rgb(0, 0, 0)');
    await expect(full.locator('.authored-light')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  } finally {
    await context.close();
  }
});

async function expectDarkCanvas(frame: FrameLocator): Promise<void> {
  const canvas = await frame.locator('body').evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'Canvas';
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color.match(/\d+/g)?.map(Number) ?? [];
  });
  expect(canvas).toHaveLength(3);
  expect(Math.max(...canvas)).toBeLessThan(128);
}

for (const [kind, declaration] of [
  ['metadata', '<meta name="color-scheme" content="light">'],
  ['CSS', '<style>:root { color-scheme: light; }</style>'],
]) {
  test(`previews respect an authored light color scheme from ${kind}`, async () => {
    const { context, page } = await launchWithExtension({ colorScheme: null });
    try {
      await routeProductFixtures(context, `<!doctype html><html><head>${declaration}</head><body>
        <p id="theme-text">Author-selected light canvas</p>
      </body></html>`);
      await page.goto(blobUrl, { waitUntil: 'domcontentloaded' });
      await page.getByRole('tab', { name: 'Preview' }).click();
      const frame = page.locator('iframe[title="Executable HTML preview"]').contentFrame();
      await expect(frame.locator('#theme-text')).toHaveCSS('color', 'rgb(0, 0, 0)');
      const canvas = await frame.locator('body').evaluate(() => {
        const probe = document.createElement('span');
        probe.style.color = 'Canvas';
        document.body.appendChild(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      });
      expect(canvas).toBe('rgb(255, 255, 255)');
    } finally {
      await context.close();
    }
  });
}

test('blob resources recover after three automatic retries', async () => {
  const { context, page } = await launchWithExtension();
  const url = 'https://github.com/acme/reports/blob/main/retry.html';
  const raw =
    `https://raw.githubusercontent.com/acme/reports/${commit}/retry.png`;
  let attempts = 0;
  try {
    await context.route(url, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: githubBlobFixture(
          '<h1>Retry fixture</h1><img id="retry-image" src="./retry.png">',
          commit,
          'retry.html',
        ),
      });
    });
    await context.route(raw, async (route) => {
      attempts += 1;
      await route.fulfill(
        attempts <= 3
          ? { status: 503, body: 'Unavailable' }
          : {
              status: 200,
              contentType: 'image/png',
              body: 'retry-image',
            },
      );
    });
    await page.goto(url);
    await page.getByRole('tab', { name: 'Preview' }).click();
    const container = page.locator('.gh-html-preview-container');
    await expect(container.getByRole('status')).toBeHidden();
    await expect(
      container
        .locator('iframe[title="Executable HTML preview"]')
        .contentFrame()
        .locator('#retry-image'),
    ).toHaveAttribute('src', /^data:image\/png;base64,/);
    expect(attempts).toBe(4);
    await expect(container.getByRole('button', { name: 'Retry' })).toHaveCount(
      0,
    );
  } finally {
    await context.close();
  }
});

test('full preview executes public repository scripts only inside sandbox', async () => {
  const { context, page, extensionId } = await launchWithExtension();
  try {
    const requested = await routeProductFixtures(context);
    await page.goto(blobUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Preview' }).click();

    const popupPromise = context.waitForEvent('page');
    await page.getByRole('link', { name: 'Open full preview' }).click();
    const fullPage = await popupPromise;
    const browserErrors: string[] = [];
    fullPage.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text());
    });
    fullPage.on('pageerror', (error) => browserErrors.push(error.message));
    await expect(fullPage).toHaveURL(
      new RegExp(`^chrome-extension://${extensionId}/preview\\.html\\?`),
    );
    await expect(fullPage.getByRole('status')).toHaveCount(0);

    const sandboxElement = await fullPage
      .locator('iframe[title="Executable HTML preview"]')
      .elementHandle();
    await expect(
      fullPage.locator('iframe[title="Executable HTML preview"]'),
    ).toHaveAttribute(
      'sandbox',
      'allow-scripts allow-forms allow-modals allow-popups allow-downloads',
    );
    const sandbox = await sandboxElement?.contentFrame();
    expect(sandbox).not.toBeNull();
    await expect
      .poll(() => requested.includes(`${rawBase}/reports/weekly/app.js`))
      .toBe(true);
    await expect
      .poll(() => requested.includes('https://external.example/analytics.js'))
      .toBe(true);
    await expect.poll(() => browserErrors).toEqual([]);
    await expect(sandbox!.locator('#script-result')).toHaveText('Script executed');
    await expect(sandbox!.locator('#external-result')).toHaveText(
      'External script executed',
    );
    await expect(sandbox!.locator('#script-result')).toHaveCSS(
      'color',
      'rgb(1, 2, 3)',
    );
    expect(
      await sandbox!.evaluate(
        () =>
          typeof (
            globalThis as typeof globalThis & {
              chrome?: { runtime?: unknown };
            }
          ).chrome?.runtime,
      ),
    ).toBe('undefined');
    expect(
      await sandbox!.evaluate(() => {
        try {
          void parent.document.body;
          return 'accessible';
        } catch {
          return 'blocked';
        }
      }),
    ).toBe('blocked');
  } finally {
    await context.close();
  }
});

test('partial blob preview exposes actionable resource diagnostics', async () => {
  const { context, page } = await launchWithExtension();
  try {
    await routeProductFixtures(
      context,
      '<!doctype html><html><head><link rel="stylesheet" href="./missing.css"></head><body><h1 id="partial-content">Usable content</h1></body></html>',
    );
    await page.goto(blobUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Preview' }).click();

    const container = page.locator('.gh-html-preview-container');
    await expect(container.getByRole('status')).toContainText(
      'resource issues',
    );
    await expect(
      container.getByText('View resource issues'),
    ).toBeVisible();
    await container.getByText('View resource issues').click();
    await expect(container).toContainText('missing.css');
    await expect(
      container.getByRole('button', { name: 'Copy diagnostics' }),
    ).toBeVisible();
    await expect(
      container
        .locator('iframe[title="Executable HTML preview"]')
        .contentFrame()
        .locator('#partial-content'),
    ).toHaveText('Usable content');
  } finally {
    await context.close();
  }
});

test('fork PR previews the exact head repository and commit', async () => {
  const { context, page } = await launchWithExtension();
  try {
    const prUrl = 'https://github.com/acme/reports/pull/42/changes';
    const forkSha = 'abcdefabcdefabcdefabcdefabcdefabcdefabcd';
    let apiRequests = 0;
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (url === prUrl) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: githubPrFixture(
            'examples/demo.html',
            `/contributor/reports-fork/blob/${forkSha}/examples/demo.html`,
          ),
        });
        return;
      }
      if (url === 'https://api.github.com/repos/acme/reports/pulls/42') {
        apiRequests += 1;
        await route.fulfill({
          status: 503,
          body: 'API unavailable',
          headers: { 'retry-after': '0' },
        });
        return;
      }
      if (
        url ===
        `https://raw.githubusercontent.com/contributor/reports-fork/${forkSha}/examples/demo.html`
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><html><body><h2 id="rich-pr">Rich PR HTML</h2><script>globalThis.unsafe = true</script></body></html>',
        });
        return;
      }
      if (url.startsWith('chrome-extension://')) await route.continue();
      else await route.abort('blockedbyclient');
    });

    await page.goto(prUrl, { waitUntil: 'domcontentloaded' });
    const htmlDiff = page.locator('.file[data-path="examples/demo.html"]');
    const richButton = htmlDiff.getByRole('tab', {
      name: 'Display before and after previews',
    });
    const sourceButton = htmlDiff.getByRole('tab', {
      name: 'Display code diff',
    });
    await expect(richButton).toHaveClass(/BtnGroup-item/);
    await expect(richButton).toHaveAttribute('aria-selected', 'true');
    const richContainer = htmlDiff.locator('.gh-html-preview-pr-rich');
    await expect(richContainer.getByRole('status')).toBeHidden();
    const richFrame = richContainer
      .locator('iframe[title="After HTML preview for examples/demo.html"]')
      .contentFrame();
    await expect(richFrame.locator('#rich-pr')).toHaveText('Rich PR HTML');
    expect(
      await richFrame
        .locator('body')
        .evaluate(() => Reflect.has(globalThis, 'unsafe')),
    ).toBe(true);
    await expect(htmlDiff.locator('.js-file-content')).toBeHidden();
    await sourceButton.click();
    await expect(htmlDiff.locator('.js-file-content')).toBeVisible();
    await expect(richContainer).toBeHidden();

    await page.evaluate((headSha) => {
      const file = document.createElement('div');
      file.className = 'file';
      file.dataset.path = 'examples/late.htm';
      file.innerHTML =
        `<div class="file-header" data-path="examples/late.htm"><a href="/contributor/reports-fork/blob/${headSha}/examples/late.htm" data-ga-click="View file">View file</a><div class="file-actions"><div class="d-flex"></div></div></div><div class="js-file-content">Late source diff</div>`;
      document.querySelector('#files')?.appendChild(file);
    }, forkSha);
    await expect(
      page
        .locator('.file[data-path="examples/late.htm"]')
        .getByRole('tab', {
          name: 'Display before and after previews',
        }),
    ).toHaveCount(1);
    expect(apiRequests).toBe(4);
  } finally {
    await context.close();
  }
});

test('authenticated changes DOM receives HTML source and rich diff controls', async () => {
  const { context, page } = await launchWithExtension();
  const prUrl = 'https://github.com/acme/reports/pull/43/changes';
  const baseSha = 'abcdeabcdeabcdeabcdeabcdeabcdeabcdeabcde';
  const headSha = '1234512345123451234512345123451234512345';
  const filePath = 'examples/react-diff.html';
  let apiRequests = 0;
  let baseFileRequests = 0;
  let headFileRequests = 0;
  try {
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (url === prUrl) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: githubReactPrFixture(filePath, true),
        });
        return;
      }
      if (url === 'https://api.github.com/repos/acme/reports/pulls/43') {
        apiRequests += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            base: {
              sha: baseSha,
              repo: { full_name: 'acme/reports', private: false },
            },
            head: {
              sha: headSha,
              repo: { full_name: 'contributor/reports-fork', private: false },
            },
          }),
        });
        return;
      }
      if (
        url ===
        `https://raw.githubusercontent.com/acme/reports/${baseSha}/${filePath}`
      ) {
        baseFileRequests += 1;
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><html><body style="margin:0;width:1600px"><h1 id="before-rich">Before version</h1><output id="before-script"></output><script>document.querySelector("#before-script").textContent = "Before script ran"</script><div id="sync-a" style="margin-top:400px"></div><div style="height:1000px"></div><div id="sync-b"></div><div style="height:2000px">Before end</div></body></html>',
        });
        return;
      }
      if (
        url ===
        `https://raw.githubusercontent.com/contributor/reports-fork/${headSha}/${filePath}`
      ) {
        headFileRequests += 1;
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><html><body style="margin:0;width:1600px"><h1 id="react-rich">After version</h1><output id="after-script"></output><script>document.querySelector("#after-script").textContent = "After script ran"</script><div id="sync-a" style="margin-top:800px"></div><div style="height:2400px"></div><div id="sync-b"></div><div style="height:2000px">After end</div></body></html>',
        });
        return;
      }
      if (url.startsWith('chrome-extension://')) await route.continue();
      else await route.abort('blockedbyclient');
    });

    await page.goto(prUrl, { waitUntil: 'domcontentloaded' });
    const region = page.locator('[role="region"][id^="diff-"]');
    const richButton = region.getByRole('tab', {
      name: 'Display before and after previews',
    });
    await expect(richButton).toBeVisible();
    await expect(page.locator('.gh-html-preview-fallback-diffs')).toHaveCount(0);
    const sourceButton = region.getByRole('tab', {
      name: 'Display code diff',
    });
    await expect(sourceButton).toHaveAttribute('aria-selected', 'false');
    await expect(richButton).toHaveAttribute('aria-selected', 'true');
    await expect(richButton).toHaveAttribute('aria-selected', 'true');
    await expect(sourceButton).toHaveAttribute('aria-selected', 'false');
    const richContainer = region.locator('.gh-html-preview-pr-rich');
    await expect(richContainer.getByRole('status')).toBeHidden();
    const beforeIframe = richContainer.locator(
      `iframe[title="Before HTML preview for ${filePath}"]`,
    );
    const afterIframe = richContainer.locator(
      `iframe[title="After HTML preview for ${filePath}"]`,
    );
    const beforeFrame = beforeIframe.contentFrame();
    const afterFrame = afterIframe.contentFrame();
    await expect(beforeFrame.locator('#before-rich')).toHaveText(
      'Before version',
    );
    await expect(afterFrame.locator('#react-rich')).toHaveText('After version');
    await expect(beforeFrame.locator('#before-script')).toHaveText(
      'Before script ran',
    );
    await expect(afterFrame.locator('#after-script')).toHaveText(
      'After script ran',
    );
    await expect(richContainer.getByRole('button')).toHaveCount(0);
    await expect(richContainer.getByRole('link')).toHaveCount(0);
    const beforeHandle = await beforeIframe.elementHandle();
    const afterHandle = await afterIframe.elementHandle();
    const beforePageFrame = await beforeHandle?.contentFrame();
    const afterPageFrame = await afterHandle?.contentFrame();
    expect(beforePageFrame).not.toBeNull();
    expect(afterPageFrame).not.toBeNull();
    expect(
      await beforePageFrame!.evaluate(
        () =>
          (
            globalThis as typeof globalThis & {
              __ghHtmlPreviewScrollBridge?: boolean;
            }
          ).__ghHtmlPreviewScrollBridge,
      ),
    ).toBe(true);
    await beforePageFrame!.evaluate(() => scrollTo(700, 100));
    const sourceRatio = await beforePageFrame!.evaluate(
      () => scrollY / (document.documentElement.scrollHeight - innerHeight),
    );
    await expect
      .poll(() =>
        afterPageFrame!.evaluate(
          () => scrollY / (document.documentElement.scrollHeight - innerHeight),
        ),
      )
      .toBeCloseTo(sourceRatio, 1);

    const sourceSemanticTop = await beforePageFrame!.evaluate(() => {
      const first = document.querySelector('#sync-a')!.getBoundingClientRect().top + scrollY;
      const second = document.querySelector('#sync-b')!.getBoundingClientRect().top + scrollY;
      return first + 0.37 * (second - first);
    });
    const targetSemanticTop = await afterPageFrame!.evaluate(() => {
      const first = document.querySelector('#sync-a')!.getBoundingClientRect().top + scrollY;
      const second = document.querySelector('#sync-b')!.getBoundingClientRect().top + scrollY;
      return first + 0.37 * (second - first);
    });
    await beforePageFrame!.evaluate(
      ({ left, top }) => scrollTo(left, top),
      { left: 700, top: sourceSemanticTop },
    );
    await expect
      .poll(async () =>
        Math.abs(
          (await afterPageFrame!.evaluate(() => scrollY)) - targetSemanticTop,
        ),
      )
      .toBeLessThan(3);
    await expect
      .poll(() => afterPageFrame!.evaluate(() => scrollX))
      .toBeGreaterThan(300);
    const stableSourceTop = await beforePageFrame!.evaluate(() => scrollY);
    await expect
      .poll(async () =>
      Math.abs(
        (await beforePageFrame!.evaluate(() => scrollY)) - stableSourceTop,
      ),
      )
      .toBeLessThan(2);

    expect(baseFileRequests).toBe(1);
    expect(headFileRequests).toBe(1);
    await expect(region.locator('[data-testid="source-row"]')).toBeHidden();
    await expect(region.locator('#r123')).toBeVisible();
    await region.getByRole('button', { name: 'Collapse file' }).click();
    await expect(richContainer).toBeHidden();
    await region.getByRole('button', { name: 'Expand file' }).click();
    await expect(richContainer).toBeVisible();
    await expect(region.locator('[data-testid="source-row"]')).toBeHidden();
    await expect(region.locator('#r123')).toBeVisible();
    await sourceButton.click();
    await expect(sourceButton).toHaveAttribute('aria-selected', 'true');
    await expect(region.locator('.border')).toBeVisible();
    await expect(region.locator('[data-testid="source-row"]')).toBeVisible();
    expect(apiRequests).toBe(1);
  } finally {
    await context.close();
  }
});

test('split comparison represents an added HTML file without failing head preview', async () => {
  const { context, page } = await launchWithExtension();
  const prUrl = 'https://github.com/acme/reports/pull/44/changes';
  const baseSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const headSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const filePath = 'examples/added.html';
  try {
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (url === prUrl) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: githubReactPrFixture(filePath),
        });
        return;
      }
      if (url === 'https://api.github.com/repos/acme/reports/pulls/44') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            base: {
              sha: baseSha,
              repo: { full_name: 'acme/reports', private: false },
            },
            head: {
              sha: headSha,
              repo: { full_name: 'acme/reports', private: false },
            },
          }),
        });
        return;
      }
      if (
        url ===
        'https://api.github.com/repos/acme/reports/pulls/44/files?per_page=100'
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ filename: filePath, status: 'added' }]),
        });
        return;
      }
      if (
        url ===
        `https://raw.githubusercontent.com/acme/reports/${baseSha}/${filePath}`
      ) {
        await route.fulfill({ status: 404, body: 'missing' });
        return;
      }
      if (
        url ===
        `https://raw.githubusercontent.com/acme/reports/${headSha}/${filePath}`
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><html><body><h1 id="added-head">Added file</h1></body></html>',
        });
        return;
      }
      if (url.startsWith('chrome-extension://')) await route.continue();
      else await route.abort('blockedbyclient');
    });

    await page.goto(prUrl, { waitUntil: 'domcontentloaded' });
    const region = page.locator('[role="region"][id^="diff-"]');
    await expect(region.getByRole('tab', { name: 'Display before and after previews' }))
      .toHaveAttribute('aria-selected', 'true');
    const comparison = region.locator('.gh-html-preview-pr-rich');
    await expect(comparison.getByRole('status')).toBeHidden();
    await expect(
      comparison.locator(`iframe[title="Before HTML preview for ${filePath}"]`),
    ).toHaveCount(0);
    const after = comparison
      .locator(`iframe[title="After HTML preview for ${filePath}"]`)
      .contentFrame();
    await expect(after.locator('#added-head')).toHaveText('Added file');
  } finally {
    await context.close();
  }
});

test('split comparison resolves renamed base paths and deleted head states', async () => {
  const { context, page } = await launchWithExtension();
  const baseSha = '1111111111111111111111111111111111111111';
  const headSha = '2222222222222222222222222222222222222222';
  const renamedPath = 'examples/new-name.html';
  const previousPath = 'examples/old-name.html';
  const deletedPath = 'examples/deleted.html';
  const renamedUrl = 'https://github.com/acme/reports/pull/47/changes';
  const deletedUrl = 'https://github.com/acme/reports/pull/48/changes';
  try {
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (url === renamedUrl) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: githubReactPrFixture(renamedPath),
        });
        return;
      }
      if (url === deletedUrl) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: githubReactPrFixture(deletedPath),
        });
        return;
      }
      if (
        url === 'https://api.github.com/repos/acme/reports/pulls/47' ||
        url === 'https://api.github.com/repos/acme/reports/pulls/48'
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            base: {
              sha: baseSha,
              repo: { full_name: 'acme/reports', private: false },
            },
            head: {
              sha: headSha,
              repo: { full_name: 'acme/reports', private: false },
            },
          }),
        });
        return;
      }
      if (
        url ===
        'https://api.github.com/repos/acme/reports/pulls/47/files?per_page=100'
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              filename: renamedPath,
              previous_filename: previousPath,
              status: 'renamed',
            },
          ]),
        });
        return;
      }
      if (
        url ===
        'https://api.github.com/repos/acme/reports/pulls/48/files?per_page=100'
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ filename: deletedPath, status: 'removed' }]),
        });
        return;
      }
      if (
        url ===
        `https://raw.githubusercontent.com/acme/reports/${baseSha}/${renamedPath}`
      ) {
        await route.fulfill({ status: 404, body: 'renamed' });
        return;
      }
      if (
        url ===
        `https://raw.githubusercontent.com/acme/reports/${baseSha}/${previousPath}`
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<h1 id="renamed-before">Old name</h1>',
        });
        return;
      }
      if (
        url ===
        `https://raw.githubusercontent.com/acme/reports/${headSha}/${renamedPath}`
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<h1 id="renamed-after">New name</h1>',
        });
        return;
      }
      if (
        url ===
        `https://raw.githubusercontent.com/acme/reports/${baseSha}/${deletedPath}`
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<h1 id="deleted-before">Deleted file</h1>',
        });
        return;
      }
      if (
        url ===
        `https://raw.githubusercontent.com/acme/reports/${headSha}/${deletedPath}`
      ) {
        await route.fulfill({ status: 404, body: 'deleted' });
        return;
      }
      if (url.startsWith('chrome-extension://')) await route.continue();
      else await route.abort('blockedbyclient');
    });

    await page.goto(renamedUrl, { waitUntil: 'domcontentloaded' });
    let region = page.locator('[role="region"][id^="diff-"]');
    await expect(region.getByRole('tab', { name: 'Display before and after previews' }))
      .toHaveAttribute('aria-selected', 'true');
    let comparison = region.locator('.gh-html-preview-pr-rich');
    await expect(comparison.getByRole('status')).toBeHidden();
    await expect(
      comparison
        .locator(`iframe[title="Before HTML preview for ${renamedPath}"]`)
        .contentFrame()
        .locator('#renamed-before'),
    ).toHaveText('Old name');

    const deletedPage = await context.newPage();
    await deletedPage.goto(deletedUrl, { waitUntil: 'domcontentloaded' });
    region = deletedPage.locator('[role="region"][id^="diff-"]');
    await expect(region.getByRole('tab', { name: 'Display before and after previews' }))
      .toHaveAttribute('aria-selected', 'true');
    comparison = region.locator('.gh-html-preview-pr-rich');
    await expect(comparison.getByRole('status')).toBeHidden();
    await expect(
      comparison.locator(`iframe[title="After HTML preview for ${deletedPath}"]`),
    ).toHaveCount(0);
    await expect(
      comparison
        .locator(`iframe[title="Before HTML preview for ${deletedPath}"]`)
        .contentFrame()
        .locator('#deleted-before'),
    ).toHaveText('Deleted file');
  } finally {
    await context.close();
  }
});

test('PR metadata failure leaves the source diff recoverable', async () => {
  const { context, page } = await launchWithExtension();
  const prUrl = 'https://github.com/acme/reports/pull/45/changes';
  const filePath = 'examples/unavailable.html';
  try {
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (url === prUrl) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: githubReactPrFixture(filePath),
        });
        return;
      }
      if (url === 'https://api.github.com/repos/acme/reports/pulls/45') {
        await route.fulfill({ status: 503, body: 'unavailable' });
        return;
      }
      if (url.startsWith('chrome-extension://')) await route.continue();
      else await route.abort('blockedbyclient');
    });

    await page.goto(prUrl, { waitUntil: 'domcontentloaded' });
    const region = page.locator('[role="region"][id^="diff-"]');
    const source = region.getByRole('tab', {
      name: 'Display code diff',
    });
    await expect(region.getByRole('tab', { name: 'Display before and after previews' }))
      .toHaveAttribute('aria-selected', 'true');
    const comparison = region.locator('.gh-html-preview-pr-rich');
    await expect(comparison).toContainText(
      'Comparison unavailable. GitHub API returned HTTP 503',
    );
    await expect(comparison.locator('iframe')).toHaveCount(0);

    await source.click();
    await expect(source).toHaveAttribute('aria-selected', 'true');
    await expect(comparison).toBeHidden();
    await expect(region.locator('.border')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('GitHub SPA navigation mounts diff controls without a location event', async () => {
  const { context, page } = await launchWithExtension();
  const conversationUrl = 'https://github.com/acme/reports/pull/51';
  const changesUrl = 'https://github.com/acme/reports/pull/51/changes';
  const filePath = 'examples/navigation.html';
  try {
    await context.route('**/*', async (route) => {
      if (route.request().url() === conversationUrl) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><html><body><main>Conversation</main></body></html>',
        });
        return;
      }
      await route.abort();
    });
    await page.goto(conversationUrl);
    const changesHtml = githubReactPrFixture(filePath);
    await page.evaluate(
      ({ url, html }) => {
        history.pushState({}, '', url);
        const next = new DOMParser().parseFromString(html, 'text/html');
        document.body.replaceChildren(...Array.from(next.body.childNodes));
      },
      { url: changesUrl, html: changesHtml },
    );
    await expect(
      page.getByRole('tab', {
        name: 'Display before and after previews',
      }),
    ).toHaveCount(1);
  } finally {
    await context.close();
  }
});

test('private PR first load recovers metadata from the signed-in GitHub page', async () => {
  const { context, page } = await launchWithExtension();
  const filePath = 'private/first-load.html';
  const base = 'b'.repeat(40);
  const head = 'a'.repeat(40);
  const prUrl = 'https://github.com/acme/reports/pull/60/changes';
  const embedded = JSON.stringify({
    payload: {
      pullRequestsChangesRoute: {
        comparison: { fullDiff: { baseOid: base, headOid: head } },
        pullRequest: {
          comparison: { baseOid: base, headOid: head },
          headRepositoryOwnerLogin: 'acme',
          headRepositoryName: 'reports',
        },
        diffContents: [
          {
            path: filePath,
            status: 'MODIFIED',
            oldTreeEntry: { path: filePath },
          },
        ],
      },
    },
  }).replaceAll('<', '\\u003c');
  const firstPage = githubReactPrFixture(filePath);
  const sessionPage = firstPage.replace(
    '</body>',
    `<script type="application/json" data-target="react-app.embeddedData">${embedded}</script></body>`,
  );
  let headAttempts = 0;
  try {
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (url === prUrl) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body:
            route.request().resourceType() === 'document'
              ? firstPage
              : sessionPage,
        });
        return;
      }
      if (
        url === 'https://api.github.com/repos/acme/reports/pulls/60' ||
        url ===
          'https://api.github.com/repos/acme/reports/pulls/60/files?per_page=100'
      ) {
        await route.fulfill({ status: 404, json: { message: 'Not Found' } });
        return;
      }
      if (
        url ===
          `https://github.com/acme/reports/raw/${base}/${filePath}` ||
        url ===
          `https://github.com/acme/reports/raw/${head}/${filePath}`
      ) {
        if (url.includes(head)) {
          headAttempts += 1;
          if (headAttempts === 1) {
            await route.fulfill({ status: 404, body: 'Not Found' });
            return;
          }
        }
        await route.fulfill({
          status: 200,
          contentType: 'text/plain',
          body: `<h1>${url.includes(base) ? 'Before' : 'After'}</h1>`,
        });
        return;
      }
      await route.abort();
    });

    await page.goto(prUrl);
    await expect(page.getByRole('tab', { name: 'Display before and after previews' }))
      .toHaveAttribute('aria-selected', 'true');
    const comparison = page.locator('.gh-html-preview-pr-rich');
    await expect(
      comparison.locator(`iframe[title="Before HTML preview for ${filePath}"]`),
    ).toHaveCount(1);
    const retry = comparison.getByRole('button', { name: 'Retry' });
    await expect(retry).toBeVisible();
    await expect(comparison.getByRole('status')).toBeHidden();
    await expect(retry).toHaveCSS('position', 'absolute');
    await retry.click();
    await expect(
      comparison.locator(`iframe[title="After HTML preview for ${filePath}"]`),
    ).toHaveCount(1);
    expect(headAttempts).toBe(2);
    await expect(retry).toBeHidden();
  } finally {
    await context.close();
  }
});

test('private PR renders each added HTML file through the GitHub session', async () => {
  const { context, page } = await launchWithExtension();
  const filePaths = ['private/first.html', 'private/second.html'];
  const base = 'c'.repeat(40);
  const head = 'd'.repeat(40);
  const prUrl = 'https://github.com/acme/reports/pull/62/changes';
  const files = filePaths
    .map(
      (filePath) => `<div class="file" data-path="${filePath}">
        <div class="file-header" data-path="${filePath}">
          <div class="file-actions"><div class="d-flex"></div></div>
        </div>
        <div class="js-file-content">Source diff for ${filePath}</div>
      </div>`,
    )
    .join('');
  const firstPage = `<!doctype html><html><body><div id="files">${files}</div></body></html>`;
  const embedded = JSON.stringify({
    payload: {
      pullRequestsChangesRoute: {
        comparison: { fullDiff: { baseOid: base, headOid: head } },
        pullRequest: {
          comparison: { baseOid: base, headOid: head },
          headRepositoryOwnerLogin: 'acme',
          headRepositoryName: 'reports',
        },
        diffContents: filePaths.map((path) => ({
          path,
          status: 'ADDED',
          oldTreeEntry: null,
        })),
      },
    },
  }).replaceAll('<', '\\u003c');
  const sessionPage = firstPage.replace(
    '</body>',
    `<script type="application/json" data-target="react-app.embeddedData">${embedded}</script></body>`,
  );
  try {
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (url === prUrl) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body:
            route.request().resourceType() === 'document'
              ? firstPage
              : sessionPage,
        });
        return;
      }
      if (
        url === 'https://api.github.com/repos/acme/reports/pulls/62' ||
        url ===
          'https://api.github.com/repos/acme/reports/pulls/62/files?per_page=100'
      ) {
        await route.fulfill({ status: 404, json: { message: 'Not Found' } });
        return;
      }
      for (const [index, filePath] of filePaths.entries()) {
        if (url === `https://github.com/acme/reports/raw/${base}/${filePath}`) {
          await route.fulfill({ status: 404, body: 'Not Found' });
          return;
        }
        if (url === `https://github.com/acme/reports/raw/${head}/${filePath}`) {
          await route.fulfill({
            status: 200,
            contentType: 'text/plain',
            body: `<!doctype html><html><body><h1 id="private-added-${index + 1}">Private added ${index + 1}</h1></body></html>`,
          });
          return;
        }
      }
      if (url.startsWith('chrome-extension://')) {
        await route.continue();
        return;
      }
      await route.abort();
    });

    await page.goto(prUrl);
    for (const [index, filePath] of filePaths.entries()) {
      const file = page.locator(`.file[data-path="${filePath}"]`);
      await expect(file.getByRole('tab', { name: 'Display before and after previews' }))
        .toHaveAttribute('aria-selected', 'true');
      const frame = file
        .locator(`iframe[title="After HTML preview for ${filePath}"]`)
        .contentFrame();
      await expect(frame.locator(`#private-added-${index + 1}`)).toHaveText(
        `Private added ${index + 1}`,
      );
    }

    const reloadedIframe = page.locator(
      `iframe[title="After HTML preview for ${filePaths[1]}"]`,
    );
    await reloadedIframe
      .contentFrame()
      .locator('body')
      .evaluate((body) => {
        body.dataset.testGeneration = 'old';
      });
    await reloadedIframe.evaluate((iframe) => {
      const source = iframe.getAttribute('src');
      if (!source) throw new Error('Preview iframe source missing.');
      iframe.setAttribute('src', source);
    });
    await expect(reloadedIframe.contentFrame().locator('body')).not.toHaveAttribute(
      'data-test-generation',
      'old',
    );
    await expect(
      reloadedIframe.contentFrame().locator('#private-added-2'),
    ).toHaveText('Private added 2');
  } finally {
    await context.close();
  }
});

test('organization SSO falls back to embedded PR metadata and GitHub session raw files', async () => {
  const { context, page } = await launchWithExtension();
  const filePath = 'enterprise/report.html';
  const base = 'b'.repeat(40);
  const head = 'a'.repeat(40);
  const prUrl = 'https://github.com/acme/reports/pull/61/changes';
  const embedded = JSON.stringify({
    payload: {
      pullRequestsChangesRoute: {
        comparison: { fullDiff: { baseOid: base, headOid: head } },
        pullRequest: {
          comparison: { baseOid: base, headOid: head },
          headRepositoryOwnerLogin: 'acme',
          headRepositoryName: 'reports',
        },
        diffContents: [
          {
            path: filePath,
            status: 'MODIFIED',
            oldTreeEntry: { path: filePath },
          },
        ],
      },
    },
  }).replaceAll('<', '\\u003c');
  const pageHtml = githubReactPrFixture(filePath).replace(
    '</body>',
    `<script type="application/json" data-target="react-app.embeddedData">${embedded}</script></body>`,
  );
  const sessionRequests: string[] = [];
  let headAttempts = 0;
  try {
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (url === prUrl) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: pageHtml,
        });
        return;
      }
      if (
        url === 'https://api.github.com/repos/acme/reports/pulls/61' ||
        url ===
          'https://api.github.com/repos/acme/reports/pulls/61/files?per_page=100'
      ) {
        await route.fulfill({ status: 404, json: { message: 'Not Found' } });
        return;
      }
      const sessionRaw =
        /^https:\/\/github\.com\/acme\/reports\/raw\/([0-9a-f]{40})\/(.+)$/.exec(
          url,
        );
      if (sessionRaw) {
        sessionRequests.push(sessionRaw[1]);
        if (sessionRaw[1] === head) {
          headAttempts += 1;
          if (headAttempts <= 4) {
            await route.fulfill({ status: 503, body: 'Unavailable' });
            return;
          }
        }
        await route.fulfill({
          status: 200,
          contentType: 'text/plain',
          body: `<!doctype html><html><body><h1>${sessionRaw[1] === base ? 'Enterprise before' : 'Enterprise after'}</h1></body></html>`,
        });
        return;
      }
      await route.abort();
    });
    await page.goto(prUrl);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.querySelectorAll('.gh-html-preview-pr-controls').length,
        ),
      )
      .toBe(1);
    const previewTab = page.getByRole('tab', {
      name: 'Display before and after previews',
    });
    await expect(previewTab).toHaveAttribute('aria-selected', 'true');
    await expect
      .poll(() => [...sessionRequests].sort())
      .toEqual([head, base].sort());
    const comparison = page.locator('.gh-html-preview-pr-rich');
    await expect(comparison.getByRole('button', { name: 'Retry' })).toBeVisible();
    await comparison.getByRole('button', { name: 'Retry' }).click();
    await expect(
      comparison.locator(`iframe[title="Before HTML preview for ${filePath}"]`),
    ).toHaveCount(1);
    await expect(
      comparison.locator(`iframe[title="After HTML preview for ${filePath}"]`),
    ).toHaveCount(1);
    expect(headAttempts).toBe(5);
    await expect(comparison.getByRole('button', { name: 'Retry' })).toBeHidden();
  } finally {
    await context.close();
  }
});

test('commit pages render HTML fallbacks when GitHub omits large diffs', async () => {
  const { context, page } = await launchWithExtension();
  const head = 'a'.repeat(40);
  const base = 'b'.repeat(40);
  const commitUrl = `https://github.com/acme/reports/commit/${head}`;
  const baseCommitUrl = `https://github.com/acme/reports/commit/${base}`;
  const filteredPrUrl = `https://github.com/acme/reports/pull/52/changes/${head}`;
  const compareUrl = `https://github.com/acme/reports/compare/${base}...${head}`;
  const commitPage = `<!doctype html><html><body><main><h1>Large commit</h1></main><script type="application/json" data-target="react-app.embeddedData">${JSON.stringify(
    {
      payload: {
        commit: { oid: head, parents: [base] },
        repo: { private: true },
        diffEntryData: [
          { path: 'long-added.html', status: 'ADDED' },
          { path: 'long-edited.html', status: 'MODIFIED' },
          { path: 'long-removed.html', status: 'DELETED' },
        ],
      },
    },
  )}</script></body></html>`;
  const html = (label: string) =>
    `<!doctype html><html><body><h1>${label}</h1></body></html>`;
  try {
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (url === commitUrl || url === filteredPrUrl) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: commitPage,
        });
        return;
      }
      if (url === baseCommitUrl) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: `<script type="application/json" data-target="react-app.embeddedData">${JSON.stringify(
            { payload: { commit: { oid: base, parents: [] } } },
          )}</script>`,
        });
        return;
      }
      if (url === compareUrl) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: githubReactPrFixture('long-edited.html'),
        });
        return;
      }
      if (url === 'https://api.github.com/repos/acme/reports') {
        await route.fulfill({ status: 404, json: { message: 'Not Found' } });
        return;
      }
      if (url === `https://api.github.com/repos/acme/reports/commits/${head}`) {
        await route.fulfill({ status: 404, json: { message: 'Not Found' } });
        return;
      }
      if (
        url ===
        `https://api.github.com/repos/acme/reports/compare/${base}...${head}`
      ) {
        await route.fulfill({ status: 404, json: { message: 'Not Found' } });
        return;
      }
      const raw = /^https:\/\/github\.com\/acme\/reports\/raw\/([^/]+)\/(.+)$/.exec(
        url,
      );
      if (raw) {
        const [, ref, path] = raw;
        if (
          (path === 'long-added.html' && ref === base) ||
          (path === 'long-removed.html' && ref === head)
        ) {
          await route.fulfill({ status: 404, body: 'Not Found' });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'text/plain',
          body: html(`${ref === base ? 'Base' : 'Head'} ${path}`),
        });
        return;
      }
      await route.abort();
    });
    await page.goto(commitUrl);
    const cards = page.locator('[data-gh-html-preview-path]');
    await expect(cards).toHaveCount(3);
    await page
      .locator('[data-gh-html-preview-path="long-added.html"]')
      .getByRole('tab', { name: 'Display before and after previews' })
      .click();
    await expect(
      cards.locator('iframe[title="After HTML preview for long-added.html"]'),
    ).toHaveCount(1);
    await page
      .locator('[data-gh-html-preview-path="long-edited.html"]')
      .getByRole('tab', { name: 'Display before and after previews' })
      .click();
    await expect(
      cards.locator('iframe[title="Before HTML preview for long-edited.html"]'),
    ).toHaveCount(1);
    await expect(
      cards.locator('iframe[title="After HTML preview for long-edited.html"]'),
    ).toHaveCount(1);
    await page
      .locator('[data-gh-html-preview-path="long-removed.html"]')
      .getByRole('tab', { name: 'Display before and after previews' })
      .click();
    await expect(
      cards.locator('iframe[title="Before HTML preview for long-removed.html"]'),
    ).toHaveCount(1);
    await page.goto(filteredPrUrl);
    await expect(page.locator('[data-gh-html-preview-path]')).toHaveCount(3);
    await expect(
      page.getByRole('tab', {
        name: 'Display before and after previews',
      }),
    ).toHaveCount(3);
    await page.goto(compareUrl);
    await expect(page.getByRole('tab', { name: 'Display before and after previews' }))
      .toHaveAttribute('aria-selected', 'true');
    await expect(
      page.locator('iframe[title="Before HTML preview for long-edited.html"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('iframe[title="After HTML preview for long-edited.html"]'),
    ).toHaveCount(1);
  } finally {
    await context.close();
  }
});

test('SPA navigation rejects stale embedded data and cursor source', async () => {
  const slowHtml =
    '<!doctype html><html><body><h2 id="file-a">File A</h2><img src="./slow.png"></body></html>';
  const nextHtml =
    '<!doctype html><html><body><h2 id="file-b">File B</h2></body></html>';
  const nextPath = 'reports/daily/index.html';
  const nextUrl =
    'https://github.com/acme/reports/blob/main/reports/daily/index.html';
  const { context, page } = await launchWithExtension();
  try {
    await routeProductFixtures(context, slowHtml);
    const fetched: string[] = [];
    await context.route(
      'https://raw.githubusercontent.com/acme/reports/main/reports/daily/index.html',
      async (route) => {
        fetched.push(route.request().url());
        await route.fulfill({ contentType: 'text/html', body: nextHtml });
      },
    );
    await page.goto(blobUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Preview' }).click();
    await expect(page.locator('.gh-html-preview-container').getByRole('status')).toBeHidden();

    await page.evaluate((html) => {
      const textarea = document.createElement('textarea');
      textarea.setAttribute('aria-label', 'file content');
      textarea.value = html;
      document.querySelector('.react-code-lines')!.append(textarea);
    }, slowHtml);

    await page.evaluate(
      ({ url }) => {
        history.pushState({}, '', url);
        window.dispatchEvent(new Event('wxt:locationchange'));
      },
      { url: nextUrl },
    );

    const nextPreview = page.getByRole('tab', { name: 'Preview' });
    await expect(nextPreview).toHaveCount(1);
    // Active Preview survives navigation without another click.
    const frame = page
      .locator('.gh-html-preview-container iframe[title="Executable HTML preview"]')
      .contentFrame();
    await expect(frame.locator('#file-b')).toHaveText('File B');
    await expect(frame.locator('#file-a')).toHaveCount(0);
    expect(fetched).toHaveLength(1);
    await expect(nextPreview).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.gh-html-preview-container iframe')).toHaveAttribute('sandbox', 'allow-scripts');
  } finally {
    await context.close();
  }
});

test('popup enable setting updates an already-open GitHub page', async () => {
  const { context, page, extensionId } = await launchWithExtension();
  try {
    await routeProductFixtures(context);
    await page.goto(blobUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tab', { name: 'Preview' })).toHaveCount(1);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const enabled = popup.getByRole('checkbox', {
      name: 'Show previews on GitHub HTML files and pull requests',
    });
    await expect(enabled).toBeChecked();
    await enabled.uncheck();
    await expect(popup.getByRole('status')).toHaveText('Saved');
    await expect(page.getByRole('tab', { name: 'Preview' })).toHaveCount(0);
    await expect(page.locator('.gh-html-preview-container')).toHaveCount(0);

    await enabled.check();
    await expect(popup.getByRole('status')).toHaveText('Saved');
    await expect(page.getByRole('tab', { name: 'Preview' })).toHaveCount(1);
  } finally {
    await context.close();
  }
});

test('missing embedded source produces recoverable inline error', async () => {
  const { context, page } = await launchWithExtension();
  let attempts = 0;
  try {
    await context.route(`${rawBase}/reports/weekly/index.html`, async (route) => {
      attempts += 1;
      await route.fulfill(
        attempts <= 4
          ? { status: 503, body: 'unavailable' }
          : {
              status: 200,
              contentType: 'text/html',
              body: '<h1 id="retry-success">Retry succeeded</h1>',
            },
      );
    });
    await context.route(blobUrl, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: githubBlobFixtureWithoutSource(commit, 'reports/weekly/index.html'),
      });
    });
    await page.goto(blobUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Preview' }).click();

    const container = page.locator('.gh-html-preview-container');
    await expect(container.getByRole('alert')).toHaveText('Error');
    await expect(container).toContainText('Public raw file returned HTTP 503');
    await expect(container).toContainText('Preview could not be rendered');
    await container.getByRole('button', { name: 'Retry' }).click();
    await expect(container.getByRole('status')).toBeHidden();
    await expect(
      container
        .locator('iframe[title="Executable HTML preview"]')
        .contentFrame()
        .locator('#retry-success'),
    ).toHaveText('Retry succeeded');
    expect(attempts).toBe(5);
    await page.getByRole('button', { name: 'Code' }).click();
    await expect(page.locator('.react-code-lines')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('inline preview falls back to public raw source when embedded HTML is absent', async () => {
  const { context, page } = await launchWithExtension();
  try {
    await context.route(`${rawBase}/reports/weekly/index.html`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body><h2 id="fallback">Fallback source</h2></body></html>',
      });
    });
    await context.route(blobUrl, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: githubBlobFixtureWithoutSource(commit, 'reports/weekly/index.html'),
      });
    });
    await page.goto(blobUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Preview' }).click();

    const container = page.locator('.gh-html-preview-container');
    await expect(container.getByRole('status')).toBeHidden();
    const frame = container
      .locator('iframe[title="Executable HTML preview"]')
      .contentFrame();
    await expect(frame.locator('#fallback')).toHaveText('Fallback source');
  } finally {
    await context.close();
  }
});

test('private blob and full preview use only the signed-in GitHub session', async () => {
  const { context, page, extensionId } = await launchWithExtension();
  const sessionRequests: string[] = [];
  const authorizationHeaders: string[] = [];
  context.on('request', (request) => {
    const authorization = request.headers().authorization;
    if (authorization) authorizationHeaders.push(authorization);
  });
  try {
    await context.route('https://raw.githubusercontent.com/**', async (route) => {
      await route.fulfill({ status: 404, body: 'Not Found' });
    });
    await context.route('https://github.com/private-owner/private-repo/raw/**', async (route) => {
      const url = route.request().url();
      const resources: Record<string, { body: string; type: string }> = {
        [`https://github.com/private-owner/private-repo/raw/${commit}/assets/private.css`]: {
          body: 'body { color: rgb(12, 34, 56) }',
          type: 'text/plain',
        },
        [`https://github.com/private-owner/private-repo/raw/${commit}/report/secret.png`]: {
          body: 'secret-image',
          type: 'application/octet-stream',
        },
        [`https://github.com/private-owner/private-repo/raw/${commit}/report/classic.js`]: {
          body: `document.querySelector('#classic-result').textContent = 'Classic executed';`,
          type: 'application/octet-stream',
        },
        [`https://github.com/private-owner/private-repo/raw/${commit}/report/main.js`]: {
          body: `import { value } from './dependency.js'; document.querySelector('#module-result').textContent = value;`,
          type: 'application/octet-stream',
        },
        [`https://github.com/private-owner/private-repo/raw/${commit}/report/dependency.js`]: {
          body: `export const value = 'Module executed';`,
          type: 'application/octet-stream',
        },
      };
      const resource = resources[url];
      sessionRequests.push(url);
      await route.fulfill(
        resource
          ? {
              status: 200,
              contentType: resource.type,
              body: resource.body,
            }
          : { status: 404, body: 'missing' },
      );
    });
    await context.route(privateBlobUrl, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: githubBlobFixture(
          privatePreviewHtml,
          commit,
          'report/index.html',
          false,
          'private-owner',
          'private-repo',
        ),
      });
    });
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.evaluate(() => {
      const extensionChrome = (
        globalThis as unknown as {
          chrome: {
            storage: {
              local: {
                set(value: Record<string, unknown>): Promise<void>;
              };
            };
          };
        }
      ).chrome;
      return extensionChrome.storage.local.set({ githubToken: 'legacy-token' });
    });
    await popup.reload();
    await expect(
      popup.getByText('The extension never asks for or stores a personal access token.'),
    ).toBeVisible();
    expect(
      await popup.evaluate(() => {
        const extensionChrome = (
          globalThis as unknown as {
            chrome: {
              storage: {
                local: {
                  get(key: string): Promise<Record<string, unknown>>;
                };
              };
            };
          }
        ).chrome;
        return extensionChrome.storage.local.get('githubToken');
      }),
    ).toEqual({});
    await expect(popup.locator('input[type="password"]')).toHaveCount(0);

    await page.goto(privateBlobUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Preview' }).click();
    const container = page.locator('.gh-html-preview-container');
    await expect(container.getByRole('status')).toBeHidden();
    const inlineFrame = container
      .locator('iframe[title="Executable HTML preview"]')
      .contentFrame();
    await expect(inlineFrame.locator('#private-title')).toHaveText(
      'Private report',
    );
    await expect(inlineFrame.locator('#private-image')).toHaveAttribute(
      'src',
      /^data:image\/png;base64,/,
    );
    await expect(inlineFrame.locator('#classic-result')).toHaveText(
      'Classic executed',
    );
    await expect(inlineFrame.locator('#module-result')).toHaveText(
      'Module executed',
    );
    await inlineFrame.locator('#fragment-link').click();
    await expect(inlineFrame.locator('#private-title')).toBeVisible();
    const fragmentLocation = await inlineFrame
      .locator('body')
      .evaluate(() => location.href);
    expect(fragmentLocation).toContain('#private-title');
    expect(fragmentLocation).not.toContain('cdn.jsdelivr.net');
    expect(fragmentLocation).not.toContain('view-source:');
    expect(sessionRequests).toHaveLength(5);
    expect(
      await page
        .getByRole('link', { name: 'Open full preview' })
        .getAttribute('aria-disabled'),
    ).toBeNull();

    const fullPagePromise = context.waitForEvent('page');
    await page.getByRole('link', { name: 'Open full preview' }).click();
    const fullPage = await fullPagePromise;
    const fullFrame = fullPage
      .locator('iframe[title="Executable HTML preview"]')
      .contentFrame();
    await expect(fullFrame.locator('#private-title')).toHaveText(
      'Private report',
    );
    await expect(fullFrame.locator('#classic-result')).toHaveText(
      'Classic executed',
    );
    await expect(fullFrame.locator('#module-result')).toHaveText(
      'Module executed',
    );
    expect(
      sessionRequests.every((url) =>
        url.startsWith('https://github.com/private-owner/private-repo/raw/'),
      ),
    ).toBe(true);
    expect(
      sessionRequests.some((url) => url.includes('api.github.com')),
    ).toBe(false);
    expect(authorizationHeaders).toEqual([]);
  } finally {
    await context.close();
  }
});

test('blob view choice survives different files and reloads without loading hidden previews', async () => {
  const { context, page, extensionId } = await launchWithExtension();
  const firstUrl = 'https://github.com/acme/reports/blob/main/first.html';
  const secondUrl = 'https://github.com/acme/reports/blob/main/second.html';
  let scriptRequests = 0;
  const html = '<!doctype html><html><body><h1 id="view-title">Saved view</h1><script src="./view.js"></script></body></html>';
  try {
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (url === firstUrl || url === secondUrl) {
        await route.fulfill({ status: 200, contentType: 'text/html', body: githubBlobFixture(html, commit, url.endsWith('first.html') ? 'first.html' : 'second.html') });
      } else if (url.includes('/view.js')) {
        scriptRequests += 1;
        await route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.loaded = true;', headers: { 'access-control-allow-origin': '*' } });
      } else if (url.startsWith('chrome-extension://')) await route.continue();
      else await route.abort('blockedbyclient');
    });
    const settings = await context.newPage();
    await settings.goto('chrome-extension://' + extensionId + '/popup.html');
    await page.goto(firstUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('iframe[title="Executable HTML preview"]').contentFrame().locator('#view-title')).toHaveText('Saved view');
    expect(await settings.evaluate("chrome.storage.local.get('blobViewMode')")).toEqual({});

    await page.getByRole('button', { name: 'Code', exact: true }).click();
    await expect.poll(() => settings.evaluate("chrome.storage.local.get('blobViewMode')")).toEqual({ blobViewMode: 'source' });
    const requestsBeforeCode = scriptRequests;
    // GitHub replaces its DOM while keeping the extension's content script alive.
    await page.evaluate(({ url, fixture }) => {
      const next = new DOMParser().parseFromString(fixture, 'text/html');
      document.querySelector('main')!.replaceWith(next.querySelector('main')!);
      document.querySelector('[data-target="react-app.embeddedData"]')!.replaceWith(next.querySelector('[data-target="react-app.embeddedData"]')!);
      history.pushState({}, '', url);
    }, { url: secondUrl, fixture: githubBlobFixture(html, commit, 'second.html') });
    await expect(page.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('#source')).toBeVisible();
    await expect(page.locator('iframe[title="Executable HTML preview"]')).toHaveCount(0);
    expect(scriptRequests).toBe(requestsBeforeCode);

    await page.goto(firstUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('#source')).toBeVisible();
    expect(scriptRequests).toBe(requestsBeforeCode);
    await page.getByRole('tab', { name: 'Preview' }).click();
    await expect.poll(() => settings.evaluate("chrome.storage.local.get('blobViewMode')")).toEqual({ blobViewMode: 'preview' });
    await page.goto(secondUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('iframe[title="Executable HTML preview"]').contentFrame().locator('#view-title')).toHaveText('Saved view');
  } finally {
    await context.close();
  }
});

test('PR view choice persists across PRs and added files never load a split placeholder', async () => {
  const { context, page, extensionId } = await launchWithExtension();
  const base = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const head = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const filePath = 'added.html';
  const firstUrl = 'https://github.com/acme/reports/pull/201/changes';
  const secondUrl = 'https://github.com/acme/reports/pull/202/changes';
  const headStarted = Promise.withResolvers<void>();
  const headRelease = Promise.withResolvers<void>();
  let holdHead = true;
  const requests: string[] = [];
  try {
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (url === firstUrl || url === secondUrl) {
        await route.fulfill({ status: 200, contentType: 'text/html', body: githubReactPrFixture(filePath) });
      } else if (url.startsWith('https://api.github.com/repos/acme/reports/pulls/')) {
        requests.push(url);
        const data = url.includes('/files?')
          ? [{ filename: filePath, status: 'added' }]
          : { base: { sha: base, repo: { full_name: 'acme/reports', private: false } }, head: { sha: head, repo: { full_name: 'acme/reports', private: false } } };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      } else if (url.includes('raw.githubusercontent.com')) {
        requests.push(url);
        if (url.includes(base)) await route.fulfill({ status: 404, body: 'missing' });
        else {
          headStarted.resolve();
          if (holdHead) await headRelease.promise;
          await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body><h1 id="pref-head">Added preview</h1></body></html>' });
        }
      } else if (url.startsWith('chrome-extension://')) await route.continue();
      else await route.abort('blockedbyclient');
    });
    const settings = await context.newPage();
    await settings.goto('chrome-extension://' + extensionId + '/popup.html');
    await page.goto(firstUrl, { waitUntil: 'domcontentloaded' });
    const preview = page.getByRole('tab', { name: 'Display before and after previews' });
    const code = page.getByRole('tab', { name: 'Display code diff' });
    const comparison = page.locator('.gh-html-preview-pr-rich');
    await expect(preview).toHaveAttribute('aria-selected', 'true');
    await headStarted.promise;
    // Slow network must not show two empty side-by-side panes.
    expect(await comparison.locator('section:visible').count()).toBeLessThanOrEqual(1);
    expect(await settings.evaluate("chrome.storage.local.get('comparisonPreferences')")).toEqual({});
    holdHead = false;
    headRelease.resolve();
    await expect(comparison.locator('iframe[title="After HTML preview for added.html"]').contentFrame().locator('#pref-head')).toHaveText('Added preview');
    await expect(comparison.locator('iframe[title="Before HTML preview for added.html"]')).toHaveCount(0);

    await code.click();
    await expect.poll(() => settings.evaluate("chrome.storage.local.get('comparisonPreferences').then(v => v.comparisonPreferences?.mode)")).toBe('source');
    const beforeCodeRequests = requests.length;
    await page.goto(secondUrl, { waitUntil: 'domcontentloaded' });
    await expect(code).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-testid="source-row"]')).toBeVisible();
    await expect(comparison.locator('iframe')).toHaveCount(0);
    expect(requests.length).toBe(beforeCodeRequests);

    await preview.click();
    await expect.poll(() => settings.evaluate("chrome.storage.local.get('comparisonPreferences').then(v => v.comparisonPreferences?.mode)")).toBe('split');
    await expect(comparison.locator('iframe[title="After HTML preview for added.html"]').contentFrame().locator('#pref-head')).toHaveText('Added preview');
    await page.goto(firstUrl, { waitUntil: 'domcontentloaded' });
    await expect(preview).toHaveAttribute('aria-selected', 'true');
    await expect(comparison.locator('iframe[title="After HTML preview for added.html"]').contentFrame().locator('#pref-head')).toHaveText('Added preview');
  } finally {
    headRelease.resolve();
    await context.close();
  }
});

function githubBlobFixture(
  html: string,
  oid: string,
  filePath: string,
  isPrivate = false,
  owner = isPrivate ? 'private-owner' : 'acme',
  repo = isPrivate ? 'private-repo' : 'reports',
): string {
  const payload = githubEmbeddedPayload(
    html,
    oid,
    filePath,
    isPrivate,
    owner,
    repo,
  );
  return `<!doctype html><html><head><style>
    ul.SegmentedControl { display: flex; margin: 0; padding: 0; list-style: none; }
    .native-segment { display: block; }
    .native-segment-button { height: 32px; padding: 5px 12px; }
  </style></head><body>
    <main id="blob">
      <div class="react-blob-view-header-sticky">
        <ul class="SegmentedControl" aria-label="File view">
          <li class="native-segment" data-selected data-component="SegmentedControl.Button">
            <button class="native-segment-button" type="button" aria-current="true" style="--separator-color:transparent">
              <span class="segmentedControl-content"><span class="segmentedControl-text" data-text="Code">Code</span></span>
            </button>
          </li>
          <li class="native-segment" data-component="SegmentedControl.Button">
            <button class="native-segment-button" type="button" aria-current="false" style="--separator-color:var(--borderColor-default)">
              <span class="segmentedControl-content"><span class="segmentedControl-text" data-text="Blame">Blame</span></span>
            </button>
          </li>
        </ul>
      </div>
      <div id="source"><div class="react-code-lines">Source code</div></div>
    </main>
    <script type="application/json" data-target="react-app.embeddedData">${payload}</script>
  </body></html>`;
}

function githubEmbeddedPayload(
  html: string,
  oid: string,
  filePath: string,
  isPrivate = false,
  owner = isPrivate ? 'private-owner' : 'acme',
  repo = isPrivate ? 'private-repo' : 'reports',
): string {
  return JSON.stringify({
    payload: {
      codeViewLayoutRoute: {
        repo: {
          ownerLogin: owner,
          name: repo,
          isPrivate,
        },
        refInfo: { currentOid: oid, name: 'main' },
        path: filePath,
      },
      'codeViewBlobLayoutRoute.StyledBlob': {
        rawLines: html.split('\n'),
      },
    },
  }).replaceAll('<', '\\u003c');
}

function githubPrFixture(filePath: string, viewFileHref?: string): string {
  return `<!doctype html><html><body><div id="files">
    <div class="file" data-path="${filePath}">
      <div class="file-header" data-path="${filePath}">
        ${
          viewFileHref
            ? `<a href="${viewFileHref}" data-ga-click="View file">View file</a>`
            : ''
        }
        <div class="file-actions"><div class="d-flex"></div></div>
      </div>
      <div class="js-file-content">Source diff for ${filePath}</div>
    </div>
  </div></body></html>`;
}

function githubReactPrFixture(
  filePath: string,
  includeReviewComment = false,
): string {
  return `<!doctype html><html><body>
    <div class="PullRequestDiffsList">
      <div role="region" id="diff-authenticated-react">
        <div data-diff-header-wrapper>
          <div class="DiffFileHeader">
            <div><button type="button" aria-label="Collapse file" onclick="const content=this.closest('[role=region]').querySelector('.border');const collapsing=this.getAttribute('aria-label')==='Collapse file';this.setAttribute('aria-label',collapsing?'Expand file':'Collapse file');content.hidden=collapsing">Collapse</button></div>
            <div class="file-path">
              <h3><a href="#diff-authenticated-react"><code>${filePath}</code></a></h3>
              <button type="button" data-file-path="${filePath}">Expand all lines</button>
            </div>
            <div class="d-flex flex-row flex-justify-end flex-items-center gap-2 flex-1">
              <button type="button">More options</button>
            </div>
          </div>
        </div>
        <div class="border position-relative rounded-bottom-2">
          <table aria-label="Diff for: ${filePath}"><tbody>
            <tr data-testid="source-row"><td>Source diff</td></tr>
            ${includeReviewComment ? '<tr><td><div id="r123">Review comment remains visible</div></td></tr>' : ''}
          </tbody></table>
        </div>
      </div>
    </div>
  </body></html>`;
}

function githubBlobFixtureWithoutSource(oid: string, filePath: string): string {
  const payload = JSON.stringify({
    payload: {
      repo: { ownerLogin: 'acme', name: 'reports' },
      refInfo: { currentOid: oid, name: 'main' },
      path: filePath,
      'codeViewBlobLayoutRoute.StyledBlob': { path: filePath },
    },
  });
  return `<!doctype html><html><body>
    <main id="blob">
      <div class="react-blob-view-header-sticky">
        <ul class="SegmentedControl" aria-label="File view">
          <li><button type="button" aria-selected="true">Code</button></li>
          <li><button type="button" aria-selected="false">Blame</button></li>
        </ul>
      </div>
      <div id="source"><div class="react-code-lines">Source code</div></div>
    </main>
    <script type="application/json" data-target="react-app.embeddedData">${payload}</script>
  </body></html>`;
}

function delay(milliseconds: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, milliseconds);
  return promise;
}


test('Retry freshens only its blob source and transitive graph', async () => {
  const { context, page, extensionId } = await launchWithExtension();
  const unrelated = await context.newPage();
  const selectedUrl = 'https://github.com/acme/reports/blob/main/selected/index.html';
  const otherUrl = 'https://github.com/acme/reports/blob/main/other/index.html';
  const requests: string[] = [];
  let retrying = false;
  const html = (version: string) => '<h1 id="version">' + version + '</h1>' +
    '<style>@import "./theme.css";</style><img id="chart" src="./chart.png">' +
    '<img src="./recover.png"><output id="module">waiting</output>' +
    '<output id="modern-loaded"></output><output id="legacy-loaded"></output>' +
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="64" height="32">' +
    '<defs><rect id="local-box" width="12" height="12"/></defs><use id="local-use" href="#local-box"/>' +
    '<image id="modern-image" href="./diagram.svg" width="24" height="24" onload="document.querySelector(\'#modern-loaded\').textContent=\'loaded\'"/>' +
    '<image id="legacy-image" xlink:href="./diagram.svg" x="32" width="24" height="24" onload="document.querySelector(\'#legacy-loaded\').textContent=\'loaded\'"/></svg>' +
    '<script type="module" src="./main.js"></script>';
  try {
    // Routing disables Chromium's HTTP cache. The unit regression proves
    // cache-mode behavior; this checks fresh graph rendering and request scope.
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (url === selectedUrl || url === otherUrl) {
        const path = url === selectedUrl ? 'selected/index.html' : 'other/index.html';
        await route.fulfill({ status: 200, contentType: 'text/html', body: githubBlobFixture(html('cached'), commit, path) });
        return;
      }
      if (url.startsWith(rawBase + '/')) {
        const path = url.slice(rawBase.length + 1);
        requests.push(path);
        const reload = retrying && path.startsWith('selected/');
        const name = path.split('/').pop();
        const version = reload ? 'fresh' : 'cached';
        if (path === 'selected/recover.png' && !reload) {
          await route.fulfill({ status: 400, body: 'resource unavailable' }); return;
        }
        const body = name === 'index.html' ? html(version) :
          name === 'diagram.svg' ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="' + (reload ? 'lime' : 'red') + '"/></svg>' :
          name === 'theme.css' ? '@import "./nested.css"; @font-face { font-family: report; src: url("./font.woff2") }' :
          name === 'nested.css' ? 'h1 { color: ' + (reload ? 'rgb(4, 5, 6)' : 'rgb(1, 2, 3)') + '; background: url("./background.png") }' :
          name === 'main.js' ? 'import { value } from "./child.js"; import("./lazy.js").then(() => document.querySelector("#module").textContent = value);' :
          name === 'child.js' || name === 'lazy.js' ? 'export const value = "' + version + '";' : version;
        await route.fulfill({ status: 200, contentType: name?.endsWith('.css') ? 'text/css' : name?.endsWith('.js') ? 'application/javascript' : name?.endsWith('.html') ? 'text/html' : 'application/octet-stream', headers: { 'cache-control': 'public, max-age=3600' }, body });
        return;
      }
      if (url.startsWith('chrome-extension:')) { await route.continue(); return; }
      await route.abort();
    });
    await page.goto(selectedUrl);
    const selected = page.locator('.gh-html-preview-container');
    await selected.getByText('View resource issues', { exact: true }).click();
    await expect(selected.getByRole('button', { name: 'Retry' })).toBeVisible();
    await unrelated.goto(otherUrl);
    const other = unrelated.locator('.gh-html-preview-container');
    await expect(other.locator('iframe[title="Executable HTML preview"]').contentFrame().locator('#module')).toHaveText('cached');
    // Observe RequestInit in the extension isolated world without changing it.
    // Interception occurs before Chromium adds HTTP cache directives.
    const cdp = await context.newCDPSession(page);
    const worlds: number[] = [];
    cdp.on('Runtime.executionContextCreated', event => worlds.push(event.context.id));
    await cdp.send('Runtime.enable');
    let extensionWorld: number | undefined;
    for (const contextId of worlds) {
      const identity = await cdp.send('Runtime.evaluate', { contextId,
        expression: 'globalThis.chrome?.runtime?.id', returnByValue: true });
      if (identity.result.value === extensionId) extensionWorld = contextId;
    }
    expect(extensionWorld).toBeDefined();
    await cdp.send('Runtime.evaluate', { contextId: extensionWorld, expression:       'globalThis.retryRequests = []; const originalFetch = globalThis.fetch; globalThis.fetch = function(input, init) { retryRequests.push({ url: String(input), cache: init?.cache }); return originalFetch.call(this, input, init); }' });
    const start = requests.length;
    retrying = true;
    await selected.getByRole('button', { name: 'Retry' }).click();
    const frame = selected.locator('iframe[title="Executable HTML preview"]').contentFrame();
    await expect(frame.locator('#version')).toHaveText('fresh');
    await expect(frame.locator('#module')).toHaveText('fresh');
    await expect(frame.locator('h1')).toHaveCSS('color', 'rgb(4, 5, 6)');
    await expect(frame.locator('#chart')).toHaveAttribute('src', 'data:image/png;base64,' + Buffer.from('fresh').toString('base64'));
    await expect(frame.locator('#modern-loaded')).toHaveText('loaded');
    await expect(frame.locator('#legacy-loaded')).toHaveText('loaded');
    await expect(frame.locator('#modern-image')).toHaveAttribute('href', /^data:image\/svg\+xml;base64,/);
    const svgState = await frame.locator('svg').evaluate(element => ({
      modern: element.querySelector('#modern-image')!.getAttribute('href'),
      legacy: element.querySelector('#legacy-image')!.getAttributeNS('http://www.w3.org/1999/xlink', 'href'),
      localWidth: (element.querySelector('#local-use') as SVGGraphicsElement).getBBox().width,
    }));
    expect(svgState.legacy).toBe(svgState.modern);
    expect(Buffer.from(svgState.modern!.split(',')[1], 'base64').toString()).toContain('fill="lime"');
    expect(svgState.localWidth).toBe(12);
    await expect(selected.getByRole('button', { name: 'Retry' })).toHaveCount(0);
    const observed = await cdp.send('Runtime.evaluate', { contextId: extensionWorld,
      expression: 'retryRequests', returnByValue: true });
    expect(observed.result.value).toHaveLength(11);
    expect(observed.result.value.every((request: { url: string; cache: string }) =>
      request.cache === 'reload' && request.url.startsWith(rawBase + '/selected/'))).toBe(true);
    expect(requests.slice(start).every(path => path.startsWith('selected/'))).toBe(true);
    expect(requests.slice(start).sort()).toEqual([
      'index.html', 'theme.css', 'nested.css', 'font.woff2', 'background.png', 'chart.png', 'recover.png', 'diagram.svg', 'main.js', 'child.js', 'lazy.js',
    ].map(name => 'selected/' + name).sort());
    await expect(other.locator('iframe[title="Executable HTML preview"]').contentFrame().locator('#version')).toHaveText('cached');
    const normalStart = requests.length;
    await unrelated.reload();
    await expect(other.locator('iframe[title="Executable HTML preview"]').contentFrame().locator('#module')).toHaveText('cached');
    expect(requests.slice(normalStart).every(path => path.startsWith('other/'))).toBe(true);
  } finally {
    await context.close();
  }
});


test('Retry diagnoses repository external SVG use instead of emitting non-rendering data URLs', async () => {
  const { context, page } = await launchWithExtension();
  const sprite = '<svg xmlns="http://www.w3.org/2000/svg"><rect id="box" width="24" height="24"/></svg>';
  const dataUse = 'data:image/svg+xml;base64,' + Buffer.from(sprite).toString('base64') + '#box';
  const html = '<img src="./missing.png"><svg xmlns:xlink="http://www.w3.org/1999/xlink">' +
    '<defs><rect id="box" width="24" height="24"/></defs>' +
    '<use id="local" href="#box"/><use id="legacy-local" xlink:href="#box"/>' +
    '<use id="repo" href="./symbols.svg#box"/>' +
    '<use id="repo-legacy" xlink:href="./symbols.svg#box"/>' +
    '<use id="data-use" href="' + dataUse + '"/>' +
    '<use id="external" href="https://external.example/symbols.svg#box"/></svg>';
  try {
    const requested = await routeProductFixtures(context, html);
    await page.goto(blobUrl);
    const container = page.locator('.gh-html-preview-container');
    await container.getByText('View resource issues', { exact: true }).click();
    await container.getByRole('button', { name: 'Retry' }).click();
    await expect(container.getByText(/Embed the SVG symbols in this HTML/)).toHaveCount(2);
    const frame = container.locator('iframe[title="Executable HTML preview"]').contentFrame();
    await expect(frame.locator('#repo')).not.toHaveAttribute('href');
    await expect(frame.locator('#repo-legacy')).not.toHaveAttribute('xlink:href');
    await expect(frame.locator('#data-use')).toHaveAttribute('href', dataUse);
    await expect(frame.locator('#external')).toHaveAttribute('href', 'https://external.example/symbols.svg#box');
    const widths = await frame.locator('svg').evaluate(svg => Array.from(svg.querySelectorAll('use')).map(use => [use.id, use.getBBox().width]));
    expect(Object.fromEntries(widths)).toEqual({ local: 24, 'legacy-local': 24, repo: 0, 'repo-legacy': 0, 'data-use': 0, external: 0 });
    expect(requested).not.toContain(rawBase + '/reports/weekly/symbols.svg');
  } finally {
    await context.close();
  }
});
