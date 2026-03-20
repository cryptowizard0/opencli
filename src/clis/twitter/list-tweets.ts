import { cli, Strategy } from '../../registry.js';

type ListTweet = {
  id: string;
  author: string;
  text: string;
  created_at: string;
  url: string;
};

cli({
  site: 'twitter',
  name: 'list-tweets',
  description: 'Read tweets from a Twitter/X list URL',
  domain: 'x.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'url', type: 'string', required: true, help: 'Twitter/X list URL, e.g. https://x.com/i/lists/<id>' },
    { name: 'limit', type: 'int', default: 20, help: 'Maximum number of tweets to return' },
  ],
  columns: ['id', 'author', 'text', 'created_at', 'url'],
  func: async (page, kwargs) => {
    const listUrl = kwargs.url;
    const limit = kwargs.limit || 20;

    await page.goto(listUrl);
    await page.wait(8);

    const collected = new Map<string, ListTweet>();

    const readBatch = async () => {
      return page.evaluate(`(() => {
        const rows = [];
        const seen = new Set();
        for (const article of Array.from(document.querySelectorAll('article'))) {
          const links = Array.from(article.querySelectorAll('a[href*="/status/"]'));
          const href = links
            .map(link => link.getAttribute('href') || '')
            .find(value => /^\\/[A-Za-z0-9_]+\\/status\\/\\d+$/.test(value));
          if (!href || seen.has(href)) continue;
          seen.add(href);

          const match = href.match(/^\\/([^/]+)\\/status\\/(\\d+)$/);
          if (!match) continue;

          const textNode = article.querySelector('[data-testid="tweetText"]');
          const timeNode = article.querySelector('time');
          rows.push({
            id: match[2],
            author: match[1],
            text: textNode ? textNode.textContent.trim() : '',
            created_at: timeNode ? (timeNode.getAttribute('datetime') || '') : '',
            url: 'https://x.com' + href,
          });
        }
        return rows;
      })()`);
    };

    for (let i = 0; i < 6 && collected.size < limit; i++) {
      let batch = await readBatch();
      if ((!Array.isArray(batch) || batch.length === 0) && i < 2) {
        await page.wait(1);
        batch = await readBatch();
      }

      if (Array.isArray(batch)) {
        for (const item of batch) {
          if (item?.id && !collected.has(item.id)) {
            collected.set(item.id, item);
          }
        }
      }

      if (collected.size >= limit) break;
      await page.autoScroll({ times: 1, delayMs: 1500 });
    }

    return Array.from(collected.values()).slice(0, limit);
  },
});
