// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolveResult } from '../utils/types';

const mocks = vi.hoisted(() => {
  vi.stubGlobal('defineContentScript', (definition: unknown) => definition);
  vi.stubGlobal('browser', { runtime: { getURL: (path: string) => path } });
  return {
    getMode: vi.fn(), setMode: vi.fn(), getEnabled: vi.fn(), watchEnabled: vi.fn(),
    fetch: vi.fn(), resolve: vi.fn(), render: vi.fn(), destroy: vi.fn(),
    saveSnapshot: vi.fn(), removeSnapshot: vi.fn(),
  };
});

vi.mock('../utils/storage', () => ({
  blobViewModeStorage: { getValue: mocks.getMode, setValue: mocks.setMode },
  enabledStorage: { getValue: mocks.getEnabled, watch: mocks.watchEnabled },
  purgeLegacyCredentials: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../utils/github', async () => ({
  ...await vi.importActual('../utils/github'),
  fetchRepositoryFile: mocks.fetch,
}));
vi.mock('../utils/resolveHtml', () => ({ resolveHtml: mocks.resolve }));
vi.mock('../utils/renderer', () => ({ renderExecutablePreview: mocks.render }));
vi.mock('../utils/debug', () => ({ debugLog: vi.fn(), debugError: vi.fn() }));
vi.mock('../utils/previewSnapshot', () => ({
  savePreviewSnapshot: mocks.saveSnapshot,
  removePreviewSnapshot: mocks.removeSnapshot,
}));

import content from '../entrypoints/content';

const oid = '0123456789abcdef0123456789abcdef01234567';
const result: ResolveResult = {
  html: '<h1>Resolved</h1>', diagnostics: [],
  resources: { fetched: 0, inlined: 0, rewritten: 0, skipped: 0, failed: 0,
    bytes: 0, maxDepthReached: 0 },
  performance: { resolveMs: 0, outputBytes: 0 },
};
const cleanup: Array<() => void> = [];
let invalidate: () => void;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(path = 'first.html') {
  document.body.innerHTML =     '<div><header class="react-blob-view-header-sticky">' +
    '<ul class="SegmentedControl" aria-label="File view">' +
    '<li><button id="native-code">Code</button></li></ul></header>' +
    '<div id="code-view"><div class="react-code-lines"></div></div></div>';
  const data = document.createElement('script');
  data.type = 'application/json';
  data.dataset.target = 'react-app.embeddedData';
  data.textContent = JSON.stringify({ payload: {
    repo: { ownerLogin: 'acme', name: 'reports', isPrivate: false },
    refInfo: { currentOid: oid, name: 'main' }, path,
    'codeViewBlobLayoutRoute.StyledBlob': { rawLines: ['<h1>' + path + '</h1>'] },
  } });
  document.body.append(data);
}

function start() {
  content.main({
    addEventListener(target: EventTarget, type: string, listener: EventListener) {
      target.addEventListener(type, listener);
      cleanup.push(() => target.removeEventListener(type, listener));
    },
    onInvalidated(callback: () => void) { invalidate = callback; },
  } as never);
}

async function settle() {
  // Drain the storage -> resolve -> snapshot promise chain without real delays.
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

async function navigate(path: string, replace = true) {
  vi.stubGlobal('location', new URL('https://github.com/acme/reports/blob/main/' + path));
  if (replace) fixture(path);
  window.dispatchEvent(new Event('wxt:locationchange'));
  await vi.advanceTimersByTimeAsync(80);
  await settle();
}

function clickCode() { document.querySelector<HTMLButtonElement>('#native-code')!.click(); }
function clickPreview() {
  document.querySelector<HTMLButtonElement>('.gh-html-preview-tab button')!.click();
}
function isPreview() {
  return document.querySelector('.gh-html-preview-tab button')?.getAttribute('aria-selected') === 'true';
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal('location', new URL('https://github.com/acme/reports/blob/main/first.html'));
  fixture();
  mocks.getMode.mockResolvedValue('preview');
  mocks.setMode.mockResolvedValue(undefined);
  mocks.getEnabled.mockResolvedValue(true);
  mocks.watchEnabled.mockReturnValue(vi.fn());
  mocks.fetch.mockResolvedValue({ text: '<h1>Fetched current file</h1>' });
  mocks.resolve.mockResolvedValue(result);
  mocks.render.mockReturnValue({ destroy: mocks.destroy });
  mocks.saveSnapshot.mockResolvedValue('snapshot-id');
  mocks.removeSnapshot.mockResolvedValue(undefined);
});

