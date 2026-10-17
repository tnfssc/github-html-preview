import { useEffect, useState } from 'react';
import { enabledStorage, purgeLegacyCredentials } from '@/utils/storage';
import logo from '@/assets/logo.svg';
import './App.css';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const EXAMPLE_FILE_URL =
  'https://github.com/tnfssc/github-html-preview/blob/develop/examples/demo/index.html';
const EXAMPLE_PR_URL =
  'https://github.com/tnfssc/github-html-preview/pull/28/files';

const steps = [
  { title: 'Open any .html file', body: 'Choose Preview next to Code.' },
  {
    title: 'Review pull requests',
    body: 'Before and after render side by side.',
  },
  {
    title: 'Go full screen',
    body: 'Run the page in its own tab.',
  },
];

export default function App(): React.JSX.Element {
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState('');
  const version = browser.runtime.getManifest().version;

  useEffect(() => {
    async function load() {
      try {
        const [storedEnabled] = await Promise.all([
          enabledStorage.getValue(),
          purgeLegacyCredentials(),
        ]);
        setEnabled(storedEnabled);
        setLoaded(true);
      } catch {
        setSaveState('error');
        setMessage('Could not load settings.');
      }
    }
    void load();
  }, []);

  async function updateEnabled(next: boolean) {
    setEnabled(next);
    setSaveState('saving');
    try {
      await enabledStorage.setValue(next);
      setSaveState('saved');
      setMessage('Saved');
    } catch {
      setEnabled(!next);
      setSaveState('error');
      setMessage('Could not save setting.');
    }
  }

  return (
    <div className="popup">
      <header className="brand">
        <img src={logo} alt="" width={36} height={36} />
        <div>
          <h1>GitHub HTML Preview</h1>
          <p>See the page, not the markup.</p>
        </div>
      </header>

      <label className={`toggle${enabled ? ' is-on' : ''}`}>
        <span className="toggle-text">
          <span className="toggle-title" id="toggle-title">
            Show previews
          </span>
          <span className="toggle-hint" id="toggle-hint">
            {enabled
              ? 'On for HTML files and pull requests.'
              : 'Off. GitHub shows source only.'}
          </span>
        </span>
        <input
          type="checkbox"
          className="switch"
          checked={enabled}
          aria-labelledby="toggle-title"
          aria-describedby="toggle-hint"
          onChange={(event) => void updateEnabled(event.target.checked)}
          disabled={!loaded || saveState === 'saving'}
        />
      </label>

      <div className="actions">
        <a
          className="action action-primary"
          href={EXAMPLE_FILE_URL}
          target="_blank"
          rel="noreferrer"
        >
          Open example
        </a>
        <a
          className="action"
          href={EXAMPLE_PR_URL}
          target="_blank"
          rel="noreferrer"
        >
          Open example PR
        </a>
      </div>

      <ol className="steps">
        {steps.map((step, index) => (
          <li key={step.title}>
            <span className="step-index" aria-hidden="true">
              {index + 1}
            </span>
            <span>
              <strong>{step.title}</strong>
              <span>{step.body}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="notes">
        <p>
          <svg className="note-icon note-warning" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 1.5 15 14H1z" />
            <path className="note-glyph" d="M7.25 6h1.5v4h-1.5zM7.25 11h1.5v1.5h-1.5z" />
          </svg>
          <span>
            <strong>Previews run the file’s scripts.</strong> They run in an
            isolated frame but can reach the network. Only preview code you
            trust.
          </span>
        </p>
        <p>
          <svg className="note-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 7V5a4 4 0 0 1 8 0v2h1v8H3V7zm2 0h4V5a2 2 0 0 0-4 0z" />
          </svg>
          <span>
            <strong>Private repos use your GitHub sign-in.</strong> Finish
            organization SSO in the GitHub tab first. The extension never asks
            for or stores a personal access token.
          </span>
        </p>
        {import.meta.env.MODE === 'debug' && (
          <p>
            <svg className="note-icon" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="6" />
            </svg>
            <span>
              <strong>Diagnostic build.</strong> Open GitHub DevTools and
              extension-page DevTools, reproduce the problem, then copy console
              entries filtered by <code>[gh-html-preview:debug]</code>. Session
              cookies and file contents are never logged.
            </span>
          </p>
        )}
      </div>

      <footer className="footer">
        <span>v{version}</span>
        <span
          className={`status status-${saveState}`}
          role={saveState === 'error' ? 'alert' : 'status'}
        >
          {message}
        </span>
      </footer>
    </div>
  );
}
