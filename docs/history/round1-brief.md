# Design Language Championship: the brief

You are one team in a competition to invent the best **design language** built on one medium: full-color text-character motion graphics drawn on <canvas> (a grid of monospace characters, each with its own color, driven by a small simulation, with a soft bloom). A panel of six judges will score every entry. Be brave. The last round was "nice components with a scene behind them". That is the floor, not the goal. We want things nobody has seen on a website.

## Study first
- Style reference (read fully): ../breach-card.html (whale breach profile card). Note the engine: measured char grid with aspect correction, per-cell put(char,r,g,b) buffers, fixed 60Hz sim step + 30fps render, value noise, char ramps like '.:-=+*#%@', color-string cache, bloom (draw frame at 1/5 size then add back stretched with 'lighter' at ~0.5), ResizeObserver relayout, reduced-motion still frame.
- Previous round (what NOT to settle for): ../lab/hero-cta.html, ../lab/data-pricing.html, ../lab/states-feedback.html, ../lab/content-nav.html. Skim them; go further.

## What to deliver: ONE full design-language specimen page
Invent a fictional brand (name, one-line purpose) that fits your team's direction. Then build a single page that shows the whole language working together:
1. **Logo treatment.** An animated wordmark/mark made of (or born from) the character grid. It should have an idle state, a hover/attention state, and a "form" moment on load (assembles, hatches, condenses, decodes...). Show it large AND at nav size.
2. **Buttons.** Primary, secondary, ghost/text and icon button, plus a destructive or toggle. Each has real hover, press and focus states expressed in the medium (not just a color change). Make at least one button that people would want to press again just to see it.
3. **Menu bar / navigation.** A top nav with hover reactions and at least one dropdown or mega-menu that opens in the medium. Mobile version (hamburger or equivalent) that also animates.
4. **Cursor / pointer interactivity.** The page responds to the pointer in a way that fits the world (disturbance, attraction, light, wake, etc.). Touch gets an equivalent (tap).
5. **Hero moment.** One signature, screenshot-worthy scene.
6. **Footer glory.** The footer is a destination, not an afterthought. Make it the thing people scroll to the bottom for.
7. **A share moment.** Something a viewer would screen-record and post (an easter egg, a secret key, a hold-to-charge, a scroll-scrubbed event...). Tell the user how to trigger it with a small hint.
8. A short "language notes" strip: 3 to 5 rules of your language (palette, character ramp, motion principles), as real content on the page.

## Hard rules (judges check these)
- Write a FULL HTML document (<!doctype html>, charset + viewport metas, <title>, explicit body background) to the exact path in your assignment.
- No external scripts or libraries. Fonts only from Google Fonts (fonts.googleapis.com) with real fallback stacks. No network fetches. No alert/confirm/prompt.
- Performance: ONE shared requestAnimationFrame loop for every canvas on the page. Cap devicePixelRatio at 2. Pause canvases that are offscreen (IntersectionObserver) and everything when document.hidden. Reuse buffers, avoid per-frame allocation, cache fillStyle strings, skip blank cells. Keep particle counts bounded. Target: smooth on a mid laptop with the whole page open.
- prefers-reduced-motion: no loops; show good still frames; interactions still give a visible (static) state change.
- Accessible: real <button>/<a>/<nav> elements, visible :focus-visible, keyboard works for menus (Escape closes), canvases are aria-hidden or have role="img" + label, text contrast stays readable over animation.
- Responsive: works at 400px wide with no horizontal page scroll; 16px side gutters.
- Copy: plain language, fictional example content. No em dashes anywhere. Never use "leverage", "delve", "utilize".
- Single committed dark look is fine (set color-scheme: dark and all colors explicitly), or do both themes properly.

## Verify once, then finish
Take Playwright screenshots (Chromium preinstalled; run node with NODE_PATH=$(npm root -g); launch chromium; viewport 1280x900 full-page, and 400x850) and capture page errors. Look at them with the Read tool. Fix what you see in one pass. Do not loop forever. Put helper scripts and screenshots in a subfolder named after your team inside ../championship/.

## Report back (short)
Brand name, file path, one paragraph on the big idea, a list of each required element and how it works, the share-moment trigger, and known issues stated honestly.
