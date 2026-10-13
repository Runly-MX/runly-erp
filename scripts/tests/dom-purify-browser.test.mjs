import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const require = createRequire(new URL('../../apps/desktop/package.json', import.meta.url));
const sanitizer = require.resolve('dompurify', { paths: [dirname(require.resolve('jspdf'))] });

test('jsPDF sanitizer removes ordinary hazards and neutralizes hook-detached descendants in Chrome', { timeout: 30_000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.addScriptTag({ path: join(dirname(sanitizer), 'purify.js') });
    const results = await page.evaluate(() => {
      const safe = DOMPurify.sanitize('<p>Hola <strong>Runly</strong></p><script>void 0</script><a href="javascript:void 0">enlace</a>');
      const ordinary = !safe.includes('<script') && !safe.includes('javascript:') && safe.includes('<strong>Runly</strong>');
      const hooks = {};
      for (const hook of ['beforeSanitizeElements', 'uponSanitizeElement', 'afterSanitizeElements', 'afterSanitizeAttributes']) {
        DOMPurify.removeAllHooks();
        const root = document.createElement('div');
        root.innerHTML = '<section id="fixture-wrap"><img onerror="void 0" onload="void 0"></section>';
        const image = root.querySelector('img');
        document.body.appendChild(root);
        DOMPurify.addHook(hook, node => { if (node.id === 'fixture-wrap') node.remove(); });
        DOMPurify.sanitize(root, { IN_PLACE: true });
        hooks[hook] = { removed: !root.querySelector('section'), neutralized: !image.hasAttribute('onerror') && !image.hasAttribute('onload') };
        root.remove();
      }
      DOMPurify.removeAllHooks();
      return { ordinary, hooks };
    });
    assert.equal(results.ordinary, true);
    for (const [hook, result] of Object.entries(results.hooks)) {
      assert.equal(result.removed, true, hook);
      assert.equal(result.neutralized, true, `${hook}: detached descendant must have no event attributes`);
    }
  } finally { await browser.close(); }
});
