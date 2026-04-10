---
name: opencli-twitter-reply-top3-english-only
description: Read 50 tweets from the user's X/Twitter home timeline, pick the best 3 English-language engagement opportunities, like them, draft concise English replies, choose 1 of those 3 for a quote-style commentary post, and publish the replies plus the quote-style post through TweetFlow's runtime wrapper.
---

# OpenCLI Twitter Reply Top 3 English Only

Use this skill when the user wants to:

- read the latest 50 tweets from their home timeline
- identify the 3 best English-language tweets to engage with
- like those 3 tweets
- reply to those 3 tweets in English
- choose 1 of those 3 tweets for a quote-style commentary post

## Preconditions

Before starting:

1. Run TweetFlow setup:

```bash
../../scripts/tweetflow-setup
```

2. Use the TweetFlow wrapper for every `opencli` command in this workflow:

```bash
../../scripts/tweetflow-opencli
```

3. Ensure Chrome is running and logged into `x.com`.
4. If setup did not already confirm readiness, run:

```bash
../../scripts/tweetflow-opencli doctor --live
```

If browser connectivity fails, stop and fix setup first.

Important:

- `timeline` can still work when the write path is not usable.
- Before sending `like`, `reply`, or the quote-style post, confirm the current run can reach the local daemon on `127.0.0.1:19825`.
- If this workflow is running inside a restricted sandbox and write commands fail with `EPERM`, `Failed to start opencli daemon`, or similar localhost bridge errors, rerun the write actions with local access outside the sandbox.

## Steps

1. Fetch 50 timeline tweets:

```bash
../../scripts/tweetflow-opencli twitter timeline --limit 50 -f json
```

2. Review the results and rank tweets by reply value. Only consider tweets where the main tweet body is primarily in English. Prefer tweets that are:
   - recent and conversational
   - from accounts the user likely wants to engage with
   - likely to benefit from a short, useful, non-spammy reply
   - not obviously sensitive, hostile, or high-risk

3. Exclude tweets that are poor reply targets:
   - tweets primarily written in Chinese or another non-English language
   - ads, giveaways, ragebait, or engagement farming
   - highly sensitive political, legal, medical, or personal topics unless the user explicitly wants that
   - tweets where a reply would likely look generic or low-value

4. Select the top 3 English-language tweets.

5. From those 3 tweets, choose 1 as the quote-style candidate. Prefer tweets where a quote adds a higher-level frame, sharper judgment, or a trend view that would not fit as well in a direct reply. Avoid quoting tweets that are too personal, too sensitive, or only worth a lightweight reply.

6. Like each selected tweet:

```bash
../../scripts/tweetflow-opencli twitter like --url "<tweet-url>"
```

If a like fails:

- First rerun `../../scripts/tweetflow-opencli doctor --live`.
- If doctor reports daemon and extension as healthy, treat this as a run-environment bridge problem rather than a Twitter auth problem.
- If a manual `node dist/daemon.js` start returns `EADDRINUSE`, the daemon is already running. Do not keep restarting it.
- If the command fails with `No tab with given id`, retry the like once in a fresh command/session.

7. Draft one reply for each selected tweet. Replies should usually be:
   - in English
   - short
   - specific to the tweet
   - additive rather than generic praise
   - safe to post publicly

8. Read the chosen quote target before drafting. Do not write the quote-style post before reading the source text.

First try:

```bash
../../scripts/tweetflow-opencli twitter thread --tweet_id "<tweet-url>" --limit 1 -f json
```

Use the first row as the source tweet and read at least:
   - `author`
   - `text`
   - `url`

If the returned `text` is empty or obviously truncated for a long-form note/article tweet, fall back to:

```bash
../../scripts/tweetflow-opencli twitter article "<tweet-url>" -f json
```

Use `content` as the source text in that case.

If `../../scripts/tweetflow-opencli twitter thread` hangs or does not return promptly, use a direct syndication fetch instead of waiting indefinitely:

```bash
curl -L --max-time 15 "https://cdn.syndication.twimg.com/tweet-result?id=<status-id>&token=x"
```

Use the returned `text` field as the source tweet text.

9. Draft one quote-style commentary post for the chosen quote target. The commentary should:
   - be in English
   - add analysis, not paraphrase
   - keep one clear point
   - stay short enough to leave room for the quoted tweet, preferably 220 characters or fewer
   - use plain ASCII punctuation
   - avoid hashtags, emojis, filler, and generic praise unless the user explicitly asks for them

Favor commentary that does one of these:
   - identify the deeper constraint behind the tweet
   - separate the surface signal from the real shift
   - explain why the observation matters now
   - compress the point into a sharper frame than the original tweet

Use one of these default templates when it helps, but adapt the wording to the source:

Template 1: architecture breakdown

```text
This is actually a <higher-order underlying issue>.

What matters:
- Layer 1: ...
- Layer 2: ...
- Layer 3: ...

Most people only see <surface layer>.

The real leverage is <your judgment>.
```

Template 2: trend judgment

```text
The market is focusing on <surface signal>.

But the real shift is <core change>.

Why:
- ...
- ...
- ...

This will matter because <implication>.
```

Keep the quote-specific commentary tied to the source tweet. Do not sound like a generic motivational post. If all 3 selected tweets are weak quote targets, say so instead of forcing a quote.

10. Unless the user explicitly asked for fully automatic posting, present:
   - the 3 selected tweets
   - the 3 drafted replies
   - the 1 selected quote target
   - the drafted quote-style commentary post

for confirmation before posting.

11. Post replies one by one:

```bash
../../scripts/tweetflow-opencli twitter reply --url "<tweet-url>" --text "<reply-text>"
```

Post replies sequentially, not in parallel. The X UI adapter is more reliable when each reply gets a fresh, uninterrupted browser flow.

12. Post the quote-style commentary post:

```bash
../../scripts/tweetflow-opencli twitter post -v --text "<quote-text>\\n\\n<tweet-url>"
```

Use literal `\\n\\n` inside the CLI string and pass the full text as one shell string.

Post the quote-style commentary after the replies unless the user asks for a different order.
If posting fails, stop and inspect the result. Do not retry through `../../scripts/tweetflow-opencli twitter quote`. Before any retry, check the user's profile timeline to ensure a partial, empty, or quote-only post was not already created.

13. Summarize which 3 tweets were chosen, which likes were sent, what replies were sent, which tweet was used for the quote-style post, what commentary text was sent, and note any failures.

## Selection rubric

When several tweets are candidates, prefer this order:

1. Highest relevance to the user's interests or goals
2. Best chance of a meaningful interaction
3. Lowest risk of sounding automated
4. Strongest signal from tweet content plus engagement context
5. Clear fit for a natural English reply
6. Clear headroom for one tweet among the 3 to support a strong quote-style commentary angle

## Important notes

- `timeline` is relatively reliable; `like` and `reply` are UI automation and can break if X changes its DOM. The quote-style post uses `../../scripts/tweetflow-opencli twitter post`, which is currently more reliable than the dedicated quote composer.
- A healthy `../../scripts/tweetflow-opencli doctor --live` result is necessary but not always sufficient for writes from sandboxed runs. If doctor is healthy but writes fail on localhost bridge access, rerun the write commands with local access outside the sandbox.
- `EADDRINUSE` from `node dist/daemon.js` means the daemon is already bound to port `19825`; that is not the bug.
- `No tab with given id` usually means the UI session went stale. Retry the affected `like` or `reply` once in a fresh command. For the quote-style post, inspect the timeline before any retry.
- A reported success from `reply` or the quote-style post is useful but not perfect. For important outreach, recommend a manual spot-check in X after posting.
- If fewer than 3 English tweets are good candidates, do not force likes or replies. Explain why and stop with the strongest available candidates.
