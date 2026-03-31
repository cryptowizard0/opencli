import { cli, Strategy } from '../../registry.js';
import { Script } from 'node:vm';
import { log as logger } from '../../logger.js';
import type { IPage } from '../../types.js';

export function normalizeTweetText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function buildVerificationSnippet(text: string): string {
  return normalizeTweetText(text).slice(0, 80);
}

export function composerHasExpectedText(actualText: string, expectedText: string): boolean {
  const actual = normalizeTweetText(actualText);
  const expected = normalizeTweetText(expectedText);
  return !!expected && actual.includes(expected);
}

export function normalizeTweetUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '');
    return `https://x.com${path}`;
  } catch {
    return url.trim();
  }
}

export function extractTweetStatusId(url: string): string | null {
  const trimmed = url.trim();
  const match = trimmed.match(/\/status\/(\d+)/i);
  return match?.[1] || null;
}

export function buildQuoteComposerUrls(url: string): string[] {
  const normalized = normalizeTweetUrl(url);
  const attachmentUrl = encodeURIComponent(normalized);
  return [
    `https://x.com/compose/post?attachment_url=${attachmentUrl}`,
    `https://x.com/compose/tweet?attachment_url=${attachmentUrl}`,
  ];
}

export function isQuoteComposerUrl(currentUrl: string, targetTweetUrl: string): boolean {
  try {
    const current = new URL(currentUrl);
    if (!/^\/compose\/(post|tweet)$/i.test(current.pathname)) {
      return false;
    }
    const attachment = current.searchParams.get('attachment_url');
    return !!attachment && normalizeTweetUrl(attachment) === normalizeTweetUrl(targetTweetUrl);
  } catch {
    return false;
  }
}

export function isQuoteMenuLabel(label: string): boolean {
  const normalized = normalizeTweetText(label).toLowerCase();
  if (!normalized) return false;
  if (/(^|\s)(reply|repl(y|ies)|write your reply)(\s|$)/i.test(normalized)) return false;
  return /(quote|quote post|quote tweet|引用|引用帖子|引用推文)/i.test(normalized);
}

export function tweetDetailUrlIncludesStatusId(currentUrl: string, targetStatusId: string): boolean {
  if (!targetStatusId) return false;
  return new RegExp(`/status/${targetStatusId}(?:[/?#]|$)`, 'i').test(currentUrl);
}

export function quoteComposerUrlIncludesTarget(currentUrl: string, targetTweetUrl: string): boolean {
  try {
    const current = new URL(currentUrl);
    if (!/^\/compose\/(post|tweet)$/i.test(current.pathname)) {
      return false;
    }
    const attachment = current.searchParams.get('attachment_url');
    return !!attachment && normalizeTweetUrl(attachment) === normalizeTweetUrl(targetTweetUrl);
  } catch {
    return false;
  }
}

