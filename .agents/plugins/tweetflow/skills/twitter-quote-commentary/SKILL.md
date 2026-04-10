---
name: twitter-quote-commentary
description: Read a specific Twitter/X post from a tweet URL, extract the original tweet text, draft a short quote-style commentary with a clear judgment, and publish it through TweetFlow's runtime wrapper. Use when Codex needs to turn one tweet URL into a concise quote-like post, especially for architecture breakdowns, trend judgments, or other high-signal reactions that should add analysis rather than repeat the source.
---

# Twitter Quote Commentary

Turn one tweet URL into a quote-style post in three phases: read the source, write a short take, then publish it.

All `opencli` commands in this skill must run through the TweetFlow wrapper:

```bash
../../scripts/tweetflow-opencli
```

For first-time setup, run:

```bash
../../scripts/tweetflow-setup
```

## Workflow

1. Read the source tweet first.

Run:

```bash
../../scripts/tweetflow-opencli twitter thread --tweet_id "<tweet-url>" --limit 1 -f json
```

Use the first row as the source tweet. Read at least:
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

Do not write the quote tweet before reading the source text.

2. Write a short commentary that adds judgment.

Requirements:
- Add analysis, not paraphrase.
- Keep it short enough to leave room for the quoted tweet. Prefer 220 characters or fewer.
- Make one clear point.
- Match the source language. If the source tweet is in English, write the commentary in English. If the source tweet is in Chinese, write the commentary in Chinese.
- Use plain ASCII punctuation in the final post text. Prefer straight apostrophes and quotes; avoid smart quotes, em dashes, and other typographic punctuation.
- Avoid hashtags, emojis, and filler unless the user explicitly asks for them.
- Avoid direct insults, engagement bait, and generic praise.
- If you cannot add a non-obvious point, say so instead of forcing a weak quote tweet.

Use one of the templates in [references/templates.md](references/templates.md) when it helps. Adapt the wording to the source; do not keep placeholder labels.

3. Post the commentary as a normal tweet plus the source URL.

Run:

```bash
../../scripts/tweetflow-opencli twitter post -v --text "<your-commentary>\\n\\n<tweet-url>"
```

Use literal `\\n\\n` inside the CLI string instead of shell multiline input. Always pass the text as one shell string. This is the only publishing path for this skill because it is currently more reliable than the dedicated quote composer.

If posting fails, stop and inspect the result. Do not retry through `../../scripts/tweetflow-opencli twitter quote`. Before any retry, check your profile timeline to ensure a partial, empty, or quote-only post was not already created.

## Writing Standard

Favor commentary that does one of these:
- Identify the deeper constraint behind the tweet.
- Separate the surface signal from the real shift.
- Explain why the observation matters now.
- Compress the point into a sharper frame than the original tweet.

Good outcomes:
- Short
- Specific
- Opinionated
- Legible on first read

Bad outcomes:
- Merely restating the tweet
- Listing obvious facts
- Sounding like generic AI summary text
- Using three ideas when one would be stronger

## Fallbacks

If `../../scripts/tweetflow-opencli twitter thread` and `../../scripts/tweetflow-opencli twitter article` both fail, open the tweet URL directly in the browser and read the visible tweet text before drafting.

If the tweet is mainly media with little text, mention that constraint in the commentary rather than pretending there is more substance than there is.

If the generated commentary is too long, cut examples before cutting the core claim.
