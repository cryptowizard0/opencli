import { cli, Strategy } from '../../registry.js';
import type { IPage } from '../../types.js';

cli({
  site: 'twitter',
  name: 'latest',
  description: 'Find the latest visible tweet for a user from their profile page',
  domain: 'x.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'username', type: 'string', positional: true, required: true, help: 'Twitter screen name (without @)' },
  ],
  columns: ['username', 'url', 'created_at', 'text'],
  func: async (page: IPage | null, kwargs: any) => {
    if (!page) throw new Error('Requires browser');
    const username = kwargs.username.replace(/^@/, '');

    await page.goto(`https://x.com/${username}`);
    await page.wait(5);

    const result = await page.evaluate(`(async () => {
      try {
        const screenName = ${JSON.stringify(username)}.toLowerCase();
        const pinnedMarkers = ['Pinned', '已置顶', '置顶'];

        for (let attempt = 0; attempt < 20; attempt++) {
          const articles = Array.from(document.querySelectorAll('article'));
          const candidates = [];

          for (const article of articles) {
            const links = Array.from(article.querySelectorAll('a[href*="/status/"]'));
            const match = links
              .map(link => link.getAttribute('href') || '')
              .find(href => new RegExp('^/' + screenName + '/status/\\\\d+$', 'i').test(href));
            if (!match) continue;

            const time = article.querySelector('time');
            const textNode = article.querySelector('[data-testid="tweetText"]');
            const text = textNode ? textNode.textContent.trim() : '';
            const articleText = article.textContent || '';
            const isPinned = pinnedMarkers.some(marker => articleText.includes(marker));

            candidates.push({
              username: screenName,
              url: 'https://x.com' + match,
              created_at: time?.getAttribute('datetime') || '',
              text,
              isPinned,
            });
          }

          if (candidates.length > 0) {
            const preferred = candidates.find(item => !item.isPinned) || candidates[0];
            return [preferred];
          }

          await new Promise(r => setTimeout(r, 500));
        }

        return { error: 'Could not find a visible tweet on the profile page.' };
      } catch (e) {
        return { error: e.toString() };
      }
    })()`);

    if (!Array.isArray(result)) {
      throw new Error(result?.error || 'Could not find latest tweet');
    }

    return result.map(({ isPinned, ...item }: any) => item);
  }
});