export function buildQuoteSubmitScript(text: string, targetTweetUrl: string, targetStatusId: string): string {
  return `(async () => {
    try {
      function wait(ms) {
        return new Promise(function(resolve) { setTimeout(resolve, ms); });
      }
      function normalize(value) {
        return (value || '').replace(/\\s+/g, ' ').trim();
      }
      const expectedText = ${JSON.stringify(text)};
      const expectedNormalized = normalize(expectedText);
      const expectedTweetUrl = ${JSON.stringify(targetTweetUrl)};
      const expectedStatusId = ${JSON.stringify(targetStatusId)};

      function normalizeUrl(value) {
        try {
          const parsed = new URL(value);
          const path = parsed.pathname.replace(/\\/+$/, '');
          return 'https://x.com' + path;
        } catch {
          return normalize(value);
        }
      }

      function isQuoteComposerUrl() {
        try {
          if (!/^\\/compose\\/(post|tweet)$/i.test(window.location.pathname)) {
            return false;
          }
          const params = new URLSearchParams(window.location.search);
          const attachment = params.get('attachment_url');
          return !!attachment && normalizeUrl(attachment) === normalizeUrl(expectedTweetUrl);
        } catch {
          return false;
        }
      }

      function dialogHasTargetAttachment() {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return false;
        const links = Array.from(dialog.querySelectorAll('a[href*="/status/"]'));
        for (const link of links) {
          const rawHref = link.getAttribute('href') || '';
          const match = rawHref.match(/\\/status\\/(\\d+)/i);
          if (match && match[1] === expectedStatusId) {
            return true;
          }
        }
        return false;
      }

      function pageHasTargetAttachment() {
        const links = Array.from(document.querySelectorAll('a[href*="/status/"]'));
        for (const link of links) {
          const rawHref = link.getAttribute('href') || '';
          const match = rawHref.match(/\\/status\\/(\\d+)/i);
          if (match && match[1] === expectedStatusId) return true;
        }
        return false;
      }

      async function waitForAttachment(timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          if (dialogHasTargetAttachment() || pageHasTargetAttachment()) return true;
          await wait(250);
        }
        return false;
      }

      function inQuoteContext() {
        return isQuoteComposerUrl() || dialogHasTargetAttachment();
      }

      function getRoot() {
        const dialog = document.querySelector('[role="dialog"]');
        if (dialog) return dialog;
        if (isQuoteComposerUrl()) return document;
        return null;
      }

      function getComposer() {
        const root = getRoot();
        if (!root) return null;
        const container = root.querySelector('[data-testid="tweetTextarea_0"]');
        if (container && container.matches && container.matches('[contenteditable="true"], textarea')) {
          return container;
        }
        if (container) {
          const nested = container.querySelector('[contenteditable="true"][role="textbox"], [role="textbox"][contenteditable="true"], [contenteditable="true"], textarea, [role="textbox"]');
          if (nested) return nested;
        }
        return root.querySelector(
          '[contenteditable="true"][role="textbox"], [role="textbox"][contenteditable="true"], textarea, [aria-label="添加评论"], [aria-label="有什么新鲜事？"], [contenteditable="true"], [role="textbox"]'
        );
      }

      async function activateComposer() {
        const root = getRoot();
        if (!root) return;
        const promptMatchers = ['add comment', 'comment on post', '添加评论', '添加回應', '引用评论'];
        const clickable = Array.from(root.querySelectorAll('button, [role="button"], [tabindex="0"], div, span'));
        for (const el of clickable) {
          const text = normalize(el.textContent);
          const aria = normalize(el.getAttribute ? (el.getAttribute('aria-label') || '') : '');
          for (const prompt of promptMatchers) {
            if (text === prompt || aria === prompt) {
              el.click();
              await wait(250);
              return;
            }
          }
        }
      }

      function getComposerText(editor) {
        if (!editor) return '';
        if (editor.tagName === 'TEXTAREA') {
          return normalize(editor.value || '');
        }
        const aria = editor.getAttribute ? (editor.getAttribute('aria-label') || '') : '';
        return normalize(editor.innerText || editor.textContent || aria || '');
      }

      function describeComposerCandidates() {
        const root = getRoot() || document;
        const candidates = Array.from(root.querySelectorAll('[data-testid="tweetTextarea_0"], [contenteditable="true"], [role="textbox"], textarea'));
        return candidates.slice(0, 8).map(function(el) {
          const testId = el.getAttribute ? (el.getAttribute('data-testid') || '') : '';
          const aria = el.getAttribute ? (el.getAttribute('aria-label') || '') : '';
          const role = el.getAttribute ? (el.getAttribute('role') || '') : '';
          const text = normalize((el.tagName === 'TEXTAREA' ? el.value : el.textContent) || '').slice(0, 60);
          return {
            tag: el.tagName,
            testId,
            aria,
            role,
            contenteditable: el.getAttribute ? (el.getAttribute('contenteditable') || '') : '',
            text,
          };
        });
      }

      function describeInteractiveHints() {
        const root = getRoot() || document;
        const nodes = Array.from(root.querySelectorAll('button, a, input, textarea'));
        return nodes.slice(0, 12).map(function(el) {
          const testId = el.getAttribute ? (el.getAttribute('data-testid') || '') : '';
          const aria = el.getAttribute ? (el.getAttribute('aria-label') || '') : '';
          const text = normalize((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? el.value : el.textContent) || '').slice(0, 50);
          return {
            tag: el.tagName,
            testId,
            aria,
            text,
          };
        });
      }

      function countOccurrences(value, needle) {
        if (!needle) return 0;
        return value.split(needle).length - 1;
      }

      function placeCaretAtEnd(editor) {
        if (!editor) return;
        editor.focus();
        if (editor.tagName === 'TEXTAREA') {
          const length = (editor.value || '').length;
          if (typeof editor.setSelectionRange === 'function') {
            editor.setSelectionRange(length, length);
          }
          return;
        }
        const selection = window.getSelection ? window.getSelection() : null;
        if (!selection) return;
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      async function replaceComposerText(editor) {
        if (editor.tagName === 'TEXTAREA') {
          editor.value = '';
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          await wait(50);
          editor.value = expectedText;
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          editor.dispatchEvent(new Event('change', { bubbles: true }));
          await wait(300);
          return;
        }
        editor.textContent = '';
        editor.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          data: '',
          inputType: 'deleteContentBackward',
        }));
        await wait(50);

        editor.textContent = expectedText;
        editor.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          data: expectedText,
          inputType: 'insertText',
        }));
        editor.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(300);
      }

      async function insertComposerText(editor) {
        if (!editor) return false;
        if (editor.tagName === 'TEXTAREA') {
          editor.focus();
          editor.value = expectedText;
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          editor.dispatchEvent(new Event('change', { bubbles: true }));
          await wait(300);
          return getComposerText(editor) === expectedNormalized;
        }
        placeCaretAtEnd(editor);
        try {
          document.execCommand('insertText', false, expectedText);
        } catch {}
        await wait(400);

        let currentText = getComposerText(editor);
        if (currentText === expectedNormalized) {
          return true;
        }

        if (countOccurrences(currentText, expectedNormalized) > 1) {
          await replaceComposerText(editor);
          currentText = getComposerText(editor);
          return currentText === expectedNormalized;
        }

        await replaceComposerText(editor);
        currentText = getComposerText(editor);
        return currentText === expectedNormalized;
      }

      for (let i = 0; i < 20; i++) {
        if (!inQuoteContext()) {
          return { ok: false, message: 'Quote action opened a non-quote composer context.' };
        }

        // Even when the URL contains attachment_url, X may fail to load the quote card.
        // Require the quoted tweet attachment to be present before posting.
        const attachmentReady = await waitForAttachment(8000);
        if (!attachmentReady) {
          return {
            ok: false,
            message: 'Quote composer opened, but the quoted tweet attachment did not load.'
              + ' currentUrl=' + JSON.stringify(window.location.href)
              + ' hasDialog=' + JSON.stringify(!!document.querySelector('[role="dialog"]')),
          };
        }

        let editor = getComposer();
        if (!editor) {
          await activateComposer();
          editor = getComposer();
        }
        if (editor) {
          const inserted = await insertComposerText(editor);
          if (!inserted) {
            return { ok: false, message: 'Quote composer opened, but commentary text did not appear in the editor.' };
          }

          await wait(500);

          const root = getRoot();
          if (!root) {
            return { ok: false, message: 'Quote composer lost its context before submission.' };
          }
          const btn = root.querySelector('[data-testid="tweetButton"]')
            || root.querySelector('[data-testid="tweetButtonInline"]');
          if (!btn || btn.disabled) {
            return { ok: false, message: 'Quote composer opened, but the Post button is disabled or missing.' };
          }

          btn.click();
          return { ok: true, message: 'Quoted tweet posted successfully.' };
        }
        await wait(500);
      }

      return {
        ok: false,
        message: 'Quote composer did not open in time.'
          + ' currentUrl=' + JSON.stringify(window.location.href)
          + ' inQuoteContext=' + JSON.stringify(inQuoteContext())
          + ' hasRoot=' + JSON.stringify(!!getRoot())
          + ' candidates=' + JSON.stringify(describeComposerCandidates())
          + ' hints=' + JSON.stringify(describeInteractiveHints())
          + ' bodyPreview=' + JSON.stringify(normalize((document.body && document.body.innerText) || '').slice(0, 240)),
      };
    } catch (e) {
      return { ok: false, message: e.toString() };
    }
  })()`;
}

