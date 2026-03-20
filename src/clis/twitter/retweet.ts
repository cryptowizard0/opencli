import { cli, Strategy } from '../../registry.js';
import type { IPage } from '../../types.js';

cli({
  site: 'twitter',
  name: 'retweet',
  description: 'Retweet a specific tweet',
  domain: 'x.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'url', type: 'string', required: true, help: 'The URL of the tweet to retweet' },
  ],
  columns: ['status', 'message'],
  func: async (page: IPage | null, kwargs: any) => {
    if (!page) throw new Error('Requires browser');

    await page.goto(kwargs.url);
    await page.wait(5);

    const result = await page.evaluate(`(async () => {
      try {
        let attempts = 0;
        let retweetBtn = null;
        let unretweetBtn = null;

        while (attempts < 20) {
          unretweetBtn = document.querySelector('[data-testid="unretweet"]');
          retweetBtn = document.querySelector('[data-testid="retweet"]');

          if (unretweetBtn || retweetBtn) break;

          await new Promise(r => setTimeout(r, 500));
          attempts++;
        }

        if (unretweetBtn) {
          return { ok: true, message: 'Tweet is already retweeted.' };
        }

        if (!retweetBtn) {
          return { ok: false, message: 'Could not find the Retweet button on this tweet. Are you logged in?' };
        }

        retweetBtn.click();
        await new Promise(r => setTimeout(r, 800));

        const confirmBtn = document.querySelector('[data-testid="retweetConfirm"]');
        if (!confirmBtn) {
          return { ok: false, message: 'Retweet confirmation button not found.' };
        }

        confirmBtn.click();
        await new Promise(r => setTimeout(r, 1200));

        const verifyBtn = document.querySelector('[data-testid="unretweet"]');
        if (verifyBtn) {
          return { ok: true, message: 'Tweet successfully retweeted.' };
        }

        return { ok: false, message: 'Retweet action was initiated but UI did not update as expected.' };
      } catch (e) {
        return { ok: false, message: e.toString() };
      }
    })()`);

    if (result.ok) {
      await page.wait(2);
    }

    return [{
      status: result.ok ? 'success' : 'failed',
      message: result.message,
    }];
  }
});
