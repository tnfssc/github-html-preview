// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://github.com/octo/demo/pull/1/files"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPreferences: vi.fn(), savePreferences: vi.fn(), watchPreferences: vi.fn(),
  fetchFile: vi.fn(), fetchMetadata: vi.fn(),
}));
vi.mock('../utils/storage', () => ({
  enabledStorage: { getValue: async () => true, watch: () => () => {} },
  comparisonPreferencesStorage: {
    getValue: mocks.getPreferences, setValue: mocks.savePreferences, watch: mocks.watchPreferences,
  },
  purgeLegacyCredentials: async () => {},
}));
vi.mock('wxt/browser', () => ({ browser: { runtime: { getURL: (url: string) => url } } }));
vi.mock('../utils/github', () => ({
  parseHtmlDiffUrl: (url: string) => {
    const number = /\/pull\/(\d+)\/files/.exec(url)?.[1];
    return number ? { kind: 'pull', owner: 'octo', repo: 'demo', pullNumber: number } : null;
  },
  parseBlobUrl: () => null, fetchRepositoryFile: mocks.fetchFile,
}));
vi.mock('../utils/debug', () => ({ debugLog: () => {}, debugError: () => {} }));
vi.mock('../utils/fetchWithRetry', () => ({ fetchWithRetry: mocks.fetchMetadata }));
vi.mock('../utils/resolveHtml', () => ({
  resolveHtml: async () => ({ resources: { failed: 0, skipped: 0 } }),
}));
vi.mock('../utils/renderer', () => ({
  renderExecutablePreview: (area: HTMLElement) => {
    const frame = document.createElement('iframe');
    area.replaceChildren(frame);
    return { destroy: () => frame.remove(), setScroll: () => {}, post: () => {} };
  },
}));
vi.mock('../utils/prAnnotations', () => ({
  PullAnnotationSession: class { anchors = []; onUpdate() {} async refresh() {} },
  encodeComposeHash: () => '', injectConversationJumpButtons: () => () => {},
}));
vi.mock('../utils/annotations', () => ({
  ANCHOR_ACTIVATE_MESSAGE: 'activate', ANCHOR_FOCUS_MESSAGE: 'focus',
  ANCHOR_FOCUSED_MESSAGE: 'focused', ANCHOR_PROPOSE_MESSAGE: 'propose',
  ANCHORS_MESSAGE: 'anchors', ANCHORS_REQUEST_MESSAGE: 'request', encodeAnchorComment: () => '',
}));

const preferences = (mode = 'split') => ({ mode, viewport: 'responsive', syncScroll: true });
const baseSha = 'a'.repeat(40);
const headSha = 'b'.repeat(40);
let cleanup: (() => void) | undefined;
let preferenceWatcher: (value: ReturnType<typeof preferences>) => void;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function page(status = 'MODIFIED', number = '1') {
  history.replaceState(null, '', '/octo/demo/pull/' + number + '/files');
  document.body.innerHTML = '<div id="files"><div class="file" data-path="index.html"><div class="file-header"><div class="file-actions"></div></div><div class="js-file-content">code</div></div></div>';
  const script = document.createElement('script');
  script.type = 'application/json';
  script.dataset.target = 'react-app.embeddedData';
  script.textContent = JSON.stringify({ payload: { pullRequestsChangesRoute: {
    pullRequest: {
      number: Number(number),
      comparison: { baseOid: baseSha, headOid: headSha },
      headRepositoryOwnerLogin: 'octo', headRepositoryName: 'demo',
    },
    diffContents: [{ path: 'index.html', status }],
  } } });
  document.body.append(script);
}
const listeners: (() => void)[] = [];
async function mount() {
  vi.stubGlobal('defineContentScript', (definition: unknown) => definition);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const { default: entrypoint } = await import('../entrypoints/pr.content');
  entrypoint.main({
    addEventListener: (target: EventTarget, event: string, listener: EventListener) => {
      target.addEventListener(event, listener);
      listeners.push(() => target.removeEventListener(event, listener));
    },
    onInvalidated: (callback: () => void) => { cleanup = callback; },
  } as never);
  await settle();
}
async function settle() { await vi.advanceTimersByTimeAsync(100); }
const button = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
  .find((element) => element.textContent === label)!;
const panel = () => document.querySelector<HTMLElement>('.gh-html-preview-pr-rich')!;
const comparison = () => panel().lastElementChild as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  mocks.getPreferences.mockResolvedValue(preferences());
  mocks.savePreferences.mockResolvedValue(undefined);
  mocks.watchPreferences.mockImplementation((callback) => { preferenceWatcher = callback; return () => {}; });
  mocks.fetchFile.mockResolvedValue({ text: '<h1>Hello</h1>', authenticated: false });
  page();
});
afterEach(() => {
  cleanup?.(); cleanup = undefined;
  listeners.splice(0).forEach((remove) => remove());
  vi.useRealTimers(); vi.clearAllMocks(); vi.unstubAllGlobals();
});