function summarizeScript(script: string): string {
  return script
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 240);
}

function validateScript(stage: string, script: string): string | null {
  try {
    new Script(script);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `${stage} script syntax check failed: ${message}. Preview: ${summarizeScript(script)}`;
  }
}

function buildDismissStaleComposerScript(): string {
  return `(async () => {
    try {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const composeMarkers = [
        '你正在发布关于 @',
        'you’re posting about @',
        "you're posting about @",
        'post your reply',
        'add comment',
        '有什么新鲜事',
      ];
      const discardMatchers = [
        'discard',
        'discard draft',
        '放弃',
        '舍弃',
        '丢弃',
        '不保存',
      ];

      const bodyText = normalize(document.body?.innerText || '');
      const hasComposeMarker = composeMarkers.some(marker => bodyText.includes(normalize(marker)));
      if (!hasComposeMarker) {
        return { ok: true, message: 'No stale composer detected.' };
      }

      const closeCandidates = Array.from(document.querySelectorAll('button, [role="button"]'));
      const closeButton = closeCandidates.find(el => {
        const aria = normalize(el.getAttribute?.('aria-label') || '');
        const text = normalize(el.textContent || '');
        const testId = normalize(el.getAttribute?.('data-testid') || '');
        return aria === 'close'
          || aria === '关闭'
          || testId.includes('close')
          || text === '关闭';
      });

      if (closeButton) {
        closeButton.click();
        await wait(300);
      }

      const confirmButtons = Array.from(document.querySelectorAll('button, [role="button"]'));
      const discardButton = confirmButtons.find(el => {
        const text = normalize(el.textContent || '');
        const aria = normalize(el.getAttribute?.('aria-label') || '');
        return discardMatchers.some(marker => text.includes(marker) || aria.includes(marker));
      });

      if (discardButton) {
        discardButton.click();
        await wait(500);
      }

      return { ok: true, message: 'Dismissed stale composer state.' };
    } catch (e) {
      return { ok: false, message: e.toString() };
    }
  })()`;
}

