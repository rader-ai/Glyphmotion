# Glyphmotion

**Interfaces drawn in living glyphs.**

Glyphmotion is a design language and a small engine for building web interfaces out of full-color text characters on a `<canvas>`. Every "pixel" is a typed glyph (`@`, `~`, `/`, `*`), each with its own color, driven by a small simulation and finished with a soft glow.

It is not ASCII art pasted behind a page. Three ideas set it apart:

1. **Simulated, not drawn.** Water, fire, flocks and weather run as real physics underneath. The glyphs are how you see it.
2. **The interface is made of the medium.** A button is the pool of molten metal, not a box sitting on top of a scene.
3. **Behavior, not loops.** Things settle, get bored, notice the visitor and fall asleep.

Created by Chris Rader with Claude.

## See it

Open `index.html` for the landing page, or any file in `examples/` and `gallery/` directly in a browser. No build step and no server needed.

| Folder | What is in it |
|---|---|
| `src/glyphmotion.js` | The engine. One file, no dependencies. |
| `examples/` | Small pages built on the engine: hello, an ember button, a wordmark, and the original whale-breach profile card. |
| `gallery/lab/` | The first component sheets: hero and call to action, data and pricing, app states, content and navigation. |
| `gallery/championship/` | Four full design languages from the design language championship: Shoal (creatures, the winner), Meridian (sky), Meltwork (materials), Carrier (signal). |
| `gallery/mascots/` | Four living mascots with their pitches: Nib the cuttlefish, Nomi the sundial keeper, Fettle the slag salamander, Vesper the bat. |
| `docs/` | API reference, the language principles, and the history of how it was made (briefs and judges' scorecards). |
| `tools/check.js` | Automated checks for every page. |

The gallery pages were built before the engine existed, so each carries its own copy of the core code. They are kept as they were made. New work should use the engine.

## Quick start

```html
<canvas id="c" style="width:100%;height:320px"></canvas>
<script src="src/glyphmotion.js"></script>
<script>
  const { fbm, ramp, smooth } = Glyphmotion;
  Glyphmotion.surface(document.getElementById('c'), {
    draw(s) {
      for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) {
        const n = fbm(c * 0.05 + s.time * 0.1, r * s.asp * 0.05);
        const v = smooth(0.4, 0.8, n);
        s.putI(r * s.cols + c, v < 0.05 ? ' ' : ramp(v), 60, 160 + 90 * v, 220);
      }
    }
  });
</script>
```

The engine handles the parts that are easy to get wrong:

- one shared animation loop for every canvas on the page
- a fixed 60Hz simulation step with a 30fps paint
- pausing canvases that are off screen, and everything when the tab is hidden
- sharp text on high-density screens (capped at 2x)
- relayout on resize and when web fonts arrive
- a cached, quantized color palette and skipped blank cells
- the glow pass
- `prefers-reduced-motion`: no loop at all, one good still frame, and repaints on interaction

See [docs/api.md](docs/api.md) for the full reference and [docs/principles.md](docs/principles.md) for the design rules.

## Checks

```sh
npm install playwright   # once, if you do not have it
node tools/check.js
```

For every page, at 1280px and 400px wide, the checks confirm:

- no page or console errors
- no sideways scrolling on a phone
- no em dashes
- no scripts from other sites
- no network calls

For the examples, they also confirm that the loop really stops under reduced motion.

## Status

Early. The engine is small on purpose and will grow as the gallery pieces are rebuilt on top of it.

## License

MIT. See [LICENSE](LICENSE). Use it, remix it, ship it. A credit back to Glyphmotion is appreciated.
