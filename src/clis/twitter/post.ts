import { Script } from 'node:vm';
import { cli, Strategy } from '../../registry.js';
import { log as logger } from '../../logger.js';
import type { IPage } from '../../types.js';

export function normalizePostText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function buildPostVerificationSnippet(text: string): string {
  // X may reorder link previews ahead of the typed text in timeline rendering.
  // Prefer verifying based on the first non-URL text segment.
  const withoutUrls = String(text).replace(/https?:\/\/\S+/gi, ' ');
  return normalizePostText(withoutUrls).slice(0, 80) || normalizePostText(text).slice(0, 80);
}

export function composerHasExpectedPostText(actualText: string, expectedText: string): boolean {
  const actual = normalizePostText(actualText);
  const expected = normalizePostText(expectedText);
  return !!expected && actual.includes(expected);
}

export function isPostComposerUrl(currentUrl: string): boolean {
  try {
    const current = new URL(currentUrl);
    if (!/^\/compose\/(post|tweet)$/i.test(current.pathname)) {
      return false;
    }
    return !current.searchParams.get('attachment_url');
  } catch {
    return false;
  }
}

export function buildPostComposerUrls(): string[] {
  return [
    'https://x.com/compose/post',
    'https://x.com/compose/tweet',
  ];
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
        'post your reply',
        'add comment',
        'you’re posting about @',
        "you're posting about @",
        '有什么新鲜事',
      ];
      const discardMatchers = ['discard', 'discard draft', '放弃', '舍弃', '丢弃', '不保存'];

      function hasComposerDialog(root) {
        if (!root) return false;
        return !!root.querySelector('[data-testid="tweetTextarea_0"], [role="textbox"], textarea, [data-testid="tweetButton"], [data-testid="tweetButtonInline"]');
      }

      function hasAttachmentContext(root) {
        if (!root) return false;
        return !!root.querySelector(
          'a[href*="/status/"], [data-testid="card.wrapper"], [data-testid="attachments"], [aria-label*="Quote" i], [aria-label*="引用" i]'
        );
      }

      const bodyText = normalize(document.body?.innerText || '');
      const dialog = document.querySelector('[role="dialog"]');
      const hasComposeMarker = composeMarkers.some(marker => bodyText.includes(normalize(marker)));
      const hasGenericComposer = hasComposerDialog(dialog);
      const hasAttachment = hasAttachmentContext(dialog);

      if (!hasComposeMarker && !hasGenericComposer && !hasAttachment) {
        return { ok: true, message: 'No stale composer detected.' };
      }

      const closeCandidates = Array.from((dialog || document).querySelectorAll('button, [role="button"]'));
      const closeButton = closeCandidates.find(el => {
        const aria = normalize(el.getAttribute?.('aria-label') || '');
        const text = normalize(el.textContent || '');
        const testId = normalize(el.getAttribute?.('data-testid') || '');
        return aria === 'close' || aria === '关闭' || text === '关闭' || testId.includes('close');
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

      return {
        ok: true,
        message: 'Dismissed stale composer state.',
        debug: {
          hasComposeMarker,
          hasGenericComposer,
          hasAttachment,
        }
      };
    } catch (e) {
      return { ok: false, message: e.toString() };
    }
  })()`;
}

export function buildPostSubmitScript(text: string): string {
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

      function isComposerUrl() {
        try {
          if (!/^\\/compose\\/(post|tweet)$/i.test(window.location.pathname)) {
            return false;
          }
          const params = new URLSearchParams(window.location.search);
          return !params.get('attachment_url');
        } catch {
          return false;
        }
      }

      function hasQuotedAttachment() {
        const root = document.querySelector('[role="dialog"]') || document;
        const url = window.location.href || '';
        if (/attachment_url=/i.test(url)) return true;
        const attachmentRegion = root.querySelector('[data-testid="card.wrapper"], [data-testid="attachments"]');
        if (attachmentRegion && attachmentRegion.querySelector('a[href*="/status/"]')) return true;
        if (attachmentRegion) return true;
        if (root.querySelector('[data-testid="card.wrapper"], [data-testid="attachments"]')) return true;
        return false;
      }

      function hasUnexpectedDraft(editor) {
        const current = getComposerText(editor);
        if (!current) return false;
        return current !== expectedNormalized;
      }

      function getRoot() {
        const dialog = document.querySelector('[role="dialog"]');
        if (dialog) return dialog;
        if (isComposerUrl()) return document;
        return null;
      }

      async function activateComposer() {
        const root = document;
        const normalizeLower = (v) => normalize(v).toLowerCase();
        const triggers = Array.from(root.querySelectorAll('button, [role="button"], a, [tabindex="0"]'));
        const labelMatchers = [
          'post',
          'tweet',
          '发帖',
          '发布',
          '有什么新鲜事',
          'what’s happening',
          "what's happening",
        ];
        for (const el of triggers) {
          const testId = normalizeLower(el.getAttribute?.('data-testid') || '');
          const aria = normalizeLower(el.getAttribute?.('aria-label') || '');
          const text = normalizeLower(el.textContent || '');
          const hitLabel = labelMatchers.some(m => aria.includes(m) || text.includes(m));
          const hitTestId = testId.includes('newtweet') || testId.includes('sideNav_newtweet') || testId.includes('floatingactionbutton');
          if (hitLabel || hitTestId) {
            try {
              el.click();
              await wait(350);
              return true;
            } catch {}
          }
        }
        return false;
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
        return root.querySelector('[contenteditable="true"][role="textbox"], [role="textbox"][contenteditable="true"], textarea, [contenteditable="true"], [role="textbox"]');
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
          return {
            tag: el.tagName,
            testId: el.getAttribute ? (el.getAttribute('data-testid') || '') : '',
            aria: el.getAttribute ? (el.getAttribute('aria-label') || '') : '',
            role: el.getAttribute ? (el.getAttribute('role') || '') : '',
            contenteditable: el.getAttribute ? (el.getAttribute('contenteditable') || '') : '',
            text: normalize((el.tagName === 'TEXTAREA' ? el.value : el.textContent) || '').slice(0, 60),
          };
        });
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
          editor.focus();
          editor.value = '';
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          await wait(50);
          editor.value = expectedText;
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          editor.dispatchEvent(new Event('change', { bubbles: true }));
          await wait(250);
          return;
        }
        editor.focus();
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
        await wait(250);
      }

      async function insertComposerText(editor) {
        if (!editor) return false;
        if (editor.tagName === 'TEXTAREA') {
          editor.focus();
          editor.value = expectedText;
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          editor.dispatchEvent(new Event('change', { bubbles: true }));
          await wait(250);
          return getComposerText(editor) === expectedNormalized;
        }
        placeCaretAtEnd(editor);
        try {
          // Insert multiline text reliably into contenteditable.
          // insertText often flattens newlines; explicitly insert line breaks.
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, '');
          const parts = String(expectedText).split('\\n');
          for (let i = 0; i < parts.length; i++) {
            if (i > 0) {
              // newline
              try { document.execCommand('insertLineBreak'); } catch {}
            }
            if (parts[i]) {
              document.execCommand('insertText', false, parts[i]);
            }
          }
        } catch {}
        await wait(300);
        let currentText = getComposerText(editor);
        if (currentText === expectedNormalized) {
          return true;
        }
        await replaceComposerText(editor);
        currentText = getComposerText(editor);
        return currentText === expectedNormalized;
      }

      for (let i = 0; i < 20; i++) {
        const root = getRoot();
        if (!root) {
          await wait(250);
          continue;
        }
        const editor = getComposer();
        if (!editor) {
          // Sometimes /compose/post loads a shell that requires an extra click to open the modal.
          await activateComposer();
          await wait(250);
          continue;
        }

        if (hasQuotedAttachment()) {
          return { ok: false, message: 'Post composer already contains a quoted attachment before text insertion. Refusing to submit.' };
        }

        if (hasUnexpectedDraft(editor)) {
          return { ok: false, message: 'Post composer already contains draft text before insertion. Refusing to overwrite and submit blindly.' };
        }

        const inserted = await insertComposerText(editor);
        if (!inserted) {
          return { ok: false, message: 'Post composer opened, but text did not appear in the editor.' };
        }

        await wait(500);

        const currentRoot = getRoot();
        if (!currentRoot) {
          return { ok: false, message: 'Post composer lost its context before submission.' };
        }

        if (hasQuotedAttachment()) {
          return { ok: false, message: 'Post composer is carrying a quoted-tweet attachment context. Refusing to post as a plain tweet.' };
        }

        const btn = currentRoot.querySelector('[data-testid="tweetButton"]')
          || currentRoot.querySelector('[data-testid="tweetButtonInline"]');
        if (!btn || btn.disabled) {
          return { ok: false, message: 'Post composer opened, but the Post button is disabled or missing.' };
        }

        const composedTextBeforeSubmit = getComposerText(editor);
        btn.click();
        return { ok: true, message: 'Tweet posted successfully.', composedTextBeforeSubmit };
      }

      return {
        ok: false,
        message: 'Post composer did not open in time.'
          + ' currentUrl=' + JSON.stringify(window.location.href)
          + ' isComposerUrl=' + JSON.stringify(isComposerUrl())
          + ' hasQuotedAttachment=' + JSON.stringify(hasQuotedAttachment())
          + ' candidates=' + JSON.stringify(describeComposerCandidates())
          + ' bodyPreview=' + JSON.stringify(normalize((document.body && document.body.innerText) || '').slice(0, 240)),
      };
    } catch (e) {
      return { ok: false, message: e.toString() };
    }
  })()`;
}

