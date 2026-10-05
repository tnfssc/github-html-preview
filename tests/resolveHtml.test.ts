// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resolveHtml,
  resolveRepositoryUrl,
  transformSrcset,
} from '../utils/resolveHtml';
import type { RepoRef } from '../utils/types';

const repoRef: RepoRef = {
  owner: 'acme',
  repo: 'reports',
  ref: '0123456789abcdef0123456789abcdef01234567',
  path: 'reports/weekly/index.html',
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});


// Deferred responses expose request starts without timing assertions or sleeps.
function deferredRepositoryFetch() {
  const requests = new Map<string, {
    url: string;
    resolve: (response: Response) => void;
  }>();
  const starts = new Map<string, ReturnType<typeof Promise.withResolvers<void>>>();
  const started = (name: string) => {
    let event = starts.get(name);
    if (!event) {
      event = Promise.withResolvers<void>();
      starts.set(name, event);
    }
    return event;
  };
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const name = new URL(url).pathname.split('/').pop()!;
    const { promise, resolve } = Promise.withResolvers<Response>();
    requests.set(name, { url, resolve });
    started(name).resolve();
    return promise;
  }) as typeof fetch;
  return {
    requests,
    waitFor: (name: string) => started(name).promise,
    respond: (name: string, body: string) => {
      const request = requests.get(name)!;
      const response = new Response(body, {
        headers: { 'content-type': name.endsWith('.css') ? 'text/css' : 'application/javascript' },
      });
      Object.defineProperty(response, 'url', { value: request.url });
      request.resolve(response);
    },
  };
}

describe('resolveRepositoryUrl', () => {
  it('models repository-root, relative, fragment, query, and external URLs', () => {
    expect(resolveRepositoryUrl('/assets/site.css', repoRef)).toMatchObject({
      kind: 'repo',
      path: 'assets/site.css',
    });
    expect(resolveRepositoryUrl('../images/chart.png', repoRef)).toMatchObject({
      kind: 'repo',
      path: 'reports/images/chart.png',
    });
    expect(resolveRepositoryUrl('#summary', repoRef)).toEqual({
      kind: 'fragment',
      value: '#summary',
    });
    expect(resolveRepositoryUrl('?print=1', repoRef)).toMatchObject({
      kind: 'repo',
      path: 'reports/weekly/index.html',
      search: '?print=1',
    });
    expect(resolveRepositoryUrl('//cdn.example.com/x.js', repoRef)).toEqual({
      kind: 'external',
      value: 'https://cdn.example.com/x.js',
    });
  });
});

describe('resolver errors', () => {
  it('aborts outstanding resolution', async () => {
    const controller = new AbortController();
    globalThis.fetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) => {
        const { promise, reject } = Promise.withResolvers<Response>();
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
        return promise;
      },
    ) as typeof fetch;

    const pending = resolveHtml('<link rel="stylesheet" href="slow.css">', {
      target: 'sandbox',
      repoRef,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('omits oversized resources with actionable diagnostics', async () => {
    vi.stubGlobal(
      'location',
      new URL('https://github.com/acme/reports/blob/main/index.html'),
    );
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const response = new Response('oversized', {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
      Object.defineProperty(response, 'url', { value: String(input) });
      return response;
    }) as typeof fetch;

    const result = await resolveHtml('<img id="large" src="large.png">', {
      target: 'sandbox-private',
      repoRef,
      limits: { maxResourceBytes: 4 },
    });
    const doc = new DOMParser().parseFromString(result.html, 'text/html');
    expect(doc.querySelector('#large')?.hasAttribute('src')).toBe(false);
    expect(result.resources.failed).toBe(1);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        level: 'error',
        code: 'resource-fetch-failed',
        message: 'Repository resource exceeds 4 byte limit.',
        url: 'large.png',
      }),
    ]);
  });
});

describe('srcset', () => {
  it('preserves data URLs containing commas and descriptors', async () => {
    const output = await transformSrcset(
      'data:image/png;base64,AAAA 1x, image@2x.png 2x',
      async (url) => `safe:${url}`,
    );
    expect(output).toBe(
      'safe:data:image/png;base64,AAAA 1x, safe:image@2x.png 2x',
    );
  });
});

