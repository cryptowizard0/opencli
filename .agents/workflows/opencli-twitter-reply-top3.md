---
description: Read 20 tweets from the user's X/Twitter home timeline, pick the best 3 reply opportunities, draft concise replies, and post them through opencli.
---

# OpenCLI Twitter Reply Top 3

Use this workflow when the user wants to:

- read the latest 20 tweets from their home timeline
- identify the 3 best tweets to engage with
- reply to those 3 tweets

## Preconditions

Before starting:

1. Ensure Chrome is running and logged into `x.com`.
2. Ensure Browser Bridge is available.
3. Run:

```bash
opencli doctor --live
```

If browser connectivity fails, stop and fix setup first.

## Steps

1. Fetch 20 timeline tweets:

```bash
opencli twitter timeline --limit 20 -f json
```

2. Review the results and rank tweets by reply value. Prefer tweets that are:
   - recent and conversational
   - from accounts the user likely wants to engage with
   - likely to benefit from a short, useful, non-spammy reply
   - not obviously sensitive, hostile, or high-risk

3. Exclude tweets that are poor reply targets:
   - ads, giveaways, ragebait, or engagement farming
   - highly sensitive political, legal, medical, or personal topics unless the user explicitly wants that
   - tweets where a reply would likely look generic or low-value

4. Select the top 3 tweets and draft one reply for each. Replies should usually be:
   - short
   - specific to the tweet
   - additive rather than generic praise
   - safe to post publicly

5. Unless the user explicitly asked for fully automatic posting, present the 3 selected tweets and the 3 drafted replies for confirmation before posting.

6. Post replies one by one:

```bash
opencli twitter reply --url "<tweet-url>" --text "<reply-text>"
```

7. Summarize which 3 tweets were chosen, what replies were sent, and note any failures.

## Selection rubric

When several tweets are candidates, prefer this order:

1. Highest relevance to the user's interests or goals
2. Best chance of a meaningful interaction
3. Lowest risk of sounding automated
4. Strongest signal from tweet content plus engagement context

## Important notes

- `timeline` is relatively reliable; `reply` is UI automation and can break if X changes its DOM.
- A reported success from `reply` is useful but not perfect. For important outreach, recommend a manual spot-check in X after posting.
- If all 20 tweets are poor candidates, do not force replies. Explain why and ask whether to draft replies anyway.