afterEach(() => {
  invalidate?.();
  cleanup.splice(0).forEach((fn) => fn());
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('blob view choice', () => {
  it('loads the preference before any mount, including navigation while loading', async () => {
    const preference = deferred<'source' | 'preview'>();
    mocks.getMode.mockReturnValue(preference.promise);
    start();
    await navigate('second.html');
    expect(document.querySelector('.gh-html-preview-tab')).toBeNull();
    expect(mocks.resolve).not.toHaveBeenCalled();
    preference.resolve('source');
    await settle();
    expect(document.querySelector('.gh-html-preview-tab')).not.toBeNull();
    expect(isPreview()).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
    expect(mocks.setMode).not.toHaveBeenCalled();
  });

  it('defaults to Preview across files and non-HTML routes without saving defaults', async () => {
    start(); await settle();
    expect(isPreview()).toBe(true);
    expect(mocks.resolve).toHaveBeenCalledWith('<h1>first.html</h1>', expect.anything());
    await navigate('notes.txt');
    expect(document.querySelector('.gh-html-preview-tab')).toBeNull();
    await navigate('second.html');
    expect(isPreview()).toBe(true);
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
    expect(mocks.setMode).not.toHaveBeenCalled();
  });

  it('remembers native Code immediately, even before its write completes', async () => {
    const write = deferred<void>();
    mocks.setMode.mockReturnValue(write.promise);
    start(); await settle();
    clickCode();
    expect(mocks.setMode).toHaveBeenCalledWith('source');
    expect(isPreview()).toBe(false);
    await navigate('notes.txt');
    await navigate('second.html');
    expect(isPreview()).toBe(false);
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
    expect(mocks.render).toHaveBeenCalledTimes(1);
    write.resolve();
  });

  it('remembers explicit Preview and keeps it through same-file DOM replacement', async () => {
    mocks.getMode.mockResolvedValue('source');
    const write = deferred<void>();
    mocks.setMode.mockReturnValue(write.promise);
    start(); await settle();
    expect(mocks.resolve).not.toHaveBeenCalled();
    clickPreview(); await settle();
    expect(mocks.setMode).toHaveBeenCalledWith('preview');
    await navigate('first.html');
    expect(isPreview()).toBe(true);
    await navigate('second.html');
    expect(isPreview()).toBe(true);
    expect(mocks.setMode).toHaveBeenCalledTimes(1);
    write.resolve();
  });

  it('never previews retained source after the URL changes to another file', async () => {
    start(); await settle();
    await navigate('second.html', false);
    expect(mocks.fetch).toHaveBeenCalledWith(
      { owner: 'acme', repo: 'reports', ref: 'main', path: 'second.html' },
      expect.any(AbortSignal), { privateRepo: false, refresh: false },
    );
    expect(mocks.resolve).toHaveBeenLastCalledWith('<h1>Fetched current file</h1>',
      expect.objectContaining({ repoRef: expect.objectContaining({ path: 'second.html' }) }));
  });

  it('aborts pending resolution on Code and can start Preview again immediately', async () => {
    const first = deferred<ResolveResult>();
    const second = deferred<ResolveResult>();
    mocks.resolve.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    start(); await settle();
    const firstSignal = mocks.resolve.mock.calls[0][1].signal as AbortSignal;
    clickCode();
    expect(firstSignal.aborted).toBe(true);
    clickPreview(); await settle();
    first.resolve(result); await settle();
    expect(mocks.render).not.toHaveBeenCalled();
    clickPreview(); await settle();
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
    second.resolve(result); await settle();
    expect(mocks.render).toHaveBeenCalledTimes(1);
  });

  it('does not resolve resources after a pending source fetch finishes in Code', async () => {
    vi.stubGlobal('location', new URL('https://github.com/acme/reports/blob/main/second.html'));
    const fetch = deferred<{ text: string }>();
    mocks.fetch.mockReturnValue(fetch.promise);
    start(); await settle();
    clickCode();
    expect(mocks.fetch.mock.calls[0][1].aborted).toBe(true);
    fetch.resolve({ text: '<h1>Late source</h1>' }); await settle();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it('removes snapshots that finish saving after their route is torn down', async () => {
    const snapshot = deferred<string>();
    mocks.saveSnapshot.mockReturnValue(snapshot.promise);
    start(); await settle();
    await navigate('notes.txt');
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
    snapshot.resolve('late-snapshot'); await settle();
    expect(mocks.removeSnapshot).toHaveBeenCalledWith('late-snapshot');
  });

  it('coalesces repeated reconciliation signals without pushing the first mount back', async () => {
    mocks.getMode.mockResolvedValue('source');
    start(); await settle();
    fixture();
    window.dispatchEvent(new Event('wxt:locationchange'));
    await vi.advanceTimersByTimeAsync(40);
    window.dispatchEvent(new Event('wxt:locationchange'));
    await vi.advanceTimersByTimeAsync(40);
    expect(document.querySelector('.gh-html-preview-tab')).not.toBeNull();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.setMode).not.toHaveBeenCalled();
  });

  it('does not mount if invalidated before preference loading completes', async () => {
    const preference = deferred<'source' | 'preview'>();
    mocks.getMode.mockReturnValue(preference.promise);
    start(); invalidate();
    preference.resolve('preview'); await settle();
    expect(document.querySelector('.gh-html-preview-tab')).toBeNull();
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});


it('Retry fetches fresh HTML at the pinned commit instead of reusing embedded source', async () => {
  mocks.resolve.mockResolvedValueOnce({ ...result, resources: { ...result.resources, failed: 1 },
    diagnostics: [{ level: 'error', code: 'resource-fetch-failed', message: 'Failed image' }] });
  start(); await settle();
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.resolve.mock.calls[0][0]).toBe('<h1>first.html</h1>');
  const retry = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === 'Retry')!;
  retry.click(); await vi.advanceTimersByTimeAsync(1); await settle();
  expect(mocks.fetch).toHaveBeenCalledWith({ owner: 'acme', repo: 'reports', ref: oid, path: 'first.html' },
    expect.any(AbortSignal), { privateRepo: false, refresh: true });
  expect(mocks.resolve).toHaveBeenLastCalledWith('<h1>Fetched current file</h1>', expect.objectContaining({ refresh: true, repoRef: expect.objectContaining({ ref: oid }) }));
  expect(Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Retry')).toBe(false);
});