describe('resource loading concurrency', () => {
  it('starts public CSS and script entries together, preserving authored and module-map order', async () => {
    const fetches = deferredRepositoryFetch();
    const pending = resolveHtml(
      `<link id="sheet" rel="stylesheet" href="site.css">
       <script type="importmap">{"imports":{"authored":"ignored"}}</script>
       <script id="first" src="first.js"></script>
       <script id="inline">globalThis.inline = true;</script>
       <script id="second" src="second.js" defer></script>
       <script id="module-first" type="module" src="module-first.js"></script>
       <script id="module-second" type="module" src="module-second.js"></script>`,
      { target: 'sandbox', repoRef },
    );
    // No response is released until all independent entries have started.
    await Promise.all(['site.css', 'first.js', 'second.js', 'module-first.js', 'module-second.js'].map(fetches.waitFor));
    fetches.respond('module-second.js', 'import "./dependency.js"; globalThis.secondModule = true;');
    await fetches.waitFor('dependency.js');
    fetches.respond('dependency.js', 'export const value = 42;');
    fetches.respond('second.js', 'globalThis.second = true;');
    fetches.respond('module-first.js', 'import "./dependency.js"; globalThis.firstModule = true;');
    fetches.respond('site.css', '.sheet { color: red; }');
    fetches.respond('first.js', 'globalThis.first = true;');

    const result = await pending;
    const doc = new DOMParser().parseFromString(result.html, 'text/html');
    expect(Array.from(doc.querySelectorAll('script[id]'), (script) => script.id)).toEqual([
      'first', 'inline', 'second', 'module-first', 'module-second',
    ]);
    expect(decodeDataUrl(doc.querySelector('#first')!.getAttribute('src')!)).toBe('globalThis.first = true;');
    expect(decodeDataUrl(doc.querySelector('#second')!.getAttribute('src')!)).toBe('globalThis.second = true;');
    expect(doc.querySelector('#second')!.hasAttribute('defer')).toBe(true);
    expect(doc.querySelector('#inline')!.textContent).toBe('globalThis.inline = true;');
    expect(decodeDataUrl(doc.querySelector('#sheet')!.getAttribute('href')!)).toContain('.sheet { color: red; }');
    const maps = doc.querySelectorAll('script[type="importmap"]');
    expect(maps).toHaveLength(1);
    const imports = JSON.parse(maps[0]!.textContent!).imports;
    const virtualRoot = 'https://private-preview.invalid/reports/weekly/';
    expect(Object.keys(imports).slice(1)).toEqual([
      virtualRoot + 'dependency.js', virtualRoot + 'module-first.js', virtualRoot + 'module-second.js',
    ]);
    expect(doc.querySelector('#module-first')!.getAttribute('src')).toBe(imports[virtualRoot + 'module-first.js']);
    expect(doc.querySelector('#module-second')!.getAttribute('src')).toBe(imports[virtualRoot + 'module-second.js']);
    expect(decodeDataUrl(imports[virtualRoot + 'module-first.js'])).toContain(virtualRoot + 'dependency.js');
    expect(result.resources.fetched).toBe(6);
    expect(globalThis.fetch).toHaveBeenCalledTimes(6); // Shared module still deduplicates.
    expect(result.diagnostics).toEqual([]);
  });

  it('starts private embedded stylesheet imports together without changing cascade order', async () => {
    vi.stubGlobal('location', new URL('https://github.com/acme/reports/blob/main/index.html'));
    const fetches = deferredRepositoryFetch();
    const pending = resolveHtml(
      '<style id="first">@import "first.css";</style><style id="second">@import "second.css";</style>',
      { target: 'sandbox-private', repoRef },
    );
    await Promise.all(['first.css', 'second.css'].map(fetches.waitFor));
    fetches.respond('second.css', '.shared { color: blue; }');
    fetches.respond('first.css', '.shared { color: red; }');
    const result = await pending;
    const doc = new DOMParser().parseFromString(result.html, 'text/html');
    expect(Array.from(doc.querySelectorAll('style'), (style) => [style.id, style.textContent])).toEqual([
      ['first', '.shared { color: red; }'], ['second', '.shared { color: blue; }'],
    ]);
    expect(Array.from(fetches.requests.values(), ({ url }) => url)).toEqual([
      `https://github.com/acme/reports/raw/${repoRef.ref}/reports/weekly/first.css`,
      `https://github.com/acme/reports/raw/${repoRef.ref}/reports/weekly/second.css`,
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it('enforces the total byte budget across concurrent completions', async () => {
    const fetches = deferredRepositoryFetch();
    const pending = resolveHtml(
      '<script id="first" src="first.js"></script><script id="second" src="second.js"></script>',
      { target: 'sandbox', repoRef, limits: { maxTotalBytes: 6 } },
    );
    await Promise.all(['first.js', 'second.js'].map(fetches.waitFor));
    fetches.respond('second.js', '1234');
    fetches.respond('first.js', 'abcd');
    const result = await pending;
    const doc = new DOMParser().parseFromString(result.html, 'text/html');
    expect(doc.querySelector('#first')).toBeNull();
    expect(decodeDataUrl(doc.querySelector('#second')!.getAttribute('src')!)).toBe('1234');
    expect(result.resources).toMatchObject({ fetched: 1, bytes: 4, failed: 1 });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'resource-fetch-failed',
        message: 'total resources exceed 6 byte limit',
        url: 'first.js',
      }),
    ]);
  });

  it.each(['sandbox', 'sandbox-private'] as const)('respects the loader concurrency limit for %s scripts', async (target) => {
    vi.stubGlobal('location', new URL('https://github.com/acme/reports/blob/main/index.html'));
    const fetches = deferredRepositoryFetch();
    const pending = resolveHtml(
      '<script src="first.js"></script><script src="second.js"></script><script src="third.js"></script>',
      { target, repoRef, limits: { concurrency: 2 } },
    );
    await Promise.all(['first.js', 'second.js'].map(fetches.waitFor));
    expect(Array.from(fetches.requests.keys())).toEqual(['first.js', 'second.js']);
    fetches.respond('second.js', 'globalThis.second = true;');
    // A released slot starts the third script while the first is still pending.
    await fetches.waitFor('third.js');
    fetches.respond('third.js', 'globalThis.third = true;');
    fetches.respond('first.js', 'globalThis.first = true;');
    const result = await pending;
    const doc = new DOMParser().parseFromString(result.html, 'text/html');
    expect(Array.from(doc.querySelectorAll('script[src]'), (script) => decodeDataUrl(script.getAttribute('src')!))).toEqual([
      'globalThis.first = true;', 'globalThis.second = true;', 'globalThis.third = true;',
    ]);
    expect(result.resources.fetched).toBe(3);
    expect(result.diagnostics).toEqual([]);
  });
});

