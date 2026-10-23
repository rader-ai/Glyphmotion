/*!
 * Glyphmotion: interfaces drawn in living glyphs.
 * A small engine for full-color text-character motion graphics on <canvas>.
 * No dependencies. Load with a <script> tag; it defines window.Glyphmotion.
 */
(function (root) {
'use strict';

const GM = {};

// ---------- math ----------
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);
function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, octaves) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < (octaves || 3); o++) { sum += vnoise(x, y) * amp; norm += amp; x *= 2.03; y *= 2.03; amp *= 0.5; }
  return sum / norm;
}
// critically damped-ish spring step for moods, gaze and anything that should settle
function spring(state, target, k, damping, dt) {
  state.v += ((target - state.x) * k - state.v * damping) * dt;
  state.x += state.v * dt;
  return state.x;
}
Object.assign(GM, { clamp, lerp, smooth, rnd, hash2, vnoise, fbm, spring });

// ---------- characters ----------
GM.RAMP = ' .:-=+*#%@';
GM.ramp = (t, chars) => { chars = chars || GM.RAMP; return chars[clamp(Math.round(t * (chars.length - 1)), 0, chars.length - 1)]; };
// the glyph that best draws a line in direction (dx, dy)
GM.lineChar = (dx, dy) => {
  let a = Math.atan2(dy, dx); if (a < 0) a += Math.PI; if (a >= Math.PI) a -= Math.PI;
  if (a < Math.PI / 8 || a > 7 * Math.PI / 8) return '-';
  if (a < 3 * Math.PI / 8) return '\\';
  if (a < 5 * Math.PI / 8) return '|';
  return '/';
};

// ---------- reduced motion ----------
const mq = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
GM.reducedMotion = !!(mq && mq.matches);

// ---------- color strings (quantized so the cache stays small) ----------
const cssCache = new Map();
function css(k) {
  let s = cssCache.get(k);
  if (!s) { s = 'rgb(' + ((k >> 16) & 255) + ',' + ((k >> 8) & 255) + ',' + (k & 255) + ')'; if (cssCache.size > 8000) cssCache.clear(); cssCache.set(k, s); }
  return s;
}

// ---------- particle pool (struct of arrays, swap-remove, no per-frame allocation) ----------
class Pool {
  constructor(capacity, fields) {
    this.cap = capacity; this.n = 0; this.fields = fields;
    for (const f of fields) this[f] = new Float32Array(capacity);
  }
  spawn(values) {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    for (const f of this.fields) this[f][i] = values && values[f] !== undefined ? values[f] : 0;
    return i;
  }
  kill(i) {
    const j = --this.n;
    if (i !== j) for (const f of this.fields) this[f][i] = this[f][j];
  }
  clear() { this.n = 0; }
}
GM.Pool = Pool;

// ---------- the shared loop: one rAF for every surface on the page ----------
GM.STEP = 1 / 60;
const surfaces = new Set();
let raf = 0, last = 0;
function anyActive() { for (const s of surfaces) if (s.active) return true; return false; }
function frame(now) {
  raf = 0;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  for (const s of surfaces) if (s.active) s._advance(dt);
  wake();
}
function wake() {
  if (raf || GM.reducedMotion || document.hidden || !anyActive()) return;
  raf = requestAnimationFrame(t => { if (!last || t - last > 200) last = t; frame(t); });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }
  else wake();
});
if (mq) {
  const onChange = () => {
    GM.reducedMotion = mq.matches;
    for (const s of surfaces) s.invalidate();
    wake();
  };
  mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
}
const io = 'IntersectionObserver' in root ? new IntersectionObserver(entries => {
  for (const e of entries) { const s = e.target.__glyphSurface; if (s) { s.visible = e.isIntersecting; if (s.visible) s.invalidate(); } }
  wake();
}, { rootMargin: '120px' }) : null;

// ---------- Surface: one canvas, one character grid ----------
const DEFAULT_FAMILY = '"JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

