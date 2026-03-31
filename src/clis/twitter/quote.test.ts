import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  buildQuoteComposerUrls,
  buildQuoteSubmitScript,
  buildVerificationSnippet,
  composerHasExpectedText,
  extractTweetStatusId,
  quoteComposerUrlIncludesTarget,
  tweetDetailUrlIncludesStatusId,
  isQuoteComposerUrl,
  isQuoteMenuLabel,
  normalizeTweetText,
  normalizeTweetUrl,
} from './quote.js';

describe('twitter quote verification helpers', () => {
  it('normalizes tweet urls to canonical x.com status links', () => {
    expect(normalizeTweetUrl('https://twitter.com/jack/status/12345?s=20')).toBe(
      'https://x.com/jack/status/12345'
    );
  });

  it('extracts tweet status ids from different tweet urls', () => {
    expect(extractTweetStatusId('https://twitter.com/jack/status/12345?s=20')).toBe('12345');
    expect(extractTweetStatusId('https://x.com/i/web/status/67890')).toBe('67890');
  });

  it('confirms when the current page is the expected tweet detail url', () => {
    expect(tweetDetailUrlIncludesStatusId(
      'https://x.com/vertr_ai/status/2038635187245088838',
      '2038635187245088838'
    )).toBe(true);
    expect(tweetDetailUrlIncludesStatusId(
      'https://x.com/home',
      '2038635187245088838'
    )).toBe(false);
  });

  it('builds direct quote composer urls with attachment_url for both compose routes', () => {
    expect(buildQuoteComposerUrls('https://twitter.com/jack/status/12345?s=20')).toEqual([
      'https://x.com/compose/post?attachment_url=https%3A%2F%2Fx.com%2Fjack%2Fstatus%2F12345',
      'https://x.com/compose/tweet?attachment_url=https%3A%2F%2Fx.com%2Fjack%2Fstatus%2F12345',
    ]);
  });

  it('only treats matching compose routes as quote composers', () => {
    expect(isQuoteComposerUrl(
      'https://x.com/compose/post?attachment_url=https%3A%2F%2Fx.com%2Fjack%2Fstatus%2F12345',
      'https://twitter.com/jack/status/12345?s=20'
    )).toBe(true);

    expect(isQuoteComposerUrl(
      'https://x.com/jack/status/12345',
      'https://twitter.com/jack/status/12345?s=20'
    )).toBe(false);

    expect(isQuoteComposerUrl(
      'https://x.com/compose/post?attachment_url=https%3A%2F%2Fx.com%2Fjack%2Fstatus%2F99999',
      'https://twitter.com/jack/status/12345?s=20'
    )).toBe(false);
  });

  it('confirms when a compose url targets the expected tweet', () => {
    expect(quoteComposerUrlIncludesTarget(
      'https://x.com/compose/post?attachment_url=https%3A%2F%2Fx.com%2Fjack%2Fstatus%2F12345',
      'https://twitter.com/jack/status/12345?s=20'
    )).toBe(true);

    expect(quoteComposerUrlIncludesTarget(
      'https://x.com/compose/post?attachment_url=https%3A%2F%2Fx.com%2Fjack%2Fstatus%2F99999',
      'https://twitter.com/jack/status/12345?s=20'
    )).toBe(false);
  });

  it('normalizes whitespace before verification', () => {
    expect(normalizeTweetText('foo   bar\nbaz\tqux')).toBe('foo bar baz qux');
  });

  it('requires the inserted commentary text to actually appear in the composer', () => {
    expect(composerHasExpectedText('', 'agent margin compresses')).toBe(false);
    expect(composerHasExpectedText(
      'This is a distribution shift. Agent margin compresses when setup becomes productized.',
      'Agent margin compresses when setup becomes productized.'
    )).toBe(true);
  });

  it('matches quote actions but rejects reply labels', () => {
    expect(isQuoteMenuLabel('Quote')).toBe(true);
    expect(isQuoteMenuLabel('Quote post')).toBe(true);
    expect(isQuoteMenuLabel('引用')).toBe(true);
    expect(isQuoteMenuLabel('Write your reply')).toBe(false);
    expect(isQuoteMenuLabel('Reply')).toBe(false);
  });

  it('buildQuoteSubmitScript emits parsable javascript', () => {
    const script = buildQuoteSubmitScript(
      'The winning AI UX will disappear into the workflow.',
      'https://x.com/vertr_ai/status/2038635187245088838',
      '2038635187245088838'
    );

    expect(() => {
      try {
        new Script(script);
      } catch (error) {
        console.error(
          script
            .split('\n')
            .map((line, index) => `${String(index + 1).padStart(3, ' ')} | ${line}`)
            .join('\n')
        );
        throw error;
      }
    }).not.toThrow();
  });

  it('builds a stable snippet from normalized text', () => {
    expect(buildVerificationSnippet('  hello\n\nworld  ')).toBe('hello world');
  });

  it('caps verification snippets to 80 chars', () => {
    const text = 'a'.repeat(120);
    expect(buildVerificationSnippet(text)).toHaveLength(80);
  });
});
