// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractBlobPageData } from '../utils/github';

const oid = '0123456789abcdef0123456789abcdef01234567';
const oldPath = 'reports/weekly/index.html';
const nextPath = 'reports/daily/index.html';

function fixture(
  path: string,
  textarea?: string,
  isPrivate = false,
  nested = false,
) {
  document.body.replaceChildren();
  const script = document.createElement('script');
  script.type = 'application/json';
  script.dataset.target = 'react-app.embeddedData';
  const layout = {
    repo: { ownerLogin: 'acme', name: 'reports', isPrivate },
    refInfo: { currentOid: oid, name: 'main' },
    path,
  };
  script.textContent = JSON.stringify({
    payload: {
      ...(nested ? { codeViewLayoutRoute: layout } : layout),
      'codeViewBlobLayoutRoute.StyledBlob': {
        rawLines: ['<h1>Old embedded source</h1>'],
      },
    },
  });
  document.body.append(script);
  if (textarea !== undefined) {
    const source = document.createElement('textarea');
    source.setAttribute('aria-label', 'file content');
    source.value = textarea;
    document.body.append(source);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe.each([false, true])(
  'blob source ownership during SPA navigation (nested layout: %s)',
  (nested) => {
    it.each([undefined, '<h1>Old cursor source</h1>', '<h1>New cursor source</h1>'])(
      'fetches the current route rather than mixing retained metadata with cursor source %s',
      (textarea) => {
        vi.stubGlobal(
        'location',
        new URL('https://github.com/acme/reports/blob/main/' + nextPath),
      );
        fixture(oldPath, textarea, false, nested);
        expect(extractBlobPageData()).toEqual({
          html: null,
          repoRef: { owner: 'acme', repo: 'reports', ref: 'main', path: nextPath },
          isPrivate: false,
          source: 'url-fallback',
          diagnostic: expect.stringContaining('another file'),
        });
      },
    );

    it('keeps private access session-only when rejecting stale source', () => {
      vi.stubGlobal(
        'location',
        new URL('https://github.com/acme/reports/blob/main/' + nextPath),
      );
      fixture(oldPath, '<h1>Old private source</h1>', true, nested);
      expect(extractBlobPageData()).toMatchObject({ html: null, isPrivate: true });
    });

    it('still uses cursor source and the canonical commit for a matching file', () => {
      vi.stubGlobal(
        'location',
        new URL('https://github.com/acme/reports/blob/main/' + oldPath),
      );
      fixture(oldPath, '<h1>Current source</h1>', false, nested);
      expect(extractBlobPageData()).toMatchObject({
        html: '<h1>Current source</h1>',
        repoRef: { ref: oid, path: oldPath },
        source: 'code-view',
        diagnostic: null,
      });
    });
  },
);
