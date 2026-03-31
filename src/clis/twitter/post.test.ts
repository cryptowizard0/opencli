import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  buildPostComposerUrls,
  buildPostSubmitScript,
  buildPostVerificationSnippet,
  composerHasExpectedPostText,
  isPostComposerUrl,
  normalizePostText,
} from './post.js';

describe('twitter post helpers', () => {
  it('normalizes whitespace before verification', () => {
    expect(normalizePostText('foo   bar\nbaz\tqux')).toBe('foo bar baz qux');
  });

  it('caps verification snippets to 80 chars', () => {
    const text = 'a'.repeat(120);
    expect(buildPostVerificationSnippet(text)).toHaveLength(80);
  });

  it('builds stable verification snippets from normalized text', () => {
    expect(buildPostVerificationSnippet('  hello\n\nworld  ')).toBe('hello world');
  });

  it('checks compose routes for both post entrypoints', () => {
    expect(isPostComposerUrl('https://x.com/compose/post')).toBe(true);
    expect(isPostComposerUrl('https://x.com/compose/tweet')).toBe(true);
    expect(
      isPostComposerUrl('https://x.com/compose/post?attachment_url=https%3A%2F%2Fx.com%2Ffoo%2Fstatus%2F123')
    ).toBe(false);
    expect(
      isPostComposerUrl('https://x.com/compose/tweet?attachment_url=https%3A%2F%2Fx.com%2Ffoo%2Fstatus%2F123')
    ).toBe(false);
    expect(isPostComposerUrl('https://x.com/home')).toBe(false);
  });

  it('exports both supported compose routes', () => {
    expect(buildPostComposerUrls()).toEqual([
      'https://x.com/compose/post',
      'https://x.com/compose/tweet',
    ]);
  });

  it('requires inserted text to actually appear in the composer', () => {
    expect(composerHasExpectedPostText('', 'shipping local AI')).toBe(false);
    expect(composerHasExpectedPostText(
      'Shipping local AI on Apple silicon is finally feeling viable.',
      'local AI on Apple silicon'
    )).toBe(true);
  });

  it('buildPostSubmitScript emits parsable javascript', () => {
    const script = buildPostSubmitScript(
      'Shipping local AI on Apple silicon is finally feeling viable.'
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
});
