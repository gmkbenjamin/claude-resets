# claude-resets.com

How long has it been since Anthropic last reset everyone's Claude Code usage limits?

A tracker for every announced reset of the 5-hour and weekly limits, with a
head-to-head comparison against Codex resets.

Modelled on [codex-resets.com](https://codex-resets.com/), which also supplies the
Codex event list.

## What it shows

- **Days since the last reset**, plus average gap, longest drought and pace.
- **Claude vs Codex** — a six-metric scoreboard, a cumulative chart, resets per
  month, and both providers on one shared timeline.
- **An archive** of every tracked announcement, each linked to its original post.

Because Codex has been tracked since September 2025 and Claude only since April
2026, the comparison defaults to the period where both are tracked. Lifetime totals
are available but are not like-for-like, and the page says so.

## Stack

Static HTML, CSS and JavaScript with no dependencies and no build step. The charts
are hand-built SVG. Deployed on Cloudflare Workers as an assets-only Worker.

```
public/            everything that gets deployed
data/events.json   the tracked events
scripts/           data build script
```

## Running it locally

```bash
python3 -m http.server 8790 --directory public
# → http://localhost:8790
```

`public/data/resets.json` is generated — regenerate it with
`python3 scripts/build-data.py` rather than editing it by hand.

## About the data

Every entry links to the post it came from. Dates are decoded from each post's ID
rather than transcribed, so they cannot drift from the source.

**The rest of each entry deserves more scepticism than the dates.** Worth knowing
before you rely on it, or edit it:

- The Claude entries were assembled from web searches, and the posts were not opened
  on X directly. Each `note` is therefore a **paraphrase** of what the announcement
  said, not a quotation — check it against the linked post before trusting the wording.
- Whether an entry counts as a `reset` (counters flushed) or a `policy` change
  (ceiling moved, nothing flushed), and its `scope`, are **judgement calls**. They
  matter: a wrong `kind` silently adds or removes a reset from every statistic on the
  page.
- **Scope: only announcements from [@ClaudeDevs](https://x.com/ClaudeDevs)** are
  tracked. That account was created in February 2026 and its first reset
  announcement came on 16 April 2026, so this is that account's complete record
  rather than a sample. Anthropic reset limits before the account existed; those are
  out of scope here, not missing.

The Codex entries are essentially just IDs and dates, so there is far less to get
wrong there.

Spotted a reset that is missing, or one recorded wrongly? Please open an issue — the
`policy`-tagged entries are the most valuable to check.

## Disclaimer

Not affiliated with Anthropic or OpenAI. Nothing here predicts a future reset —
resets are discretionary, and the only limits you can rely on are the ones
`/usage` shows you.
