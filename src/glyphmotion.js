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
const frameHooks = new Set();
function anyActive() { for (const s of surfaces) if (s.active) return true; return false; }
function frame(now) {
  raf = 0;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  // page-level work (scroll speed, shared clocks, DOM text) runs once per frame, before any surface
  for (const fn of frameHooks) fn(dt);
  for (const s of surfaces) if (s.active) s._advance(dt);
  wake();
}
// run fn(dt) once per animation frame while any surface is animating; returns an unsubscribe function.
// Under reduced motion there are no frames, so do not rely on it for state that must change.
GM.onFrame = fn => { frameHooks.add(fn); wake(); return () => frameHooks.delete(fn); };
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
  for (const e of entries) {
    const s = e.target.__glyphSurface; if (!s || s.visible === e.isIntersecting) continue;
    s.visible = e.isIntersecting;
    if (s.visible) s.invalidate();
    if (s.o.onVisible) s.o.onVisible(s, s.visible);
  }
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
   *   onVisible(s, visible)  called when the surface scrolls into or out of view
   *   persistence seconds a glyph keeps glowing after it stops being drawn (phosphor afterglow). Default 0
   *   pointer    'canvas' (default) or 'window': track the pointer page-wide, for overlays with pointer-events: none.
   *              With 'window', x and y follow the pointer everywhere; inside is true only over the canvas
   *   baseline   'top' (default) or 'middle': where glyphs sit in their cell
   *   relayoutDelay ms to wait after a resize before re-laying out. Default 120 (0 = every resize)
   */
  constructor(canvas, o) {
    this.canvas = canvas; this.o = Object.assign({ bloom: 0.5, bloomScale: 5, fps: 30, lineHeight: 1.2, weight: 600, family: DEFAULT_FAMILY, background: '#070b18' }, o);
    this.ctx = canvas.getContext('2d', { alpha: !!this.o.transparent });
    this.glow = document.createElement('canvas'); this.gctx = this.glow.getContext('2d');
    this.time = 0; this.acc = 0; this.racc = 1; this.paused = false; this.visible = !io; this.dirty = true;
    this.pointer = { x: -1e9, y: -1e9, inside: false, down: false, vx: 0, vy: 0 };
    canvas.__glyphSurface = this;
    this._bindPointer();
    this.ro = new ResizeObserver(() => {
      const wait = this.cols ? (this.o.relayoutDelay == null ? 120 : this.o.relayoutDelay) : 0;
      clearTimeout(this._rz);
      if (wait === 0) this.layout(); else this._rz = setTimeout(() => this.layout(), wait);
    });
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
    this.a = new Uint8ClampedArray(N).fill(255);
    if (this.o.persistence > 0) {
      this.pch = new Array(N).fill(' '); this.plife = new Float32Array(N);
      this.pr = new Uint8ClampedArray(N); this.pg = new Uint8ClampedArray(N); this.pb = new Uint8ClampedArray(N); this.pa = new Uint8ClampedArray(N);
    }
    this._lastRender = this.time;
    this.glow.width = Math.max(1, Math.round(this.canvas.width / this.o.bloomScale));
    this.glow.height = Math.max(1, Math.round(this.canvas.height / this.o.bloomScale));
    if (this.o.setup) this.o.setup(this);
    if (GM.reducedMotion) this._still(); else this.dirty = true;
    this.invalidate();
    wake();
  }

  // ---- grid writes ----
  // A is optional opacity 0..1 (default 1); a blank ' ' cell is never painted
  clear() { this.ch.fill(' '); }
  blank(i) { this.ch[i] = ' '; }
  idx(c, r) { return (c < 0 || r < 0 || c >= this.cols || r >= this.rows) ? -1 : r * this.cols + c; }
  put(c, r, ch, R, G, B, A) { if (c < 0 || r < 0) return -1; const i = this.idx(c | 0, r | 0); if (i >= 0) this.putI(i, ch, R, G, B, A); return i; }
  putI(i, ch, R, G, B, A) { this.ch[i] = ch; this.r[i] = R; this.g[i] = G; this.b[i] = B; this.a[i] = A === undefined ? 255 : A * 255; }
  // world coords (x in columns, y in column-widths) to a cell
  putW(x, y, ch, R, G, B, A) { return this.put(Math.floor(x), Math.floor(y / this.asp), ch, R, G, B, A); }
  text(c, r, str, R, G, B, A) { for (let k = 0; k < str.length; k++) if (str[k] !== ' ') this.put(c + k, r, str[k], R, G, B, A); }

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
    if (this.pch) this._persist();
    this.present();
  }
  // phosphor afterglow: a cell that stops being drawn keeps its glyph and fades out over o.persistence seconds
  _persist() {
    const dt = Math.max(0, this.time - this._lastRender) || 1 / this.o.fps; this._lastRender = this.time;
    const fade = GM.reducedMotion ? 1 : dt / this.o.persistence;
    const { ch, r, g, b, a, pch, plife, pr, pg, pb, pa } = this;
    for (let i = 0; i < this.N; i++) {
      if (ch[i] !== ' ') { pch[i] = ch[i]; pr[i] = r[i]; pg[i] = g[i]; pb[i] = b[i]; pa[i] = a[i]; plife[i] = 1; }
      else if (plife[i] > 0) {
        plife[i] -= fade;
        if (plife[i] > 0) { ch[i] = pch[i]; r[i] = pr[i]; g[i] = pg[i]; b[i] = pb[i]; a[i] = pa[i] * plife[i]; }
      }
    }
  }

  // ---- paint the grid, then a cheap bloom: shrink the frame and add it back stretched ----
  present() {
    const ctx = this.ctx, { ch, r, g, b, a, cols, rows, cw, chh } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (this.o.transparent) ctx.clearRect(0, 0, this.vw, this.vh);
    else { ctx.fillStyle = this.o.background; ctx.fillRect(0, 0, this.vw, this.vh); }
    const mid = this.o.baseline === 'middle';
    ctx.font = this.font; ctx.textBaseline = mid ? 'middle' : 'top';
    const y0 = mid ? chh / 2 : 0;
    let lastK = -1, lastA = 255;
    for (let row = 0; row < rows; row++) {
      const y = row * chh + y0, base = row * cols;
      for (let c = 0; c < cols; c++) {
        const i = base + c, s = ch[i];
        if (s === ' ') continue;
        // alpha is quantized to 16 steps so runs of similar cells keep one state change
        const al = a[i] & 0xf0 | 0x0f;
        if (al < 0x10) continue;
        if (al !== lastA) { ctx.globalAlpha = al / 255; lastA = al; }
        const k = ((r[i] & 0xfc) << 16) | ((g[i] & 0xfc) << 8) | (b[i] & 0xfc);
        if (k !== lastK) { ctx.fillStyle = css(k); lastK = k; }
        ctx.fillText(s, c * cw, y);
      }
    }
    ctx.globalAlpha = 1;
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
    if (this.o.pointer === 'window') {
      // overlays with pointer-events: none never get events, so listen on the window and test the rect
      const inRect = e => { const rc = el.getBoundingClientRect(); return e.clientX >= rc.left && e.clientX <= rc.right && e.clientY >= rc.top && e.clientY <= rc.bottom; };
      // the position keeps updating everywhere on the page (for gaze); inside is true only over the canvas
      const repaint = () => { if (GM.reducedMotion && !this._rmT) this._rmT = setTimeout(() => { this._rmT = 0; this.invalidate(); }, 60); };
      const leave = () => { if (p.inside || p.down) { p.inside = false; p.down = false; repaint(); } };
      const h = this._h;
      this._h = {
        pointermove: e => { at(e); const was = p.inside; p.inside = inRect(e); if (p.inside || was) repaint(); },
        pointerdown: e => { at(e); p.inside = inRect(e); if (p.inside) p.down = true; },
        pointerup: e => { p.down = false; if (e.pointerType === 'touch') leave(); },
        pointercancel: leave,
        blur: h.pointerleave,
      };
      this._docLeave = e => { if (!e.relatedTarget) leave(); };
      document.addEventListener('mouseout', this._docLeave);
      this._target = root;
    } else this._target = el;
    for (const k in this._h) this._target.addEventListener(k, this._h[k], { passive: true });
  }
  _unbind() { for (const k in this._h) this._target.removeEventListener(k, this._h[k]); if (this._docLeave) document.removeEventListener('mouseout', this._docLeave); }
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
  x.font = font; x.textAlign = 'left'; x.textBaseline = 'middle';
  // '\n' splits the word into stacked lines, for narrow screens
  const lines = String(text).split('\n');
  // spacing: extra space between letters, in ems; stretch: make letters taller (1 = natural)
  const em = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font) ? /(\d+(?:\.\d+)?)px/.exec(font)[1] : 100);
  const gap = (o.spacing || 0) * em, stretch = o.stretch || 1;
  const widthOf = line => { let w = 0; for (const chr of line) w += x.measureText(chr).width; return w + gap * Math.max(0, [...line].length - 1); };
  let tw = 0, th = 0;
  for (const line of lines) {
    const m = x.measureText(line);
    tw = Math.max(tw, gap ? widthOf(line) : m.width);
    th = Math.max(th, (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || em);
  }
  th *= stretch;
  const lh = th * (o.lineGap || 1.25), total = th + lh * (lines.length - 1);
  // cells are taller than wide, so squash vertically by the aspect ratio
  const k = Math.min(cols * fill / tw, rows * asp * fill / total);
  const cy = o.center == null ? rows / 2 : o.center * rows;
  x.setTransform(k, 0, 0, k * stretch / asp, cols / 2, cy);
  lines.forEach((line, n) => {
    const y = (n - (lines.length - 1) / 2) * lh / stretch;
    if (!gap) { x.textAlign = 'center'; x.fillText(line, 0, y); return; }
    let px = -widthOf(line) / 2;
    for (const chr of line) { x.fillText(chr, px, y); px += x.measureText(chr).width + gap; }
  });
  const data = x.getImageData(0, 0, cols, rows).data, mask = new Uint8Array(cols * rows);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 110 ? 1 : 0;
  return mask;
};

root.Glyphmotion = GM;
})(typeof window !== 'undefined' ? window : this);
