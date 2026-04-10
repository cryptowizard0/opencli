# TweetFlow

TweetFlow packages reusable Twitter/X workflow skills and uses `opencli` as its runtime.

## Runtime model

- TweetFlow does not bundle the `opencli` executable.
- On first use, TweetFlow will auto-install `@jackwener/opencli` if `opencli` is not already available in `PATH`.
- The default private install location is `~/.tweetflow/vendor/opencli`.

## First run

Run:

```bash
./scripts/tweetflow-setup
```

The setup script will:

- auto-install `opencli` if needed
- run `opencli doctor --live`
- report `STATUS: ready`, `STATUS: needs browser bridge`, or `STATUS: needs login`

## Browser requirements

Browser-backed Twitter/X actions still require:

- Chrome running locally
- the opencli Browser Bridge extension installed and connected
- an authenticated `x.com` session in Chrome

TweetFlow only auto-installs `opencli`. It does not install the browser extension or sign the user into X/Twitter.

## Environment overrides

- `TWEETFLOW_OPENCLI_BIN`
  Use an existing `opencli` binary instead of auto-installing one.

- `TWEETFLOW_OPENCLI_HOME`
  Change the private install directory used for `@jackwener/opencli`.
