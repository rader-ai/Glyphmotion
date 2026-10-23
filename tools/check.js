// Glyphmotion page checks: run with `node tools/check.js` (needs Playwright + Chromium).
// For every HTML page in the repo it checks:
//   - no page or console errors at 1280px and 400px
//   - no horizontal scroll at 400px
//   - no em dashes, no scripts from other hosts, no network calls in code
//   - examples only: the loop stops under prefers-reduced-motion
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const pages = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    if (f === '.git' || f === 'node_modules') continue;
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.html')) pages.push(p);
  }
})(ROOT);

function staticChecks(file) {
  const src = fs.readFileSync(file, 'utf8'), out = [];
  if (src.includes('—')) out.push('contains an em dash');
  for (const m of src.matchAll(/<script[^>]+src="([^"]+)"/g)) if (/^https?:/.test(m[1])) out.push('external script ' + m[1]);
  if (/\bfetch\(|XMLHttpRequest|new WebSocket/.test(src)) out.push('network call in code');
  return out;
}

(async () => {
  const browser = await chromium.launch();
  let failed = 0;
  for (const file of pages.sort()) {
    const rel = path.relative(ROOT, file), problems = staticChecks(file);
    for (const vw of [1280, 400]) {
      const page = await browser.newPage({ viewport: { width: vw, height: 850 } });
      page.on('pageerror', e => problems.push(vw + 'px page error: ' + e.message));
      page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) problems.push(vw + 'px console: ' + m.text()); });
      await page.goto('file://' + file);
      await page.waitForTimeout(1500);
      if (vw === 400) {
        const sw = await page.evaluate(() => document.documentElement.scrollWidth);
        if (sw > 400) problems.push('horizontal scroll at 400px (scrollWidth ' + sw + ')');
      }
      await page.close();
    }
    if (rel.startsWith('examples')) {
      const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 850 } });
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        window.__raf = 0; const orig = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = cb => { window.__raf++; return orig(cb); };
      });
      await page.goto('file://' + file);
      await page.waitForTimeout(2000);
      const a = await page.evaluate(() => window.__raf);
      await page.waitForTimeout(2000);
      const b = await page.evaluate(() => window.__raf);
      if (b > a) problems.push('reduced motion: loop still running (' + (b - a) + ' rAF calls in 2s)');
      await ctx.close();
    }
    if (problems.length) { failed++; console.log('FAIL ' + rel); for (const p of problems) console.log('     ' + p); }
    else console.log('ok   ' + rel);
  }
  await browser.close();
  console.log(failed ? '\n' + failed + ' page(s) with problems' : '\nall pages pass');
  process.exitCode = failed ? 1 : 0;
})();
