# Glyphmotion API

Load `src/glyphmotion.js` with a `<script>` tag. It defines one global, `Glyphmotion`.

## World units

Each surface is a grid of `cols` by `rows` character cells. Cells are taller than they are wide, so the engine gives you a second coordinate system where circles stay round:

- `x` is measured in columns (0 to `s.W`)
- `y` is measured in column widths (0 to `s.H`), so `row = y / s.asp`

Simulate in world units, then write with `putW(x, y, ...)`. Pointer positions are in world units too.

## Glyphmotion.surface(canvas, options)

Creates a `Surface` bound to a canvas. Size the canvas with CSS; the engine matches its pixels to the element.

| Option | Default | What it does |
|---|---|---|
| `fontSize` | `width / 60`, clamped 7 to 16 | Number, or `(cssWidth, cssHeight) => number`. Sets the grid density. |
| `family` | JetBrains Mono stack | Monospace font family for the glyphs. |
| `weight` | `600` | Font weight. |
| `lineHeight` | `1.2` | Cell height as a multiple of the font size. |
| `background` | `#070b18` | Color painted under the grid each frame. |
| `transparent` | `false` | For overlays such as nav strips and button effects: skip the background so the page shows through. |
| `bloom` | `0.5` | Glow strength, 0 to 1. `0` turns the glow pass off. |
| `bloomScale` | `5` | How much the glow pass is shrunk. Higher is softer and cheaper. |
| `fps` | `30` | Paint rate. The simulation always steps at 60Hz. |
| `setup(s)` | | Called after every layout, when the grid size changes. Allocate your world here. |
| `step(s, dt)` | | Fixed 60Hz simulation step. `dt` is `1/60`. |
| `draw(s)` | | Fill the grid for this frame. Call `s.clear()` first if you do not overwrite every cell. |
| `still(s)` | runs `step` for 1.2s | Under reduced motion, put the world in a good resting pose. |
| `onVisible(s, visible)` | | Called when the surface scrolls into or out of view. Use it to start a reveal the first time a piece is seen. |
| `persistence` | `0` | Seconds a glyph keeps glowing after you stop drawing it, like phosphor on an old screen. Your `draw` must `clear()` each frame for this to work. |
| `pointer` | `'canvas'` | `'window'` tracks the pointer page-wide, for overlays styled `pointer-events: none`. `pointer.inside` is still true only over the canvas. |
| `baseline` | `'top'` | `'middle'` centers glyphs vertically in their cell. |
| `relayoutDelay` | `120` | Milliseconds to wait after a resize before re-laying out. `0` re-lays out on every resize, for elements that animate their size. |

### Surface properties

`cols`, `rows`, `N` (cell count), `asp` (cell height / width), `W`, `H` (world size), `time` (seconds simulated), `cw`, `chh` (cell size in CSS pixels), `pointer` (`{ x, y, inside, down, vx, vy }` in world units), `ch`, `r`, `g`, `b` (the grid buffers).

### Surface methods

| Method | What it does |
|---|---|
| `put(c, r, ch, R, G, B, A)` | Write one cell by column and row. `A` is optional opacity, 0 to 1. Out-of-range writes are ignored. |
| `putI(i, ch, R, G, B, A)` | Write one cell by index, `i = r * cols + c`. Fastest. |
| `blank(i)` | Empty one cell. |
| `putW(x, y, ch, R, G, B, A)` | Write one cell by world position. |
| `text(c, r, str, R, G, B, A)` | Write a string. Spaces are skipped so the scene shows through. |
| `clear()` | Blank the grid. |
| `invalidate()` | Ask for one repaint. Under reduced motion this paints right away, so call it after any interaction that changes state. |
| `pause()`, `resume()` | Stop and restart this surface. |
| `destroy()` | Detach observers and listeners. |

## Helpers

| Helper | What it does |
|---|---|
| `clamp(x, a, b)`, `lerp(a, b, t)`, `smooth(a, b, x)`, `rnd(a, b)` | Everyday math. `smooth` is smoothstep. |
| `hash2(x, y)` | Fast, stable 0 to 1 hash of two integers. Use it for per-cell randomness that does not flicker. |
| `vnoise(x, y)` | Smooth value noise, 0 to 1. |
| `fbm(x, y, octaves = 3)` | Layered noise. Warp its inputs with another `fbm` for smoke and cloud shapes. |
| `spring(state, target, k, damping, dt)` | Moves `state.x` toward `target` with `state.v` as velocity. Good for moods, gaze and anything that should settle. |
| `RAMP`, `ramp(t, chars)` | The default light ramp `' .:-=+*#%@'`, and a picker from 0 to 1. |
| `lineChar(dx, dy)` | The glyph (`- \ \| /`) that best draws a line in that direction. Use it for spray, rain and rings. |
| `textMask(surface, text, { font, fill, lineGap, spacing, stretch, center })` | Rasterizes a word into the grid. Use `\n` to stack lines on narrow screens. `spacing` adds space between letters in ems, `stretch` makes letters taller, `center` sets the vertical center as a fraction of the height. Returns a `Uint8Array` with 1 where the letters cover a cell. |
| `new Pool(capacity, fields)` | Fixed-size particle pool stored as typed arrays. `spawn({ ...values })` returns an index or -1 when full; `kill(i)` swap-removes, so loop backwards when killing. |
| `onFrame(fn)` | Runs `fn(dt)` once per animation frame, before any surface, while anything is animating. Returns an unsubscribe function. Use it for page-wide state such as scroll speed or a shared clock. It never runs under reduced motion. |
| `reducedMotion` | `true` when the viewer prefers reduced motion. Updates live. |
| `STEP` | The simulation step, `1/60`. |

## Reduced motion

When the viewer asks for reduced motion, the engine never starts the loop. On every layout it calls `still(s)` (or steps 1.2 seconds) and paints one frame. Pointer movement over a surface triggers a repaint, and your own handlers should call `s.invalidate()` after they change state, so interactions still show a visible result.

## Performance notes

- All surfaces share one `requestAnimationFrame` loop. A surface off screen does no work.
- The paint skips blank cells and only changes `fillStyle` when the quantized color changes, so long runs of one color are cheap.
- Do not allocate inside `step` or `draw`. Use a `Pool`, typed arrays and reused objects.
- A full-screen surface at 10px glyphs is around 15,000 cells. Keep per-cell work small, or lower the density with `fontSize`.
