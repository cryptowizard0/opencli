---
name: opencli-twitter-reply-top3
description: Read 50 tweets from the user's X/Twitter home timeline, pick the best 3 engagement opportunities, like them, draft concise replies, and post those replies through opencli.
---

# OpenCLI Twitter Reply Top 3

Use this skill when the user wants to:

- read the latest 50 tweets from their home timeline
- identify the 3 best tweets to engage with
- like those 3 tweets
- reply to those 3 tweets

## Preconditions

Before starting:

1. Confirm `opencli` is available in `PATH`:

```bash
which opencli
```

2. Ensure Chrome is running and logged into `x.com`.
3. Ensure Browser Bridge is available.
4. Run:

```bash
opencli doctor --live
```

If browser connectivity fails, stop and fix setup first.

Important:

- `timeline` can still work when the write path is not usable.
- Before sending `like` or `reply`, confirm the current run can reach the local daemon on `127.0.0.1:19825`.
- If this workflow is running inside a restricted sandbox and write commands fail with `EPERM`, `Failed to start opencli daemon`, or similar localhost bridge errors, rerun the write actions with local access outside the sandbox.

## Steps

1. Fetch 50 timeline tweets:

```bash
opencli twitter timeline --limit 50 -f json
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

4. Select the top 3 tweets.

5. Like each selected tweet:

```bash
opencli twitter like --url "<tweet-url>"
```

If a like fails:

- First rerun `opencli doctor --live`.
- If doctor reports daemon and extension as healthy, treat this as a run-environment bridge problem rather than a Twitter auth problem.
- If a manual `node dist/daemon.js` start returns `EADDRINUSE`, the daemon is already running. Do not keep restarting it.
- If the command fails with `No tab with given id`, retry the like once in a fresh command/session.

6. Draft one reply for each selected tweet. Replies should usually be:
   - short
   - specific to the tweet
   - additive rather than generic praise
   - safe to post publicly

7. Unless the user explicitly asked for fully automatic posting, present the 3 selected tweets and the 3 drafted replies for confirmation before posting.

8. Post replies one by one:

```bash
opencli twitter reply --url "<tweet-url>" --text "<reply-text>"
```

Post replies sequentially, not in parallel. The X UI adapter is more reliable when each reply gets a fresh, uninterrupted browser flow.

9. Summarize which 3 tweets were chosen, which likes were sent, what replies were sent, and note any failures.

## Selection rubric

When several tweets are candidates, prefer this order:

1. Highest relevance to the user's interests or goals
2. Best chance of a meaningful interaction
3. Lowest risk of sounding automated
4. Strongest signal from tweet content plus engagement context

## Important notes

- `timeline` is relatively reliable; `like` and `reply` are UI automation and can break if X changes its DOM.
- A healthy `opencli doctor --live` result is necessary but not always sufficient for writes from sandboxed runs. If doctor is healthy but writes fail on localhost bridge access, rerun the write commands with local access outside the sandbox.
- `EADDRINUSE` from `node dist/daemon.js` means the daemon is already bound to port `19825`; that is not the bug.
- `No tab with given id` usually means the UI session went stale. Retry the affected `like` or `reply` once in a fresh command.
- A reported success from `reply` is useful but not perfect. For important outreach, recommend a manual spot-check in X after posting.
- If all 50 tweets are poor candidates, do not force likes or replies. Explain why and ask whether to draft replies anyway.
