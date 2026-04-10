---
name: tweetflow-setup
description: Prepare TweetFlow for first use by auto-installing opencli if needed, checking Browser Bridge connectivity, and verifying the Twitter/X login session.
---

# TweetFlow Setup

Use this skill before the first TweetFlow run on a new machine, or whenever browser automation starts failing unexpectedly.

## What this does

The setup script will:

- auto-install `opencli` on first use if it is missing
- run `opencli doctor --live`
- report whether TweetFlow is `ready`, `needs browser bridge`, or `needs login`

## Run

```bash
../../scripts/tweetflow-setup
```

## Interpret the result

- `STATUS: ready`
  TweetFlow can use browser-backed Twitter/X workflows on this machine.

- `STATUS: needs browser bridge`
  Install or reconnect the opencli Browser Bridge extension in Chrome, keep Chrome running, then rerun setup.

- `STATUS: needs login`
  Open `x.com` in Chrome, sign in with the target account, then rerun setup.

## Notes

- The setup flow installs `@jackwener/opencli` into `~/.tweetflow/vendor/opencli` by default.
- Override the runtime path with `TWEETFLOW_OPENCLI_BIN`.
- Override the private install directory with `TWEETFLOW_OPENCLI_HOME`.