describe('PR HTML view loading', () => {
  it('waits for saved Code preference even if navigation fires during bootstrap', async () => {
    const stored = deferred<ReturnType<typeof preferences>>();
    mocks.getPreferences.mockReturnValue(stored.promise);
    await mount();
    window.dispatchEvent(new Event('wxt:locationchange'));
    await settle();
    expect(document.querySelector('.gh-html-preview-pr-controls')).toBeNull();
    stored.resolve(preferences('source'));
    await settle();
    expect(button('Code').getAttribute('aria-selected')).toBe('true');
    expect(panel().style.display).toBe('none');
    expect(mocks.fetchFile).not.toHaveBeenCalled();
    expect(mocks.fetchMetadata).not.toHaveBeenCalled();
    expect(mocks.savePreferences).not.toHaveBeenCalled();
  });

  it('does not overwrite a newer watcher value with a stale bootstrap read', async () => {
    const stored = deferred<ReturnType<typeof preferences>>();
    mocks.getPreferences.mockReturnValue(stored.promise);
    await mount();
    preferenceWatcher(preferences('source'));
    stored.resolve(preferences('split'));
    await settle();
    expect(button('Code').getAttribute('aria-selected')).toBe('true');
    expect(mocks.fetchFile).not.toHaveBeenCalled();
  });

  it.each(['ADDED', 'DELETED'])('loads %s without split placeholders or nonexistent-side fetches', async (status) => {
    page(status);
    const source = deferred<{ text: string; authenticated: boolean }>();
    mocks.fetchFile.mockReturnValue(source.promise);
    await mount();
    expect(button('Preview').getAttribute('aria-selected')).toBe('true');
    expect(panel().querySelector('[role="status"]')?.textContent).toBe('Loading…');
    expect(comparison().style.display).toBe('none');
    expect(Array.from(comparison().children).every((pane) => (pane as HTMLElement).style.display === 'none')).toBe(true);
    expect(mocks.fetchFile).toHaveBeenCalledTimes(1);
    expect(mocks.fetchFile.mock.calls[0][0].ref).toBe(status === 'ADDED' ? headSha : baseSha);
    source.resolve({ text: '<p>Loaded</p>', authenticated: false });
    await settle();
    expect(panel().querySelectorAll('iframe')).toHaveLength(1);
    expect(Array.from(comparison().children).filter((pane) => (pane as HTMLElement).style.display !== 'none')).toHaveLength(1);
    button('Code').click(); button('Preview').click();
    await settle();
    expect(Array.from(comparison().children).filter((pane) => (pane as HTMLElement).style.display !== 'none')).toHaveLength(1);
    expect(mocks.fetchFile).toHaveBeenCalledTimes(1);
  });

  it('keeps real modified two-side previews without saving automatic defaults', async () => {
    await mount();
    expect(panel().querySelectorAll('iframe')).toHaveLength(2);
    expect(Array.from(comparison().children).every((pane) => (pane as HTMLElement).style.display === 'flex')).toBe(true);
    expect(mocks.savePreferences).not.toHaveBeenCalled();
    expect(mocks.fetchMetadata).not.toHaveBeenCalled();
  });

  it('hides all modified-file panes while loading and restarts rapid Code → Preview toggles', async () => {
    let requests = 0;
    mocks.fetchFile.mockImplementation((_ref, signal: AbortSignal) => {
      requests += 1;
      if (requests > 2) return Promise.resolve({ text: '<p>Done</p>', authenticated: false });
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
      });
    });
    await mount();
    expect(comparison().style.display).toBe('none');
    button('Code').click(); button('Preview').click();
    await settle();
    expect(panel().style.display).toBe('flex');
    expect(panel().querySelectorAll('iframe')).toHaveLength(2);
    expect(mocks.fetchFile).toHaveBeenCalledTimes(4);
  });

  it('does not use a previous PR payload to suppress a side on SPA navigation', async () => {
    page('ADDED', '1');
    history.replaceState(null, '', '/octo/demo/pull/2/files');
    const side = (sha: string) => ({
      sha, repo: { full_name: 'octo/demo', private: false },
    });
    mocks.fetchMetadata.mockResolvedValue({
      ok: true, json: async () => ({ base: side('c'.repeat(40)), head: side('d'.repeat(40)) }),
    });
    await mount();
    expect(mocks.fetchMetadata).toHaveBeenCalledTimes(1);
    expect(mocks.fetchFile).toHaveBeenCalledTimes(2);
    expect(panel().querySelectorAll('iframe')).toHaveLength(2);
  });

  it('uses explicit choices immediately on the next PR and consumes external preference updates', async () => {
    await mount();
    button('Code').click();
    page('MODIFIED', '2'); window.dispatchEvent(new Event('wxt:locationchange'));
    await settle();
    expect(button('Code').getAttribute('aria-selected')).toBe('true');
    button('Preview').click();
    page('MODIFIED', '3'); window.dispatchEvent(new Event('wxt:locationchange'));
    await settle();
    expect(button('Preview').getAttribute('aria-selected')).toBe('true');
    preferenceWatcher(preferences('source'));
    page('MODIFIED', '4'); window.dispatchEvent(new Event('wxt:locationchange'));
    await settle();
    expect(button('Code').getAttribute('aria-selected')).toBe('true');
    expect(mocks.savePreferences.mock.calls.map(([value]) => value.mode)).toEqual(['source', 'split']);
  });
});
