---
name: opencli-twitter
description: Use OpenCLI's Twitter/X adapters to read tweets, inspect timelines and search results, reply to specific tweets, and publish new posts. Trigger when the task involves operating Twitter/X through this repository's opencli commands.
---

# OpenCLI Twitter

Use this skill when the user wants to operate Twitter/X through the `opencli` adapters in this repository.

## Preconditions

Before running Twitter/X commands, verify:

1. Chrome is running and already logged into `x.com`.
2. The Browser Bridge extension is installed.
3. Browser connectivity works:

```bash
opencli doctor --live
```

If `doctor --live` fails, stop and fix connectivity before attempting Twitter actions.

## Core commands

### Read tweets

- Home timeline:

```bash
opencli twitter timeline --limit 20
```

- Search tweets:

```bash
opencli twitter search --query "openai" --limit 10
```

- Read one tweet and its reply thread:

```bash
opencli twitter thread --tweet_id "https://x.com/user/status/1234567890" --limit 50
```

Use `thread` when the user gives a tweet URL and wants the tweet content plus replies.

### Reply to a tweet

```bash
opencli twitter reply --url "https://x.com/user/status/1234567890" --text "Thanks, this is helpful."
```

This uses UI automation, so it is more fragile than read-only commands. If the command fails, mention that X's DOM may have changed and the adapter may need an update.

### Publish a new post

```bash
opencli twitter post --text "Shipping an update today."
```

This also uses UI automation and depends on the current X compose page structure.

## Recommended workflow

When the user asks to interact with Twitter/X:

1. Run `opencli doctor --live` if connectivity has not already been confirmed in the current session.
2. For reading:
   Use `timeline`, `search`, or `thread` based on the user's request.
3. For replying:
   First inspect the target tweet with `thread --tweet_id <url>` when helpful, then run `reply`.
4. For posting:
   Confirm the requested text if it has non-obvious consequences, then run `post`.

## Reply language rule

When drafting replies or quote commentary:

- If the original tweet is primarily in English, reply in English.
- If the original tweet is primarily in Chinese, reply in Chinese.
- If the tweet is mixed-language, follow the dominant language used in the tweet body.
- Do not switch languages unless the user explicitly asks for it.

## Bundled workflow

- Timeline triage and reply:
  See `/Users/webbergao/work/src/opencli/.agents/workflows/opencli-twitter-reply-top3.md`
  Use this when the user wants to read 50 timeline tweets, choose the best 3 reply opportunities, and post replies.

## Safety and expectations

- `timeline`, `thread`, and most read commands are relatively reliable because they use cookie/header/intercept strategies.
- `reply` and `post` are UI-driven and more likely to break after X frontend changes.
- If a write action reports success, still mention that UI automation can occasionally produce false positives and a manual spot-check in X is wise for important posts.

## Code references

- Twitter thread reader: `/Users/webbergao/work/src/opencli/src/clis/twitter/thread.ts`
- Twitter search: `/Users/webbergao/work/src/opencli/src/clis/twitter/search.ts`
- Twitter reply: `/Users/webbergao/work/src/opencli/src/clis/twitter/reply.ts`
- Twitter post: `/Users/webbergao/work/src/opencli/src/clis/twitter/post.ts`
