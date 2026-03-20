import { cli, Strategy } from '../../registry.js';
import type { IPage } from '../../types.js';

cli({
  site: 'twitter',
  name: 'quote',
  description: 'Quote a specific tweet with commentary',
  domain: 'x.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'url', type: 'string', required: true, help: 'The URL of the tweet to quote' },
    { name: 'text', type: 'string', required: true, help: 'The commentary to add to the quoted tweet' },
  ],
  columns: ['status', 'message', 'text'],
  func: async (page: IPage | null, kwargs: any) => {
    if (!page) throw new Error('Requires browser');

    await page.goto(kwargs.url);
    await page.wait(5);

    const result = await page.evaluate(`(async () => {
      try {
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        let attempts = 0;
        let retweetBtn = null;
        let unretweetBtn = null;

        while (attempts < 20) {
          unretweetBtn = document.querySelector('[data-testid="unretweet"]');
          retweetBtn = document.querySelector('[data-testid="retweet"]');
          if (retweetBtn || unretweetBtn) break;
          await wait(500);
          attempts++;
        }

        if (unretweetBtn) {
          unretweetBtn.click();
          await wait(800);
          const undoBtn = document.querySelector('[data-testid="unretweetConfirm"]');
          if (undoBtn) {
            undoBtn.click();
            await wait(1200);
          }
          retweetBtn = document.querySelector('[data-testid="retweet"]');
        }

        if (!retweetBtn) {
          return { ok: false, message: 'Could not find the Retweet button on this tweet.' };
        }

        retweetBtn.click();
        await wait(1000);

        const candidates = Array.from(document.querySelectorAll('[role="menuitem"], div[tabindex="0"], a, button'));
        const quoteTrigger = candidates.find(el => /quote|引用/i.test((el.textContent || '').trim()));
        if (!quoteTrigger) {
          return { ok: false, message: 'Could not find the Quote action in the retweet menu.' };
        }
        quoteTrigger.click();

        for (let i = 0; i < 20; i++) {
          const box = document.querySelector('[data-testid="tweetTextarea_0"]');
          if (box) {
            box.focus();
            document.execCommand('insertText', false, ${JSON.stringify(kwargs.text)});
            await wait(1000);

            const btn = document.querySelector('[data-testid="tweetButton"]')
              || document.querySelector('[data-testid="tweetButtonInline"]');
            if (!btn || btn.disabled) {
              return { ok: false, message: 'Quote composer opened, but the Post button is disabled or missing.' };
            }

            btn.click();
            return { ok: true, message: 'Quoted tweet posted successfully.' };
          }
          await wait(500);
        }

        return { ok: false, message: 'Quote composer did not open in time.' };
      } catch (e) {
        return { ok: false, message: e.toString() };
      }
    })()`);

    if (result.ok) {
      await page.wait(3);
    }

    return [{
      status: result.ok ? 'success' : 'failed',
      message: result.message,
      text: kwargs.text,
    }];
  }
});