class Surface {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} o
   *   fontSize   number or (cssWidth, cssHeight) => number. Default: width / 60, clamped 7..16
   *   family, weight, lineHeight
   *   background css color painted under the grid
   *   transparent true for overlays: no background, the page shows through
   *   bloom      0..1 strength of the glow pass (0 turns it off). Default 0.5
   *   bloomScale downscale factor for the glow pass. Default 5
   *   fps        render rate (sim always steps at 60Hz). Default 30
   *   setup(s)   after every layout (grid size changes); allocate your world here
   *   step(s,dt) fixed 60Hz simulation step
   *   draw(s)    fill the grid for this frame (s.clear() first if you need it)
   *   still(s)   reduced motion: put the world in a good resting pose (default: step 1.2s)
   */
  constructor(canvas, o) {
    this.canvas = canvas; this.o = Object.assign({ bloom: 0.5, bloomScale: 5, fps: 30, lineHeight: 1.2, weight: 600, family: DEFAULT_FAMILY, background: '#070b18' }, o);
    this.ctx = canvas.getContext('2d', { alpha: !!this.o.transparent });
    this.glow = document.createElement('canvas'); this.gctx = this.glow.getContext('2d');
    this.time = 0; this.acc = 0; this.racc = 1; this.paused = false; this.visible = !io; this.dirty = true;
    this.pointer = { x: -1e9, y: -1e9, inside: false, down: false, vx: 0, vy: 0 };
    canvas.__glyphSurface = this;
    this._bindPointer();
    this.ro = new ResizeObserver(() => { clearTimeout(this._rz); this._rz = setTimeout(() => this.layout(), this.cols ? 120 : 0); });
    this.ro.observe(canvas);
    if (io) io.observe(canvas);
    surfaces.add(this);
    const fam = this.o.family.split(',')[0].replace(/"/g, '');
    if (document.fonts && document.fonts.load) {
      Promise.race([document.fonts.load(this.o.weight + ' 16px "' + fam + '"'), new Promise(r => setTimeout(r, 1500))])
        .then(() => this.layout(), () => this.layout());
    } else this.layout();
  }

  get active() { return this.visible && !this.paused && this.cols > 0; }

  layout() {
    const rect = this.canvas.getBoundingClientRect();
    const vw = Math.max(1, rect.width), vh = Math.max(1, rect.height);
    const dpr = Math.min(root.devicePixelRatio || 1, 2);
    this.vw = vw; this.vh = vh; this.dpr = dpr;
    this.canvas.width = Math.round(vw * dpr); this.canvas.height = Math.round(vh * dpr);
    const fsOpt = this.o.fontSize;
    this.fs = typeof fsOpt === 'function' ? fsOpt(vw, vh) : fsOpt || clamp(vw / 60, 7, 16);
    this.font = this.o.weight + ' ' + this.fs.toFixed(2) + 'px ' + this.o.family;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.font = this.font;
    this.cw = ctx.measureText('M').width || this.fs * 0.6;
    this.chh = this.fs * this.o.lineHeight;
    this.cols = Math.ceil(vw / this.cw); this.rows = Math.ceil(vh / this.chh);
    // world units: x in columns, y in column-widths, so circles stay round
    this.asp = this.chh / this.cw; this.W = this.cols; this.H = this.rows * this.asp;
    const N = this.cols * this.rows; this.N = N;
    this.ch = new Array(N).fill(' ');
    this.r = new Uint8ClampedArray(N); this.g = new Uint8ClampedArray(N); this.b = new Uint8ClampedArray(N);
    this.glow.width = Math.max(1, Math.round(this.canvas.width / this.o.bloomScale));
    this.glow.height = Math.max(1, Math.round(this.canvas.height / this.o.bloomScale));
    if (this.o.setup) this.o.setup(this);
    if (GM.reducedMotion) this._still(); else this.dirty = true;
    this.invalidate();
    wake();
  }

  // ---- grid writes ----
  clear() { this.ch.fill(' '); }
  idx(c, r) { return (c < 0 || r < 0 || c >= this.cols || r >= this.rows) ? -1 : r * this.cols + c; }
  put(c, r, ch, R, G, B) { const i = this.idx(c | 0, r | 0); if (i >= 0) { this.ch[i] = ch; this.r[i] = R; this.g[i] = G; this.b[i] = B; } return i; }
  putI(i, ch, R, G, B) { this.ch[i] = ch; this.r[i] = R; this.g[i] = G; this.b[i] = B; }
  // world coords (x in columns, y in column-widths) to a cell
  putW(x, y, ch, R, G, B) { return this.put(Math.floor(x), Math.floor(y / this.asp), ch, R, G, B); }
  text(c, r, str, R, G, B) { for (let k = 0; k < str.length; k++) if (str[k] !== ' ') this.put(c + k, r, str[k], R, G, B); }

  // ---- lifecycle ----
  pause() { this.paused = true; }
  resume() { this.paused = false; this.invalidate(); wake(); }
  // ask for one repaint (works under reduced motion too, for interactions)
  invalidate() {
    this.dirty = true;
    if (GM.reducedMotion && this.cols) { this._render(); }
  }
  destroy() { surfaces.delete(this); this.ro.disconnect(); if (io) io.unobserve(this.canvas); this._unbind(); }

  _still() {
    if (this.o.still) this.o.still(this);
    else for (let t = 0; t < 1.2; t += GM.STEP) this._step(GM.STEP);
  }
  _step(dt) { this.time += dt; if (this.o.step) this.o.step(this, dt); }
  _advance(dt) {
    this.acc += dt;
    let n = 0;
    while (this.acc >= GM.STEP && n++ < 8) { this._step(GM.STEP); this.acc -= GM.STEP; }
    if (n >= 8) this.acc = 0;
    this.racc += dt;
    if (this.racc >= 1 / this.o.fps || this.dirty) { this.racc = 0; this._render(); }
  }
  _render() {
    this.dirty = false;
    if (this.o.draw) this.o.draw(this);
    this.present();
  }

  // ---- paint the grid, then a cheap bloom: shrink the frame and add it back stretched ----
  present() {
    const ctx = this.ctx, { ch, r, g, b, cols, rows, cw, chh } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (this.o.transparent) ctx.clearRect(0, 0, this.vw, this.vh);
    else { ctx.fillStyle = this.o.background; ctx.fillRect(0, 0, this.vw, this.vh); }
    ctx.font = this.font; ctx.textBaseline = 'top';
    let lastK = -1;
    for (let row = 0; row < rows; row++) {
      const y = row * chh, base = row * cols;
      for (let c = 0; c < cols; c++) {
        const i = base + c, s = ch[i];
        if (s === ' ') continue;
        const k = ((r[i] & 0xfc) << 16) | ((g[i] & 0xfc) << 8) | (b[i] & 0xfc);
        if (k !== lastK) { ctx.fillStyle = css(k); lastK = k; }
        ctx.fillText(s, c * cw, y);
      }
    }
    if (this.o.bloom > 0) {
      const gctx = this.gctx;
      gctx.globalCompositeOperation = 'copy';
      gctx.drawImage(this.canvas, 0, 0, this.glow.width, this.glow.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = this.o.bloom;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.glow, 0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ---- pointer in world units ----
  _bindPointer() {
    const p = this.pointer, el = this.canvas;
    const at = e => {
      const rect = el.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / this.cw, ny = (e.clientY - rect.top) / this.cw;
      p.vx = nx - p.x; p.vy = ny - p.y; p.x = nx; p.y = ny;
    };
    this._h = {
      pointermove: e => {
        at(e); p.inside = true;
        // under reduced motion there is no loop, so repaint on movement, at most ~16 times a second
        if (GM.reducedMotion && !this._rmT) this._rmT = setTimeout(() => { this._rmT = 0; this.invalidate(); }, 60);
      },
      pointerdown: e => { at(e); p.inside = true; p.down = true; },
      pointerup: () => { p.down = false; },
      pointerleave: () => { p.inside = false; p.down = false; },
    };
    for (const k in this._h) el.addEventListener(k, this._h[k]);
  }
  _unbind() { for (const k in this._h) this.canvas.removeEventListener(k, this._h[k]); }
}
GM.Surface = Surface;
GM.surface = (canvas, o) => new Surface(canvas, o);

// ---------- text mask: rasterize a word into the grid (for wordmarks and logos) ----------
// returns a Uint8Array of cols*rows, 1 where the letterform covers a cell
GM.textMask = (s, text, o) => {
  o = o || {};
  const font = o.font || '900 100px "Archivo Black", Impact, "Arial Black", sans-serif';
  const fill = o.fill || 0.86;
  const cols = s.cols, rows = s.rows, asp = s.asp;
  const c = document.createElement('canvas'); c.width = cols; c.height = rows;
  const x = c.getContext('2d');
  x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  // '\n' splits the word into stacked lines, for narrow screens
  const lines = String(text).split('\n');
  let tw = 0, th = 0;
  for (const line of lines) {
    const m = x.measureText(line);
    tw = Math.max(tw, m.width);
    th = Math.max(th, (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || 100);
  }
  const lh = th * (o.lineGap || 1.25), total = th + lh * (lines.length - 1);
  // cells are taller than wide, so squash vertically by the aspect ratio
  const k = Math.min(cols * fill / tw, rows * asp * fill / total);
  x.setTransform(k, 0, 0, k / asp, cols / 2, rows / 2);
  lines.forEach((line, n) => x.fillText(line, 0, (n - (lines.length - 1) / 2) * lh));
  const data = x.getImageData(0, 0, cols, rows).data, mask = new Uint8Array(cols * rows);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 110 ? 1 : 0;
  return mask;
};

root.Glyphmotion = GM;
})(typeof window !== 'undefined' ? window : this);