describe('sandbox preview', () => {
  it('embeds public repository stylesheets while preserving executable scripts and rewriting resource URLs', async () => {
    const resources: Record<string, { body: string; type: string }> = {
      [`https://raw.githubusercontent.com/acme/reports/${repoRef.ref}/assets/site.css`]:
        {
          body: '@import "./theme.css"; .linked { background: url("./linked.png") }',
          type: 'text/css',
        },
      [`https://raw.githubusercontent.com/acme/reports/${repoRef.ref}/assets/theme.css`]:
        {
          body: '.theme { background: url("./theme.png") }',
          type: 'text/css',
        },
      [`https://raw.githubusercontent.com/acme/reports/${repoRef.ref}/assets/linked.png`]:
        { body: 'linked', type: 'image/png' },
      [`https://raw.githubusercontent.com/acme/reports/${repoRef.ref}/assets/theme.png`]:
        { body: 'theme', type: 'image/png' },
      [`https://raw.githubusercontent.com/acme/reports/${repoRef.ref}/reports/weekly/classic.js`]:
        {
          body: 'globalThis.classicLoaded = true;',
          type: 'application/javascript',
        },
      [`https://raw.githubusercontent.com/acme/reports/${repoRef.ref}/reports/weekly/app.js`]:
        {
          body:
            'import React from "react"; import "./dependency.js"; globalThis.moduleLoaded = React;',
          type: 'application/javascript',
        },
      [`https://raw.githubusercontent.com/acme/reports/${repoRef.ref}/reports/weekly/dependency.js`]:
        {
          body: 'globalThis.dependencyLoaded = true;',
          type: 'application/javascript',
        },
    };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const resource = resources[String(input)];
      return resource
        ? new Response(resource.body, {
            headers: { 'content-type': resource.type },
          })
        : new Response('missing', { status: 404 });
    }) as typeof fetch;
    const result = await resolveHtml(
      `<!doctype html><html><head>
        <style>.inline { background: url("./inline.png") }</style>
        <link rel="stylesheet" href="/assets/site.css" media="print" title="Printable" disabled>
      </head><body>
        <a id="fragment" href="#summary">Summary</a>
        <a id="relative" href="./details.html?print=1#summary">Details</a>
        <img id="image" src="./chart.png">
        <img id="responsive" srcset="./chart.png 1x, /assets/chart@2x.png 2x">
        <form id="form" action="/submit"><button formaction="./confirm">Send</button></form>
        <script id="inline">globalThis.previewLoaded = true;</script>
        <script id="classic" src="./classic.js"></script>
        <script type="module" src="./app.js"></script>
      </body></html>`,
      { target: 'sandbox', repoRef },
    );

    const doc = new DOMParser().parseFromString(result.html, 'text/html');
    const cdnRoot =
      'https://cdn.jsdelivr.net/gh/acme/reports@0123456789abcdef0123456789abcdef01234567/';
    expect(doc.querySelector('base')?.href).toBe(
      `${cdnRoot}reports/weekly/`,
    );
    expect(
      JSON.parse(
        doc.querySelector('script[type="importmap"]')?.textContent ?? '{}',
      ).imports,
    ).toMatchObject({ [cdnRoot]: cdnRoot });
    const stylesheet = doc.querySelector<HTMLLinkElement>(
      'link[rel~="stylesheet"]',
    );
    expect(stylesheet?.getAttribute('href')).toMatch(
      /^data:text\/css;base64,/,
    );
    expect(stylesheet?.media).toBe('print');
    expect(stylesheet?.title).toBe('Printable');
    expect(stylesheet?.hasAttribute('disabled')).toBe(true);
    const stylesheetCss = decodeDataUrl(stylesheet?.href ?? '');
    expect(stylesheetCss).toContain('data:image/png;base64,bGlua2Vk');
    expect(stylesheetCss).toContain('data:image/png;base64,dGhlbWU=');
    expect(doc.querySelector('#inline')?.textContent).toContain(
      'globalThis.previewLoaded = true;',
    );
    expect(doc.querySelector('#image')?.getAttribute('src')).toBe(
      `${cdnRoot}reports/weekly/chart.png`,
    );
    expect(doc.querySelector('#responsive')?.getAttribute('srcset')).toBe(
      `${cdnRoot}reports/weekly/chart.png 1x, ${cdnRoot}assets/chart%402x.png 2x`,
    );
    expect(doc.querySelector('#relative')?.getAttribute('href')).toBe(
      `${cdnRoot}reports/weekly/details.html?print=1#summary`,
    );
    expect(doc.querySelector('#form')?.getAttribute('action')).toBe(
      `${cdnRoot}submit`,
    );
    expect(doc.querySelector('#form button')?.getAttribute('formaction')).toBe(
      `${cdnRoot}reports/weekly/confirm`,
    );
    expect(doc.querySelector('#classic')?.getAttribute('src')).toBe(
      'data:application/javascript;base64,Z2xvYmFsVGhpcy5jbGFzc2ljTG9hZGVkID0gdHJ1ZTs=',
    );
    expect(
      doc.querySelector('script[type="module"][src]')?.getAttribute('src'),
    ).toMatch(/^data:application\/javascript;base64,/);
    const publicModuleSource = decodeDataUrl(
      doc.querySelector('script[type="module"][src]')?.getAttribute('src') ??
        '',
    );
    expect(publicModuleSource).toContain('from "react"');
    expect(publicModuleSource).toContain(
      'https://private-preview.invalid/reports/weekly/dependency.js',
    );
    expect(doc.querySelector('#fragment')?.getAttribute('href')).toBe('#summary');
    const inlineCss = doc.querySelector('style')?.textContent ?? '';
    expect(inlineCss).toContain(
      `url("${cdnRoot}reports/weekly/inline.png")`,
    );
    expect(result.resources).toMatchObject({
      fetched: 7,
      inlined: 8,
      rewritten: 8,
      failed: 0,
    });
  });

  it('keeps fragment links in-document and sends repository links to GitHub', async () => {
    const result = await resolveHtml(
      '<h2 id="set-1">Set 1</h2><a id="fragment" href="#set-1">Set 1</a><a id="document" href="./details.html#part">Details</a>',
      {
        target: 'sandbox-private',
        repoRef,
        privateRepo: false,
      },
    );
    const doc = new DOMParser().parseFromString(result.html, 'text/html');
    expect(doc.querySelector('base')).toBeNull();
    expect(doc.querySelector('#fragment')?.getAttribute('href')).toBe('#set-1');
    expect(doc.querySelector('#document')?.getAttribute('href')).toBe(
      `https://github.com/acme/reports/blob/${repoRef.ref}/reports/weekly/details.html#part`,
    );
    expect(doc.querySelector('#document')?.getAttribute('target')).toBe('_blank');
    expect(doc.querySelector('#document')?.getAttribute('rel')).toBe(
      'noreferrer',
    );
    expect(result.html).not.toContain('cdn.jsdelivr.net');
  });

  it('packages private CSS, images, classic scripts, and module graphs through the GitHub session', async () => {
    vi.stubGlobal(
      'location',
      new URL('https://github.com/acme/reports/blob/main/index.html'),
    );
    const sessionPrefix =
      `https://github.com/acme/reports/raw/${repoRef.ref}/`;
    const resources: Record<string, { body: string; type: string }> = {
      [`${sessionPrefix}assets/private.css`]: {
        body: '.hero { background: url(\"./background.png\") }',
        type: 'text/plain',
      },
      [`${sessionPrefix}assets/background.png`]: {
        body: 'background',
        type: 'application/octet-stream',
      },
      [`${sessionPrefix}reports/weekly/chart.png`]: {
        body: 'chart',
        type: 'application/octet-stream',
      },
      [`${sessionPrefix}reports/weekly/classic.js`]: {
        body: 'globalThis.classicLoaded = true;',
        type: 'application/octet-stream',
      },
      [`${sessionPrefix}reports/weekly/main.js`]: {
        body: 'import { value } from \"./dependency.js\"; globalThis.moduleValue = value;',
        type: 'application/octet-stream',
      },
      [`${sessionPrefix}reports/weekly/dependency.js`]: {
        body: 'export const value = 42;',
        type: 'application/octet-stream',
      },
    };
    const requests: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      const resource = resources[url];
      const response = resource
        ? new Response(resource.body, {
            status: 200,
            headers: { 'content-type': resource.type },
          })
        : new Response('missing', { status: 404 });
      Object.defineProperty(response, 'url', { value: url });
      return response;
    }) as typeof fetch;

    const result = await resolveHtml(
      `<!doctype html><html><head>
        <link rel=\"stylesheet\" href=\"/assets/private.css\">
      </head><body>
        <img id=\"chart\" src=\"./chart.png\">
        <script id=\"inline\">globalThis.inlineScriptLoaded = true;</script>
        <script id=\"classic\" src=\"./classic.js\"></script>
        <script id=\"module\" type=\"module\" src=\"./main.js\"></script>
      </body></html>`,
      {
        target: 'sandbox-private',
        repoRef,
        privateRepo: true,
      },
    );

    const doc = new DOMParser().parseFromString(result.html, 'text/html');
    expect(
      decodeDataUrl(
        doc.querySelector<HTMLLinkElement>('link[rel~="stylesheet"]')?.href ??
          '',
      ),
    ).toContain(
      'data:image/png;base64,',
    );
    expect(doc.querySelector('#chart')?.getAttribute('src')).toMatch(
      /^data:image\/png;base64,/,
    );
    expect(doc.querySelector('#classic')?.getAttribute('src')).toMatch(
      /^data:application\/javascript;base64,/,
    );
    expect(doc.querySelector('#inline')?.textContent).toContain(
      'globalThis.inlineScriptLoaded = true;',
    );
    expect(doc.querySelector('#module')?.getAttribute('src')).toMatch(
      /^data:application\/javascript;base64,/,
    );
    const encodedModule =
      doc.querySelector('#module')?.getAttribute('src')?.split(',')[1] ?? '';
    const moduleSource = atob(encodedModule);
    expect(moduleSource).not.toContain('./dependency.js');
    expect(moduleSource).toContain(
      'https://private-preview.invalid/reports/weekly/dependency.js',
    );
    const importMap =
      doc.querySelector('script[type="importmap"]')?.textContent ?? '';
    expect(importMap).toContain('https://private-preview.invalid/reports/weekly/dependency.js');
    expect(importMap).toContain('data:application/javascript;base64,');
    expect(result.html).not.toContain('api.github.com');
    expect(requests).toHaveLength(6);
    expect(requests.every((url) => url.startsWith(sessionPrefix))).toBe(true);
    expect(result.resources.failed).toBe(0);
  });

  it('reports unavailable private resources without a token or GitHub session', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await resolveHtml('<img src="private.png">', {
      target: 'sandbox-private',
      repoRef,
    });
    expect(result.resources.failed).toBe(1);
    expect(result.diagnostics[0]?.message).toContain(
      'signed-in GitHub browser session',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rewrites inline module scripts and reports unresolvable specifiers', async () => {
    vi.stubGlobal(
      'location',
      new URL('https://github.com/acme/reports/blob/main/index.html'),
    );
    const sessionPrefix =
      `https://github.com/acme/reports/raw/${repoRef.ref}/`;
    const resources: Record<string, { body: string; type: string }> = {
      [`${sessionPrefix}reports/weekly/dep.js`]: {
        body: 'export const value = 42;',
        type: 'application/octet-stream',
      },
    };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const resource = resources[url];
      const response = resource
        ? new Response(resource.body, {
            status: 200,
            headers: { 'content-type': resource.type },
          })
        : new Response('missing', { status: 404 });
      Object.defineProperty(response, 'url', { value: url });
      return response;
    }) as typeof fetch;

    const result = await resolveHtml(
      `<!doctype html><html><body>
        <script type="module" id="inline-module">import { value } from "./dep.js"; globalThis.inlineValue = value;</script>
        <script type="module" id="broken-module">import { missing } from "./missing.js"; globalThis.broken = missing;</script>
      </body></html>`,
      { target: 'sandbox-private', repoRef, privateRepo: true },
    );

    const doc = new DOMParser().parseFromString(result.html, 'text/html');
    const inlineModule = doc.querySelector('#inline-module');
    expect(inlineModule?.textContent).toContain(
      'https://private-preview.invalid/reports/weekly/dep.js',
    );
    expect(inlineModule?.textContent).not.toContain('./dep.js');
    const importMap = JSON.parse(
      doc.querySelector('script[type="importmap"]')?.textContent ?? '{}',
    );
    const depDataUrl =
      importMap.imports['https://private-preview.invalid/reports/weekly/dep.js'];
    expect(depDataUrl).toMatch(/^data:application\/javascript;base64,/);
    expect(decodeDataUrl(depDataUrl)).toContain('export const value = 42;');

    const brokenModule = doc.querySelector('#broken-module');
    expect(brokenModule?.textContent).toContain('./missing.js');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        level: 'error',
        code: 'inline-module-failed',
      }),
    ]);
  });

  it('enforces encoded output limits before sandbox transport', async () => {
    await expect(
      resolveHtml(`<main>${'x'.repeat(512)}</main>`, {
        target: 'sandbox',
        repoRef,
        limits: { maxOutputBytes: 128 },
      }),
    ).rejects.toThrow('Resolved preview exceeds 128 byte output limit.');
  });

  it('resolves a large document within the local performance budget', async () => {
    const html = `<main>${'<section>report row</section>'.repeat(10_000)}</main>`;
    const result = await resolveHtml(html, {
      target: 'sandbox',
      repoRef,
    });

    expect(result.performance.outputBytes).toBeGreaterThan(200_000);
    expect(Number.isFinite(result.performance.resolveMs)).toBe(true);
  });
});

function decodeDataUrl(url: string): string {
  const encoded = url.split(',')[1] ?? '';
  return atob(encoded);
}