cli({
  site: 'twitter',
  name: 'post',
  description: 'Post a new tweet/thread',
  domain: 'x.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'text', type: 'string', required: true, help: 'The text content of the tweet' },
  ],
  columns: ['status', 'message', 'text'],
  timeoutSeconds: 120,
  func: async (page: IPage | null, kwargs: any, debug: boolean = false) => {
    if (!page) throw new Error('Requires browser');
    const inputText = typeof kwargs.text === 'string' ? kwargs.text.replace(/\\n/g, '\n') : String(kwargs.text ?? '');
    const verificationSnippet = buildPostVerificationSnippet(inputText);
    const composeUrls = buildPostComposerUrls();
    const trace: string[] = [];

    const step = (line: string) => {
      trace.push(line);
      if (debug) {
        logger.verbose(`[twitter/post] ${line}`);
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

    let landedComposer = false;
    for (const composeUrl of composeUrls) {
      await page.goto(composeUrl);
      step(`page.goto(${JSON.stringify(composeUrl)})`);
      await page.wait(5);
      step('page.wait(5s)');

      const currentUrl = await page.evaluate('window.location.href');
      step(`currentUrl=${JSON.stringify(currentUrl)}`);
      if (typeof currentUrl === 'string' && isPostComposerUrl(currentUrl)) {
        landedComposer = true;
        break;
      }
    }

    if (!landedComposer) {
      return fail('Did not land on a compose page before attempting to post.');
    }

    const submitScript = buildPostSubmitScript(inputText);
    const submitSyntaxError = validateScript('submitPost', submitScript);
    if (submitSyntaxError) {
      return fail(submitSyntaxError);
    }

    let result;
    try {
      step('page.evaluate(submitPostScript)');
      result = await page.evaluate(submitScript);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(`submitPost evaluate failed: ${message}. Preview: ${summarizeScript(submitScript)}`);
    }
    step(`submitPostResult=${JSON.stringify(result)}`);

    if (!result?.ok) {
      if (debug) {
        try {
          const snap = await page.snapshot({ interactive: true, compact: true, maxDepth: 26 });
          step('page.snapshot(interactive,compact,maxDepth=26) captured after submit failure');
          return fail(`${String(result?.message || 'Posting failed.')}\n\n---\nsnapshot:\n${typeof snap === 'string' ? snap.slice(0, 3500) : JSON.stringify(snap).slice(0, 3500)}`);
        } catch (e) {
          step(`postSnapshotError=${String(e)}`);
        }
      }
      return fail(String(result?.message || 'Posting failed.'));
    }

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
      return fail('Post submit was triggered, but could not detect the logged-in profile for verification.');
    }

    await page.goto(`https://x.com/${username}`);
    step(`page.goto("https://x.com/${username}")`);
    await page.wait(5);
    step('page.wait(5s)');
    // Scroll to ensure latest posts load (X is heavily lazy-loaded).
    await page.autoScroll({ times: 2, delayMs: 1500 });
    step('page.autoScroll(times=2)');

    step('page.evaluate(verificationScript)');
    const verification = await page.evaluate(`(async () => {
      try {
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        const screenName = ${JSON.stringify(username.toLowerCase())};
        const expected = ${JSON.stringify(verificationSnippet.toLowerCase())};
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
              isPinned,
            });
          }

          const latest = candidates.find(item => !item.isPinned) || candidates[0];
          return { latest, candidates };
        }

        for (let attempt = 0; attempt < 20; attempt++) {
          const { latest, candidates } = findLatestCandidate();
          if (latest && latest.normalizedText.includes(expected)) {
            return {
              ok: true,
              message: 'Tweet posted successfully.',
              url: latest.url,
              observedText: latest.text,
            };
          }

          if (attempt === 19) {
            return {
              ok: false,
              message: 'Post submit was triggered, but the tweet did not appear on the profile timeline during verification.',
              debug: {
                candidateCount: candidates.length,
                preview: candidates.slice(0, 5),
                latest: latest || null,
              },
            };
          }

          await wait(1000);
        }

        return { ok: false, message: 'Post verification exhausted unexpectedly.' };
      } catch (e) {
        return { ok: false, message: e.toString() };
      }
    })()`);
    step(`verificationResult=${JSON.stringify(verification)}`);

    return [{
      status: verification?.ok ? 'success' : 'failed',
      message: debug ? `${String(verification?.message || 'Post verification failed.')}\n\n---\ntrace:\n${trace.map(s => `- ${s}`).join('\n')}` : String(verification?.message || 'Post verification failed.'),
      text: inputText,
    }];
  }
});
