// GitHub HTML Preview demo: script resolved from the same commit as index.html.
// Classic deferred script so it also runs when index.html is opened from disk.
// Draws folded ribbons with a WebGL fragment shader, then layers kinetic type,
// scroll-driven motion and a few live readouts on top. No dependencies.

const SCRIPT_URL = document.currentScript ? document.currentScript.src : '';
const root = document.documentElement;
const reduceMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduceMotion = reduceMotionQuery.matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

const state = {
  frames: 0,
  fps: 0,
  running: true,
  visible: !document.hidden,
  onScreen: true,
  scroll: 0,
  mouse: { x: 0.25, y: -0.05, tx: 0.25, ty: -0.05, active: 0, tActive: 0 },
  pulse: { x: 0, y: 0, start: -100 },
};

/* ------------------------------------------------------------------ */
/* Ribbon shader                                                       */
/* ------------------------------------------------------------------ */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uMouseOn;
uniform float uScroll;
uniform vec3 uPulse;
uniform float uWide;

const vec3 INK = vec3(0.078, 0.067, 0.165);
const vec3 VIOLET = vec3(0.149, 0.129, 0.267);
const vec3 APRICOT = vec3(1.0, 0.694, 0.478);
const vec3 PERSIMMON = vec3(1.0, 0.443, 0.310);
const vec3 CREAM = vec3(1.0, 0.92, 0.84);
const vec3 LILAC = vec3(0.56, 0.48, 0.95);
const int RIBBONS = 7;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float centerY(float x, float fi, float t) {
  float base = (fi - 3.0) * 0.085 * uWide;
  float y = base
    + 0.16 * sin(x * 1.15 + t * 0.32 + fi * 0.9)
    + 0.06 * sin(x * 2.7 - t * 0.47 + fi * 1.7)
    + 0.025 * sin(x * 5.3 + t * 0.8 + fi * 2.3);
  // Cursor pushes nearby ribbons apart.
  float dx = x - uMouse.x;
  float dy = y - uMouse.y;
  float infl = exp(-dx * dx * 9.0) * uMouseOn;
  y += infl * 0.11 * sign(dy) * exp(-abs(dy) * 7.0);
  // Tap ripple.
  float pt = uPulse.z;
  vec2 pp = vec2(x, y) - uPulse.xy;
  float pr = length(pp);
  y += 0.05 * sin(pr * 26.0 - pt * 9.0) * exp(-pr * 3.5) * exp(-pt * 1.4) * step(0.0, pt);
  return y;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - 0.5 * uRes) / uRes.y;
  float px = 1.0 / uRes.y;

  // Background: deep violet with a warm bloom on the right.
  float glow = smoothstep(1.2, 0.0, length((uv - vec2(0.45, 0.1)) * vec2(0.7, 1.1)));
  vec3 col = mix(INK, VIOLET, glow * 0.9);
  col += LILAC * 0.05 * smoothstep(0.9, 0.0, length(uv - vec2(-0.6, -0.5)));

  // Field rotation follows scroll; ribbons drift up and away.
  float ang = -0.42 + uScroll * 0.55;
  float ca = cos(ang), sa = sin(ang);
  vec2 shift = vec2(0.22 * uWide, -0.08 - uScroll * 0.35);
  vec2 p = mat2(ca, sa, -sa, ca) * (uv - shift);
  float t = uTime;

  for (int i = 0; i < RIBBONS; i++) {
    float fi = float(i);
    float depth = fi / float(RIBBONS - 1);
    float scale = mix(0.62, 1.12, depth);
    vec2 q = p / scale + vec2(fi * 0.37, 0.0);
    float x = q.x;

    float cy = centerY(x, fi, t);
    float slope = (centerY(x + 0.01, fi, t) - cy) / 0.01;
    float norm = inversesqrt(1.0 + slope * slope);

    float twist = x * (1.25 + 0.18 * fi) - t * (0.38 + 0.03 * fi) + fi * 2.1;
    float c = cos(twist);
    float s = sin(twist);
    float halfW = mix(0.022, 0.07, depth) * (0.16 + 0.84 * abs(c));
    float d = (q.y - cy) * norm / halfW;
    float aa = (1.6 * px / scale) / halfW;

    // Soft contact shadow on whatever is behind.
    float sh = exp(-pow((q.y - cy + 0.035) * norm / (halfW * 2.4 + 0.02), 2.0));
    col *= 1.0 - 0.38 * sh * mix(0.4, 1.0, depth);

    float a = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, abs(d));
    if (a > 0.0) {
      // Two-tone fold, like the logo: apricot face over persimmon underside.
      float face = smoothstep(-0.08, 0.08, c);
      vec3 rc = mix(PERSIMMON * vec3(0.95, 0.85, 0.9), APRICOT, face);
      float along = 0.5 + 0.5 * sin(x * 0.7 + fi);
      rc = mix(rc, mix(PERSIMMON, CREAM, face * 0.4), along * 0.25);
      float light = 0.5 + 0.5 * abs(c);
      rc *= light;
      // Glint slides across the band as it turns.
      float glint = exp(-pow((d + 0.55 * s) * 2.6, 2.0)) * pow(abs(c), 3.0);
      rc += CREAM * glint * 0.42;
      // Rolled edges and a crease where it folds.
      rc *= 0.82 + 0.18 * (1.0 - d * d);
      rc *= mix(0.72, 1.0, smoothstep(0.0, 0.35, abs(c)));
      // Atmospheric depth.
      rc = mix(VIOLET * 1.1, rc, mix(0.42, 1.0, depth));
      col = mix(col, rc, a);
    }
    // Faint halo.
    col += mix(PERSIMMON, APRICOT, 0.5) * 0.035 * depth * exp(-abs(d) * 0.9) * (0.4 + 0.6 * abs(c));
  }

  // Vignette, scroll dimming, grain.
  float vig = smoothstep(1.35, 0.25, length(uv * vec2(0.9, 1.25)));
  col *= mix(0.55, 1.0, vig);
  col = mix(col, INK, clamp(uScroll * 0.55, 0.0, 0.5));
  col += (hash(frag + fract(t * 7.0) * 91.0) - 0.5) * 0.035;
  gl_FragColor = vec4(col, 1.0);
}
`;

function createRibbons(canvas) {
  const gl = canvas.getContext('webgl', {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('[demo] shader:', gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  };

  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = {};
  for (const name of ['uRes', 'uTime', 'uMouse', 'uMouseOn', 'uScroll', 'uPulse', 'uWide']) {
    u[name] = gl.getUniformLocation(program, name);
  }

  // Keep fill cost bounded: cap DPR and total pixel count.
  const MAX_PIXELS = 1.8e6;
  let width = 0;
  let height = 0;
  const resize = () => {
    const cssW = canvas.clientWidth || innerWidth;
    const cssH = canvas.clientHeight || innerHeight;
    let ratio = Math.min(devicePixelRatio || 1, 1.5);
    const pixels = cssW * cssH * ratio * ratio;
    if (pixels > MAX_PIXELS) ratio *= Math.sqrt(MAX_PIXELS / pixels);
    const w = Math.max(1, Math.round(cssW * ratio));
    const h = Math.max(1, Math.round(cssH * ratio));
    if (w !== width || h !== height) {
      width = canvas.width = w;
      height = canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  };

  let lost = false;
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    lost = true;
  });

  return {
    resize,
    aspect: () => width / Math.max(1, height),
    draw(time, view) {
      if (lost) return;
      gl.uniform2f(u.uRes, width, height);
      gl.uniform1f(u.uTime, time);
      gl.uniform2f(u.uMouse, view.mx, view.my);
      gl.uniform1f(u.uMouseOn, view.mouseOn);
      gl.uniform1f(u.uScroll, view.scroll);
      gl.uniform3f(u.uPulse, view.px, view.py, view.pt);
      gl.uniform1f(u.uWide, view.wide);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

const canvas = document.getElementById('ribbons');
let ribbons = null;
try {
  ribbons = createRibbons(canvas);
} catch (error) {
  console.warn('[demo] WebGL unavailable:', error);
}
if (!ribbons) root.classList.add('no-gl');

/* Pointer position in shader space (field-rotated coordinates). */
function toField(clientX, clientY) {
  const h = innerHeight;
  const w = innerWidth;
  const ux = (clientX - w / 2) / h;
  const uy = (h / 2 - clientY) / h;
  const wide = wideFactor();
  const ang = -0.42 + state.scroll * 0.55;
  const sx = ux - 0.22 * wide;
  const sy = uy - (-0.08 - state.scroll * 0.35);
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  // GLSL mat2(ca, sa, -sa, ca) * v  ->  (ca*x - sa*y, sa*x + ca*y)
  return { x: ca * sx - sa * sy, y: sa * sx + ca * sy };
}

function wideFactor() {
  // Spread ribbons a little more on wide screens; tighten on phones.
  const aspect = innerWidth / Math.max(1, innerHeight);
  return Math.min(1.25, Math.max(0.55, aspect * 0.75));
}

/* ------------------------------------------------------------------ */
/* Kinetic headline                                                    */
/* ------------------------------------------------------------------ */

function splitText(el) {
  let index = 0;
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        const parts = child.textContent.split(/(\s+)/);
        for (const part of parts) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            frag.append(document.createTextNode(' '));
            continue;
          }
          const word = document.createElement('span');
          word.className = 'word';
          for (const ch of part) {
            const span = document.createElement('span');
            span.className = 'char';
            span.textContent = ch;
            span.style.setProperty('--i', String(index++));
            word.append(span);
          }
          frag.append(word);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    }
  };
  walk(el);
  for (const em of el.querySelectorAll('em')) {
    const chars = em.querySelectorAll('.char');
    chars.forEach((c, j) => {
      c.style.setProperty('--j', String(j));
      c.style.setProperty('--n', String(chars.length));
    });
  }
  for (const child of el.children) child.setAttribute('aria-hidden', 'true');
  el.classList.add('split-ready');
}

const splitTargets = [...document.querySelectorAll('[data-split]')];
splitTargets.forEach(splitText);

const heroChars = [...document.querySelectorAll('.headline .char')];
let charBoxes = [];
const measureChars = () => {
  charBoxes = heroChars.map((c) => {
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2 + scrollX, y: r.top + r.height / 2 + scrollY };
  });
};

function updateChars(clientX, clientY, strength) {
  if (reduceMotion || !charBoxes.length) return;
  const px = clientX + scrollX;
  const py = clientY + scrollY;
  for (let i = 0; i < heroChars.length; i++) {
    const b = charBoxes[i];
    const dx = b.x - px;
    const dy = b.y - py;
    const f = Math.exp(-(dx * dx + dy * dy) / 26000) * strength;
    heroChars[i].style.setProperty('--lift', (f * 22).toFixed(2));
    heroChars[i].style.setProperty('--tilt', (f * Math.sign(dx || 1) * 7).toFixed(2));
  }
}

/* ------------------------------------------------------------------ */
/* Pointer, tilt, magnetic chips                                       */
/* ------------------------------------------------------------------ */

let pointerFrame = 0;
let lastPointer = null;

function onPointerMove(event) {
  lastPointer = event;
  if (event.pointerType === 'mouse') root.classList.add('has-pointer');
  if (pointerFrame) return;
  pointerFrame = requestAnimationFrame(() => {
    pointerFrame = 0;
    const e = lastPointer;
    const f = toField(e.clientX, e.clientY);
    state.mouse.tx = f.x;
    state.mouse.ty = f.y;
    state.mouse.tActive = 1;
    root.style.setProperty('--mx', `${e.clientX}px`);
    root.style.setProperty('--my', `${e.clientY}px`);
    updateChars(e.clientX, e.clientY, 1);
  });
}

addEventListener('pointermove', onPointerMove, { passive: true });
document.addEventListener('pointerleave', () => {
  state.mouse.tActive = 0;
  root.classList.remove('has-pointer');
  updateChars(-9999, -9999, 0);
});

addEventListener('pointerdown', (event) => {
  if (event.target.closest('a, button, kbd')) return;
  const f = toField(event.clientX, event.clientY);
  state.pulse.x = f.x;
  state.pulse.y = f.y;
  state.pulse.start = clock;
  state.mouse.tx = f.x;
  state.mouse.ty = f.y;
  state.mouse.tActive = 1;
});

if (finePointer && !reduceMotion) {
  for (const card of document.querySelectorAll('[data-tilt]')) {
    card.addEventListener('pointermove', (event) => {
      const r = card.getBoundingClientRect();
      const nx = (event.clientX - r.left) / r.width;
      const ny = (event.clientY - r.top) / r.height;
      card.style.setProperty('--ry', `${((nx - 0.5) * 10).toFixed(2)}deg`);
      card.style.setProperty('--rx', `${((0.5 - ny) * 10).toFixed(2)}deg`);
      card.style.setProperty('--gx', `${(nx * 100).toFixed(1)}%`);
      card.style.setProperty('--gy', `${(ny * 100).toFixed(1)}%`);
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  }

  for (const chip of document.querySelectorAll('.magnetic')) {
    chip.addEventListener('pointermove', (event) => {
      const r = chip.getBoundingClientRect();
      const dx = event.clientX - (r.left + r.width / 2);
      const dy = event.clientY - (r.top + r.height / 2);
      chip.style.setProperty('--tx', `${(dx * 0.25).toFixed(1)}px`);
      chip.style.setProperty('--ty', `${(dy * 0.35).toFixed(1)}px`);
    });
    chip.addEventListener('pointerleave', () => {
      chip.style.setProperty('--tx', '0px');
      chip.style.setProperty('--ty', '0px');
    });
  }
}

/* ------------------------------------------------------------------ */
/* Scroll-driven motion                                                */
/* ------------------------------------------------------------------ */

const marquees = [...document.querySelectorAll('[data-marquee]')];
const band = document.querySelector('.band');

function onScroll() {
  const vh = innerHeight || 1;
  state.scroll = Math.min(1.5, scrollY / vh);
  root.style.setProperty('--scroll', Math.min(1, state.scroll).toFixed(4));
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();

function updateMarquees(time) {
  if (!band) return;
  const r = band.getBoundingClientRect();
  if (r.bottom < -50 || r.top > innerHeight + 50) return;
  const progress = (innerHeight - r.top) / (innerHeight + r.height);
  const drift = reduceMotion ? 0 : time * 14;
  for (const m of marquees) {
    const dir = Number(m.dataset.marquee);
    const half = m.scrollWidth / 2 || 1;
    let x = (progress * 900 + drift) * dir;
    x = ((x % half) + half) % half;
    m.style.transform = `translate3d(${-x}px, 0, 0)`;
  }
}

const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        revealObserver.unobserve(entry.target);
      }
    }
  },
  { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
);
document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

/* ------------------------------------------------------------------ */
/* Live readouts                                                       */
/* ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);
const fpsEls = [$('pill-fps'), $('stat-fps')];
const framesEl = $('stat-frames');
const viewportEl = $('stat-viewport');

function renderViewport() {
  viewportEl.textContent = `${innerWidth}×${innerHeight}`;
}

function renderOrigin() {
  let origin = 'unknown';
  try {
    origin = String(self.origin);
  } catch {
    // Some embedders hide it; keep the fallback.
  }
  $('stat-origin').textContent = origin;
  let framed = false;
  try {
    framed = window.top !== window.self;
  } catch {
    framed = true;
  }
  if (!framed) {
    const hint = document.querySelector('.code-hint');
    if (hint) hint.innerHTML = 'Opened directly. On GitHub, press <kbd>Code</kbd> to read the source.';
  }
  const note = $('stat-origin-note');
  if (origin === 'null' && framed) {
    note.innerHTML = 'opaque sandbox: no cookies, no access to GitHub’s page';
  } else if (framed) {
    note.innerHTML = 'running inside a frame';
  }
}

function describeUrl(url) {
  if (!url) return { text: 'not found', sha: null };
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    const meta = url.slice(5, comma).replace(';base64', '');
    const bytes = url.includes(';base64,') ? Math.round(((url.length - comma - 1) * 3) / 4) : url.length - comma - 1;
    return { text: `packaged inline as ${meta} · ${(bytes / 1024).toFixed(1)} KB`, sha: null, kind: 'data' };
  }
  const sha = (url.match(/@([0-9a-f]{40}|[0-9a-f]{7,12})\//) || url.match(/\/([0-9a-f]{40})\//) || [])[1] || null;
  return { text: url, sha, kind: 'url' };
}

function renderResolved() {
  const link = document.querySelector('link[rel~="stylesheet"]');
  const css = describeUrl(link ? link.href : '');
  const js = describeUrl(SCRIPT_URL);
  const rows = document.querySelectorAll('#resolved-list .rv');
  const paint = (el, info) => {
    el.textContent = '';
    if (info.sha && info.kind === 'url') {
      const [before, after] = info.text.split(info.sha);
      el.append(before);
      const mark = document.createElement('mark');
      mark.textContent = info.sha;
      el.append(mark, after ?? '');
    } else {
      el.textContent = info.text;
    }
    el.title = info.kind === 'data' ? '' : info.text;
  };
  paint(rows[0], css);
  paint(rows[1], js);

  const sha = css.sha || js.sha;
  if (sha) {
    $('pin').hidden = false;
    $('pin-sha').textContent = sha.slice(0, 7);
    $('pin-sha').title = sha;
  }
  const note = $('resolved-note');
  if (css.kind === 'data' || js.kind === 'data') {
    note.innerHTML = 'Fetched from this exact commit and packaged into the sandbox, so the preview can\u2019t drift with the branch. Read live from this document’s own <code>&lt;link&gt;</code> and <code>&lt;script&gt;</code>.';
  } else if (sha) {
    note.innerHTML = 'Rewritten to commit-pinned URLs, so this preview can’t drift with the branch. Read live from this document’s own <code>&lt;link&gt;</code> and <code>&lt;script&gt;</code>.';
  } else if (location.protocol === 'file:' || /^https?:\/\/(localhost|127\.)/.test(location.href)) {
    note.innerHTML = 'Opened directly, outside the extension: these are plain relative files. On GitHub, the extension pins them to a commit.';
  }
}

renderViewport();
renderOrigin();
renderResolved();
addEventListener('resize', () => {
  renderViewport();
  measureChars();
  if (ribbons) ribbons.resize();
});

/* ------------------------------------------------------------------ */
/* Animation loop                                                      */
/* ------------------------------------------------------------------ */

let clock = 0;
let last = performance.now();
let fpsAccum = 0;
let fpsFrames = 0;
let rafId = 0;
let uiTick = 0;

function frame(now) {
  rafId = 0;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const speed = reduceMotion ? 0.18 : 1;
  clock += dt * speed;

  const m = state.mouse;
  const k = 1 - Math.pow(0.002, dt);
  m.x += (m.tx - m.x) * k;
  m.y += (m.ty - m.y) * k;
  m.active += (m.tActive - m.active) * (1 - Math.pow(0.05, dt));

  if (ribbons) {
    ribbons.resize();
    const pt = clock - state.pulse.start;
    ribbons.draw(clock + 40, {
      mx: m.x,
      my: m.y,
      mouseOn: reduceMotion ? 0 : m.active,
      scroll: state.scroll,
      px: state.pulse.x,
      py: state.pulse.y,
      pt: pt < 6 ? pt : -1,
      wide: wideFactor(),
    });
  }
  updateMarquees(clock);

  state.frames++;
  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 0.5) {
    state.fps = Math.round(fpsFrames / fpsAccum);
    fpsAccum = 0;
    fpsFrames = 0;
    for (const el of fpsEls) el.textContent = el.id === 'pill-fps' ? `${state.fps} fps` : String(state.fps);
  }
  if (++uiTick % 6 === 0) framesEl.textContent = state.frames.toLocaleString('en-US');

  schedule();
}

function schedule() {
  if (!rafId && state.visible && state.onScreen) {
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }
}

document.addEventListener('visibilitychange', () => {
  state.visible = !document.hidden;
  if (state.visible) schedule();
  else if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
});

// Pause when this frame is scrolled out of GitHub's viewport.
new IntersectionObserver((entries) => {
  state.onScreen = entries[entries.length - 1].isIntersecting;
  if (state.onScreen) schedule();
  else if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}).observe(canvas.isConnected && ribbons ? canvas : document.querySelector('.hero'));

reduceMotionQuery.addEventListener?.('change', (event) => {
  reduceMotion = event.matches;
});

requestAnimationFrame(() => {
  measureChars();
  // Re-measure after the intro letters have settled.
  setTimeout(measureChars, 1800);
});
document.fonts?.ready?.then(measureChars).catch(() => {});

schedule();