cli({
  site: 'twitter',
  name: 'quote',
  description: 'Quote a specific tweet with commentary',
  domain: 'x.com',
  strategy: Strategy.UI,
  browser: true,
  // Verification can take longer depending on timeline refresh & rate limits.
  timeoutSeconds: 180,
  args: [
    { name: 'url', type: 'string', required: true, help: 'The URL of the tweet to quote' },
    { name: 'text', type: 'string', required: true, help: 'The commentary to add to the quoted tweet' },
  ],
  columns: ['status', 'message', 'text'],
  func: async (page: IPage | null, kwargs: any, debug: boolean = false) => {
    if (!page) throw new Error('Requires browser');
    const inputText = typeof kwargs.text === 'string' ? kwargs.text.replace(/\\n/g, '\n') : String(kwargs.text ?? '');
    const verificationSnippet = buildVerificationSnippet(inputText);
    const normalizedTweetUrl = normalizeTweetUrl(kwargs.url);
    const targetStatusId = extractTweetStatusId(kwargs.url);
    const directComposerUrls = buildQuoteComposerUrls(kwargs.url);

    const trace: string[] = [];
    const step = (line: string) => {
      trace.push(line);
      if (debug) {
        logger.verbose(`[twitter/quote] ${line}`);
      }
    };
    const fail = (message: string) => [{
      status: 'failed',
      message: debug ? `${message}\n\n---\ntrace:\n${trace.map(s => `- ${s}`).join('\n')}` : message,
      text: inputText,
    }];

    await page.newTab();
    step('page.newTab()');
    await page.wait(1);
    step('page.wait(1s)');

    await page.goto('https://x.com');
    step('page.goto("https://x.com")');
    await page.wait(3);
    step('page.wait(3s)');

    step('page.evaluate(dismissStaleComposerScript)');
    const dismissStaleComposerResult = await page.evaluate(buildDismissStaleComposerScript());
    step(`dismissStaleComposerResult=${JSON.stringify(dismissStaleComposerResult)}`);
    if (!dismissStaleComposerResult?.ok) {
      return fail(`Failed to dismiss stale composer state: ${dismissStaleComposerResult?.message || 'unknown error'}`);
    }

    await page.goto(kwargs.url);
    step(`page.goto(${JSON.stringify(kwargs.url)})`);
    await page.wait(5);
    step('page.wait(5s)');

    if (targetStatusId) {
      step('page.evaluate(window.location.href) to confirm tweet detail');
      const currentUrl = await page.evaluate('window.location.href');
      step(`currentUrl=${JSON.stringify(currentUrl)}`);
      if (typeof currentUrl !== 'string' || !tweetDetailUrlIncludesStatusId(currentUrl, targetStatusId)) {
        return fail(`Did not land on the target tweet detail page before opening the quote flow. Current URL: ${String(currentUrl)}`);
      }
    }

    step('page.evaluate(openMenuScript)');
    const openMenuResult = await page.evaluate(`(async () => {
      try {
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        const targetStatusId = ${JSON.stringify(targetStatusId || '')};
        let attempts = 0;

        while (attempts < 20) {
          const articles = Array.from(document.querySelectorAll('article'));
          let targetArticle = null;

          for (const article of articles) {
            const links = Array.from(article.querySelectorAll('a[href*="/status/"]'));
            const hasTargetStatus = links.some(link => {
              const href = link.getAttribute('href') || '';
              const match = href.match(/\\/status\\/(\\d+)/i);
              return match && match[1] === targetStatusId;
            });
            if (hasTargetStatus) {
              targetArticle = article;
              break;
            }
          }

          if (targetArticle) {
            const unretweetBtn = targetArticle.querySelector('[data-testid="unretweet"]');
            const retweetBtn = targetArticle.querySelector('[data-testid="retweet"]');
            const menuTrigger = unretweetBtn || retweetBtn;

            if (menuTrigger) {
              menuTrigger.click();
              return { ok: true, message: 'Retweet menu opened for the target tweet.' };
            }
          }

          await wait(500);
          attempts++;
        }

        return { ok: false, message: 'Could not find the Retweet/Repost button on the target tweet detail.' };
      } catch (e) {
        return { ok: false, message: e.toString() };
      }
    })()`);

    let result = openMenuResult;
    step(`openMenuResult=${JSON.stringify(openMenuResult)}`);

    if (openMenuResult.ok) {
      await page.wait(1);
      step('page.wait(1s)');

      const openComposerScript = `(async () => {
      try {
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        const normalizedTweetUrl = ${JSON.stringify(normalizedTweetUrl)};
        const targetStatusId = ${JSON.stringify(targetStatusId || '')};
        const isQuoteMenuLabel = (label) => {
          const normalized = (label || '').replace(/\\s+/g, ' ').trim().toLowerCase();
          if (!normalized) return false;
          if (/(^|\\s)(reply|repl(y|ies)|write your reply)(\\s|$)/i.test(normalized)) return false;
          return /(quote|quote post|quote tweet|引用|引用帖子|引用推文)/i.test(normalized);
        };
        const normalizeUrl = (value) => {
          try {
            const parsed = new URL(value);
            const path = parsed.pathname.replace(/\\/+$/, '');
            return 'https://x.com' + path;
          } catch {
            return (value || '').trim();
          }
        };
        const isExpectedQuoteUrl = () => {
          try {
            if (!/^\\/compose\\/(post|tweet)$/i.test(window.location.pathname)) {
              return false;
            }
            const params = new URLSearchParams(window.location.search);
            const attachment = params.get('attachment_url');
            return !!attachment && normalizeUrl(attachment) === normalizeUrl(normalizedTweetUrl);
          } catch {
            return false;
          }
        };
        const dialogHasTargetAttachment = () => {
          const dialog = document.querySelector('[role="dialog"]');
          if (!dialog) return false;
          const links = Array.from(dialog.querySelectorAll('a[href*="/status/"]'));
          return links.some(link => {
            const href = link.getAttribute('href') || '';
            const match = href.match(/\\/status\\/(\\d+)/i);
            return match && match[1] === targetStatusId;
          });
        };

        const summarizeMenuItems = () => {
          const menu = document.querySelector('[role="menu"]');
          if (!menu) return [];
          const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
          return items.slice(0, 12).map(el => ({
            tag: el.tagName,
            text: (el.textContent || '').trim().slice(0, 80),
            aria: (el.getAttribute('aria-label') || '').trim().slice(0, 80),
            href: (el.getAttribute('href') || '').trim(),
            testId: (el.getAttribute('data-testid') || '').trim(),
          }));
        };

        const describeContext = () => ({
          url: window.location.href,
          path: window.location.pathname,
          search: window.location.search,
          hasDialog: !!document.querySelector('[role="dialog"]'),
          hasMenu: !!document.querySelector('[role="menu"]'),
        });

        for (let i = 0; i < 20; i++) {
          const menu = document.querySelector('[role="menu"]');
          const candidates = menu
            ? Array.from(menu.querySelectorAll('[role="menuitem"]'))
            : [];
          const quoteTrigger = candidates.find(el => {
            const text = (el.textContent || '').trim();
            const aria = (el.getAttribute('aria-label') || '').trim();
            const href = el.getAttribute('href') || '';
            const dataTestId = el.getAttribute('data-testid') || '';
            return isQuoteMenuLabel(text)
              || isQuoteMenuLabel(aria)
              || /compose\\/post/i.test(href)
              || /quote/i.test(dataTestId);
          });
          if (quoteTrigger) {
            const clickedText = (quoteTrigger.textContent || '').trim();
            const clickedAria = (quoteTrigger.getAttribute('aria-label') || '').trim();
            const clickedHref = quoteTrigger.getAttribute('href') || '';
            const targetComposerHref = '/compose/post?attachment_url=' + encodeURIComponent(normalizedTweetUrl);
            const before = describeContext();
            const menuSummary = summarizeMenuItems();
            let patchedHref = null;
            let didClick = false;
            if (quoteTrigger.tagName === 'A') {
              const href = quoteTrigger.getAttribute('href') || '';
              if (/^\\/compose\\/post$/i.test(href)) {
                quoteTrigger.setAttribute('href', targetComposerHref);
                patchedHref = targetComposerHref;
              }
              // Simulate a real user click sequence; X sometimes ignores a bare .click().
              quoteTrigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
              quoteTrigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
              quoteTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
              didClick = true;
            } else {
              quoteTrigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
              quoteTrigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
              quoteTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
              didClick = true;
            }

            for (let attempt = 0; attempt < 20; attempt++) {
              if (isExpectedQuoteUrl() || dialogHasTargetAttachment()) {
                return {
                  ok: true,
                  message: 'Quote composer opened.',
                  clickedText,
                  clickedAria,
                  clickedHref,
                  currentUrl: window.location.href,
                  debug: {
                    before,
                    after: describeContext(),
                    menuSummary,
                    patchedHref,
                    didClick,
                    attempt,
                  },
                };
              }
              await wait(250);
            }

            const after = describeContext();
            const landedGenericCompose = /^\\/compose\\/(post|tweet)$/i.test(after.path) && !/attachment_url=/.test(after.search || '');
            const hasFallbackNav = /^\\/compose\\/post$/i.test(clickedHref);
            return {
              ok: hasFallbackNav,
              message: (hasFallbackNav
                ? 'Quote menu item click did not open the quote composer; falling back to explicit navigation.'
                : 'Quote-looking menu action was clicked, but it did not open the target quote composer.')
                + ' clickedText=' + JSON.stringify(clickedText)
                + ' clickedAria=' + JSON.stringify(clickedAria)
                + ' clickedHref=' + JSON.stringify(clickedHref)
                + ' currentUrl=' + JSON.stringify(window.location.href),
              navigateTo: hasFallbackNav ? targetComposerHref : null,
              clickedText,
              clickedAria,
              clickedHref,
              currentUrl: window.location.href,
              debug: {
                before,
                after,
                menuSummary,
                patchedHref,
                didClick,
                landedGenericCompose,
                expectedQuoteUrl: isExpectedQuoteUrl(),
                dialogHasTargetAttachment: dialogHasTargetAttachment(),
              },
            };
          }
          await wait(250);
        }
        return { ok: false, message: 'Could not find the Quote action in the retweet menu.' };
      } catch (e) {
        return { ok: false, message: e.toString() };
      }
    })()`;
      const openComposerSyntaxError = validateScript('openComposer', openComposerScript);
      if (openComposerSyntaxError) {
        return fail(openComposerSyntaxError);
      }

      let openComposerResult;
      try {
        step('page.evaluate(openComposerScript)');
        openComposerResult = await page.evaluate(openComposerScript);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return fail(`openComposer evaluate failed: ${message}. Preview: ${summarizeScript(openComposerScript)}`);
      }
      step(`openComposerResult=${JSON.stringify(openComposerResult)}`);

      if (debug && openComposerResult && openComposerResult.ok === false) {
        try {
          const snap = await page.snapshot({ interactive: true, compact: true, maxDepth: 26 });
          step('page.snapshot(interactive,compact,maxDepth=26) captured after openComposer failure');
          // Attach to the message so the table output reveals the DOM shape immediately.
          openComposerResult = {
            ...openComposerResult,
            debugSnapshot: typeof snap === 'string' ? snap.slice(0, 3500) : JSON.stringify(snap).slice(0, 3500),
          };
          step(`openComposerDebugSnapshot=${JSON.stringify({ size: (openComposerResult as any).debugSnapshot?.length || 0 })}`);
        } catch (e) {
          step(`openComposerSnapshotError=${String(e)}`);
        }
      }

      if (openComposerResult?.navigateTo) {
        const navUrl = `https://x.com${openComposerResult.navigateTo}`;
        step(`page.goto(${JSON.stringify(navUrl)}) (explicit quote navigation)`);
        await page.goto(navUrl);
        await page.wait(5);
        step('page.wait(5s)');
        openComposerResult = {
          ok: true,
          message: `Quote composer opened via explicit navigation to ${openComposerResult.navigateTo}`,
        };
        step(`openComposerResult=${JSON.stringify(openComposerResult)}`);
      }

      result = openComposerResult;

      if (openComposerResult.ok) {
        await page.wait(2);
        step('page.wait(2s)');

        // X sometimes navigates to a generic /compose/post (no attachment_url)
        // even when the user clicked "Quote". Detect and correct it before submit.
        step('page.evaluate(window.location.href) to verify quote composer target');
        const currentComposerUrl = await page.evaluate('window.location.href');
        step(`currentComposerUrl=${JSON.stringify(currentComposerUrl)}`);
        if (typeof currentComposerUrl === 'string') {
          const isGenericCompose =
            /^https:\/\/x\.com\/compose\/(post|tweet)(?:[?#]|$)/i.test(currentComposerUrl)
            && !quoteComposerUrlIncludesTarget(currentComposerUrl, normalizedTweetUrl);
          if (isGenericCompose) {
            step(`Detected generic composer; forcing navigation to ${directComposerUrls[0]}`);
            await page.goto(directComposerUrls[0]);
            step(`page.goto(${JSON.stringify(directComposerUrls[0])}) (force attachment_url)`);
            await page.wait(5);
            step('page.wait(5s)');
          }
        }

        const submitScript = buildQuoteSubmitScript(inputText, normalizedTweetUrl, targetStatusId || '');
        const submitSyntaxError = validateScript('submitQuote', submitScript);
        if (submitSyntaxError) {
          return fail(submitSyntaxError);
        }

        try {
          step('page.evaluate(submitQuoteScript)');
          result = await page.evaluate(submitScript);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return fail(`submitQuote evaluate failed: ${message}. Preview: ${summarizeScript(submitScript)}`);
        }
        step(`submitQuoteResult=${JSON.stringify(result)}`);

        // If the composer opened but the quoted attachment didn't load, try the alternate compose route.
        if (result && result.ok === false && typeof result.message === 'string'
          && result.message.includes('quoted tweet attachment did not load')) {
          step(`Retrying via alternate composer url: ${directComposerUrls[1]}`);
          await page.goto(directComposerUrls[1]);
          step(`page.goto(${JSON.stringify(directComposerUrls[1])}) (alternate attachment_url route)`);
          await page.wait(5);
          step('page.wait(5s)');

          try {
            step('page.evaluate(submitQuoteScript) (retry)');
            result = await page.evaluate(submitScript);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return fail(`submitQuote evaluate failed (retry): ${message}. Preview: ${summarizeScript(submitScript)}`);
          }
          step(`submitQuoteResult(retry)=${JSON.stringify(result)}`);
        }
      } else {
        return fail(String(openComposerResult.message));
      }
    }

    if (result.ok) {
      await page.wait(3);
      step('page.wait(3s)');

      step('page.evaluate(read profile link for verification)');
      const usernameHref = await page.evaluate(`(() => {
        const link = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
        return link ? link.getAttribute('href') : null;
      })()`);
      step(`usernameHref=${JSON.stringify(usernameHref)}`);
      const username = typeof usernameHref === 'string' ? usernameHref.replace(/^\//, '') : '';

      if (!username) {
        return fail('Quote submit was triggered, but could not detect the logged-in profile for verification.');
      }

      await page.goto(`https://x.com/${username}`);
      step(`page.goto("https://x.com/${username}")`);
      await page.wait(5);
      step('page.wait(5s)');

      step('page.evaluate(verificationScript)');
	      const verification = await page.evaluate(`(async () => {
	        try {
	          const wait = (ms) => new Promise(r => setTimeout(r, ms));
	          const screenName = ${JSON.stringify(username.toLowerCase())};
	          const expected = ${JSON.stringify(verificationSnippet.toLowerCase())};
	          const targetStatusId = ${JSON.stringify(targetStatusId || '')};
	          const pinnedMarkers = ['Pinned', '已置顶', '置顶'];

          function normalize(text) {
            return (text || '').replace(/\\s+/g, ' ').trim().toLowerCase();
          }

          function findLatestCandidate() {
            const articles = Array.from(document.querySelectorAll('article'));
            const candidates = [];

            for (const article of articles) {
              const links = Array.from(article.querySelectorAll('a[href*="/status/"]'));
              const match = links
                .map(link => link.getAttribute('href') || '')
                .find(href => new RegExp('^/' + screenName + '/status/\\\\d+$', 'i').test(href));
              if (!match) continue;

              const hasQuotedTarget = links
                .map(link => link.getAttribute('href') || '')
                .some(href => new RegExp('/status/' + targetStatusId + '(?:$|[/?#])', 'i').test(href));

              const time = article.querySelector('time');
              const textNode = article.querySelector('[data-testid="tweetText"]');
              const text = textNode ? (textNode.textContent || '').trim() : '';
              const articleText = article.textContent || '';
              const isPinned = pinnedMarkers.some(marker => articleText.includes(marker));

              candidates.push({
                url: 'https://x.com' + match,
                createdAt: time?.getAttribute('datetime') || '',
                text,
                normalizedText: normalize(text),
                hasQuotedTarget,
                isPinned,
              });
            }

            const latest = candidates.find(item => !item.isPinned) || candidates[0];
            return { latest, candidates };
          }

          for (let attempt = 0; attempt < 20; attempt++) {
            const { latest, candidates } = findLatestCandidate();
            if (latest && latest.normalizedText.includes(expected) && latest.hasQuotedTarget) {
	              return {
	                ok: true,
	                message: 'Quoted tweet posted successfully.',
	                url: latest.url,
	              };
	            }
            // If the text matches but the timeline didn't expose the quoted attachment links,
            // open the tweet detail and check again before failing.
            if (latest && latest.normalizedText.includes(expected) && !latest.hasQuotedTarget) {
              try {
                const res = await fetch(latest.url, { credentials: 'include' });
                const html = await res.text();
                const hasTargetInDetail = targetStatusId
                  ? (
                    // Prefer entity-based verification inside embedded JSON.
                    new RegExp('quoted_status(_id(_str)?)?[^0-9]{0,50}' + targetStatusId, 'i').test(html)
                    // Fallback: a direct link to the quoted status.
                    || new RegExp('/status/' + targetStatusId + '(?:[\"\\\\s/?#]|$)', 'i').test(html)
                  )
                  : false;
                if (hasTargetInDetail) {
                  return {
                    ok: true,
                    message: 'Quoted tweet posted successfully (verified via tweet detail).',
                    url: latest.url,
                  };
                }
              } catch (e) {
                // ignore and fall through to fail with debug context
              }

              return {
                ok: false,
                message: 'Tweet text was posted, but the resulting tweet does not contain the expected quoted tweet attachment.',
                url: latest.url,
                debug: {
                  attempt,
                  candidateCount: candidates.length,
                  latest: latest,
                  preview: candidates.slice(0, 5),
                },
              };
            }

	            await wait(1000);
	          }

          return {
            ok: false,
            message: 'Quote submit was triggered, but the tweet did not appear on the profile timeline during verification.',
          };
        } catch (e) {
          return { ok: false, message: e.toString() };
        }
      })()`);
      step(`verificationResult=${JSON.stringify(verification)}`);

      if (!verification?.ok && debug && verification?.url && targetStatusId) {
        // Deep verify by navigating to the posted tweet and inspecting the DOM directly.
        // This is more reliable than timeline DOM heuristics.
        try {
          step(`page.goto(${JSON.stringify(verification.url)}) (deep-verify posted tweet)`);
          await page.goto(String(verification.url));
          await page.wait(5);
          step('page.wait(5s)');

          step('page.evaluate(deepVerifyDomScript)');
          const deepVerify = await page.evaluate(`(() => {
            try {
              const targetStatusId = ${JSON.stringify(String(targetStatusId))};
              const hrefs = Array.from(document.querySelectorAll('a[href]'))
                .map(a => a.getAttribute('href') || '')
                .filter(Boolean);
              const hit = hrefs.find(h => new RegExp('/status/' + targetStatusId + '(?:$|[/?#])', 'i').test(h));
              const html = document.documentElement?.innerHTML || '';
              const jsonHit = targetStatusId
                ? new RegExp('quoted_status(_id(_str)?)?[^0-9]{0,50}' + targetStatusId, 'i').test(html)
                : false;
              const isQuotePage = /\\/status\\//i.test(window.location.pathname);
              const debug = {
                isQuotePage,
                currentUrl: window.location.href,
                anchorHit: hit || null,
                jsonHit,
                hrefSample: hrefs.slice(0, 40),
              };
              return { ok: !!hit || jsonHit, hit: hit || null, debug };
            } catch (e) {
              return { ok: false, error: e.toString() };
            }
          })()`);
          step(`deepVerifyResult=${JSON.stringify(deepVerify)}`);

          if (deepVerify?.ok) {
            return [{
              status: 'success',
              message: debug
                ? `Quoted tweet posted successfully (deep verified via DOM on tweet detail).\n\n---\ntrace:\n${trace.map(s => `- ${s}`).join('\n')}`
                : 'Quoted tweet posted successfully.',
              text: kwargs.text,
            }];
          }

          // Capture a compact interactive snapshot for debugging DOM changes.
          const snap = await page.snapshot({ interactive: true, compact: true, maxDepth: 30 });
          step('page.snapshot(interactive,compact,maxDepth=30) captured');

          return [{
            status: 'failed',
            message: [
              String(verification.message ?? 'Verification failed.'),
              '',
              `postedUrl=${String(verification.url)}`,
              `deepVerify=${JSON.stringify(deepVerify)}`,
              '',
              '---',
              'trace:',
              ...trace.map(s => `- ${s}`),
              '',
              '---',
              'snapshot:',
              typeof snap === 'string' ? snap.slice(0, 4000) : JSON.stringify(snap).slice(0, 4000),
            ].join('\n'),
            text: kwargs.text,
          }];
        } catch (e) {
          step(`deepVerifyError=${String(e)}`);
          // Fall through to original verification result.
        }
      }

      return [{
        status: verification.ok ? 'success' : 'failed',
        message: debug ? `${verification.message}\n\n---\ntrace:\n${trace.map(s => `- ${s}`).join('\n')}` : verification.message,
        text: inputText,
      }];
    }

    return [{
      status: result.ok ? 'success' : 'failed',
      message: debug ? `${result.message}\n\n---\ntrace:\n${trace.map(s => `- ${s}`).join('\n')}` : result.message,
      text: inputText,
    }];
  }
});
