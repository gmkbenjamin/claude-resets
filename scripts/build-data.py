#!/usr/bin/env python3
"""Build the site's generated files from data/events.json.

Writes three things, all from one source:
  * public/data/resets.json — the dataset app.js fetches and renders
  * public/index.html        — the marked <!-- build:* --> regions, pre-rendered
  * public/sitemap.xml       — one URL, lastmod from the newest event

Events are stored as bare X status IDs. Every timestamp is derived from the
ID's embedded snowflake timestamp rather than transcribed, so a date cannot
drift from its source.

Add an event by appending it to data/events.json, then run this. An entry needs
only the X status ID; `kind` is "reset" (the counters were flushed, counts toward
every metric) or "policy" (the ceiling moved, listed but never counted), and
Claude entries also need a `note`, which is the archive card's body.

Why pre-render into index.html at all: the page is otherwise empty until app.js
runs, so any crawler or unfurler that does not execute JavaScript — Bing, most
social cards, many LLM indexers — sees no counter, no stats and no archive. The
marked regions carry that content in the raw HTML; app.js overwrites every one
of them on load, so nothing changes for a browser. Everything injected is
**time-independent** (dates and gaps between past events, not "days ago"), which
keeps the output deterministic: same input → byte-identical index.html, no
spurious diff on a rebuild that changed no data.
"""

import datetime
import html
import json
import pathlib
import re

SNOWFLAKE_EPOCH_MS = 1288834974657
DAY_MS = 86_400_000
SITE = "https://claude-resets.com"

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "events.json"
OUTPUT = ROOT / "public" / "data" / "resets.json"
INDEX = ROOT / "public" / "index.html"
SITEMAP = ROOT / "public" / "sitemap.xml"


def timestamp_of(status_id: str) -> str:
    """Decode an X status ID into its UTC creation time."""
    ms = (int(status_id) >> 22) + SNOWFLAKE_EPOCH_MS
    dt = datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def load_events() -> dict:
    return json.loads(SOURCE.read_text(encoding="utf-8"))


def build(source: dict) -> dict:
    providers = {}
    for key, provider in source.items():
        account = provider["account"]
        events = []
        for ev in provider["events"]:
            out = {
                "id": ev["id"],
                "date": timestamp_of(ev["id"]),
                "kind": ev.get("kind", "reset"),
            }
            if ev.get("scope"):
                out["scope"] = ev["scope"]
            if ev.get("note"):
                out["note"] = ev["note"]
            out["url"] = f"https://x.com/{account}/status/{ev['id']}"
            events.append(out)
        events.sort(key=lambda e: e["date"])

        entry = {
            "name": provider["name"],
            "product": provider["product"],
            "account": account,
            "accountUrl": f"https://x.com/{account}",
        }
        if provider.get("note"):
            entry["note"] = provider["note"]
        entry["events"] = events
        providers[key] = entry

    # No "generated" timestamp on purpose. It was always null, and filling it in
    # would make the output non-deterministic — every rebuild would show a diff
    # even when no event changed, which is exactly what the docstring promises
    # not to do. Event dates come from the status IDs and are the real record.
    return {"providers": providers}


# ── Pre-rendering into index.html ─────────────────────────────────────────────
# app.js is the source of truth for how these look; the markup here mirrors what
# renderCounter / renderTiles / renderArchive produce so the pre-rendered paint
# matches the live one. Free text is escaped exactly as esc()/safeUrl() do in
# app.js — data/events.json is trusted, but the README invites outside PRs to it.

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _dt(iso: str) -> datetime.datetime:
    return datetime.datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(
        tzinfo=datetime.timezone.utc)


def fmt_date(iso: str) -> str:
    """'2026-07-16T…Z' → 'Jul 16, 2026', matching app.js fmtDate (UTC)."""
    d = _dt(iso)
    return f"{MONTHS[d.month - 1]} {d.day}, {d.year}"


def esc(value) -> str:
    """HTML-escape, same character set as app.js esc() (quotes included)."""
    return html.escape("" if value is None else str(value), quote=True)


def round1(n: float) -> float:
    r = round(n * 10) / 10
    return int(r) if r == int(r) else r


def reset_stats(events: list[dict]) -> dict:
    """Time-independent stats for the reset events, mirroring statsFor() but with
    no dependency on 'now' — so the built HTML is deterministic."""
    dates = [_dt(e["date"]) for e in events if e["kind"] == "reset"]
    dates.sort()
    gaps = [(dates[i] - dates[i - 1]).total_seconds() * 1000 / DAY_MS
            for i in range(1, len(dates))]
    span_days = max((dates[-1] - dates[0]).total_seconds() * 1000 / DAY_MS, 1) \
        if len(dates) > 1 else None
    return {
        "count": len(dates),
        "mean_gap": (sum(gaps) / len(gaps)) if gaps else None,
        "longest_gap": max(gaps) if gaps else None,
        # Pace over the recorded span (first→last reset), not up to "now" as the
        # live tile computes it. Deterministic, and close enough for a fallback.
        "per_month": (len(dates) / span_days * 30.44) if span_days else None,
        "first": events and dates[0].strftime("%Y-%m-%dT%H:%M:%SZ") if dates else None,
        "last": dates[-1].strftime("%Y-%m-%dT%H:%M:%SZ") if dates else None,
    }


def render_counter(stats: dict) -> str:
    if not stats["last"]:
        return '<span class="counter-loading">No resets tracked yet.</span>'
    d = _dt(stats["last"])
    return (f'<span class="counter-preview">Last reset '
            f'<time datetime="{d:%Y-%m-%d}">{esc(fmt_date(stats["last"]))}</time>'
            f'</span>')


def render_hero_sub(stats: dict, reset_dates: list[str]) -> str:
    if not reset_dates:
        return "Nothing on record for Claude yet."
    last = fmt_date(reset_dates[-1])
    if len(reset_dates) > 1:
        gap = round1((_dt(reset_dates[-1]) - _dt(reset_dates[-2])).total_seconds()
                     * 1000 / DAY_MS)
        tail = f" Before that, Anthropic had gone {esc(gap)} days."
    else:
        tail = ""
    return f"The last one landed on <strong>{esc(last)}</strong>.{tail}"


def _num(v) -> str:
    return "—" if v is None else esc(round1(v))


def render_tiles(stats: dict) -> str:
    tiles = [
        ("Resets tracked", esc(stats["count"]), "",
         "Announcements that flushed the counters."),
        ("Average gap", _num(stats["mean_gap"]), "days",
         "Mean time between consecutive resets."),
        ("Longest drought", _num(stats["longest_gap"]), "days",
         "The most patience ever required."),
        ("Pace", _num(stats["per_month"]), "/ month",
         "Announced resets per month across the tracked period."),
    ]
    return "".join(
        f'<dl class="tile"><dt>{esc(label)}</dt>'
        f'<dd>{value}{f"<small>{esc(unit)}</small>" if unit else ""}</dd>'
        f'<p>{esc(note)}</p></dl>'
        for label, value, unit, note in tiles)


def render_archive(events: list[dict]) -> str:
    """Newest first, mirroring renderArchive() but without the 'X days ago'
    relative span (time-dependent — app.js fills it in live)."""
    reset_dates = sorted(_dt(e["date"]) for e in events if e["kind"] == "reset")
    ordered = sorted(events, key=lambda e: e["date"], reverse=True)
    out = []
    for e in ordered:
        gap = ""
        if e["kind"] == "reset":
            at = _dt(e["date"])
            i = reset_dates.index(at)
            if i > 0:
                days = round1((at - reset_dates[i - 1]).total_seconds() * 1000 / DAY_MS)
                gap = f'<span class="entry-gap">{esc(days)} days after the previous reset</span>'
            else:
                gap = '<span class="entry-gap">First tracked reset</span>'
        kind = e["kind"]
        scope_tag = f'<span class="tag">{esc(e["scope"])}</span>' if e.get("scope") else ""
        url = e["url"] if str(e.get("url", "")).startswith(("http://", "https://")) else "#"
        out.append(
            f'<li class="entry" data-kind="{esc(kind)}">'
            f'<div class="entry-top">'
            f'<span class="entry-date">{esc(fmt_date(e["date"]))}</span>'
            f'<span class="entry-rel"></span>'
            f'<span class="tag" data-kind="{esc(kind)}">'
            f'{"Reset" if kind == "reset" else "Limit change"}</span>'
            f'{scope_tag}</div>'
            f'<p class="entry-note">{esc(e.get("note", ""))}</p>'
            f'<div class="entry-foot">{gap}'
            f'<a href="{esc(url)}" rel="noopener" target="_blank">Original post ↗</a>'
            f'</div></li>')
    return "".join(out)


def render_jsonld(payload: dict) -> str:
    all_dates = sorted(e["date"] for p in payload["providers"].values()
                       for e in p["events"])
    coverage = f"{all_dates[0][:10]}/{all_dates[-1][:10]}" if all_dates else ""
    graph = [
        {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "claude-resets.com",
            "url": f"{SITE}/",
            "description": "How long since Anthropic last reset Claude Code's "
                           "usage limits, with the full announcement archive and "
                           "a head-to-head against OpenAI Codex.",
            "inLanguage": "en",
        },
        {
            "@context": "https://schema.org",
            "@type": "Dataset",
            "name": "Claude and Codex usage-limit reset history",
            "description": "Every announced reset of Claude Code's 5-hour and "
                           "weekly usage limits by @ClaudeDevs, alongside Codex "
                           "resets, with dates derived from each post's X status ID.",
            "url": f"{SITE}/",
            "keywords": ["Claude", "Claude Code", "Anthropic", "usage limits",
                         "rate limit reset", "Codex", "OpenAI"],
            "isAccessibleForFree": True,
            "creator": {"@type": "Organization", "name": "claude-resets.com",
                        "url": f"{SITE}/"},
            "temporalCoverage": coverage,
            "distribution": {
                "@type": "DataDownload",
                "encodingFormat": "application/json",
                "contentUrl": f"{SITE}/data/resets.json",
            },
            "sameAs": "https://github.com/gmkbenjamin/claude-resets",
        },
    ]
    body = json.dumps(graph, indent=2, sort_keys=True)
    return f'<script type="application/ld+json">\n{body}\n</script>'


def inject(page: str, name: str, content: str) -> str:
    a, b = f"<!-- build:{name} -->", f"<!-- /build:{name} -->"
    pat = re.compile(re.escape(a) + ".*?" + re.escape(b), re.S)
    new, n = pat.subn(lambda _m: f"{a}{content}{b}", page)
    if n != 1:
        raise SystemExit(f"error: index.html needs exactly one build:{name} "
                         f"marker pair, found {n}")
    return new


def render_index(payload: dict) -> str:
    claude = payload["providers"]["claude"]["events"]
    reset_dates = sorted(e["date"] for e in claude if e["kind"] == "reset")
    stats = reset_stats(claude)
    page = INDEX.read_text(encoding="utf-8")
    page = inject(page, "jsonld", "\n" + render_jsonld(payload) + "\n")
    page = inject(page, "counter", "\n        " + render_counter(stats) + "\n        ")
    page = inject(page, "hero-sub", render_hero_sub(stats, reset_dates))
    page = inject(page, "tiles", render_tiles(stats))
    page = inject(page, "archive", render_archive(claude))
    return page


def render_sitemap(payload: dict) -> str:
    all_dates = sorted(e["date"] for p in payload["providers"].values()
                       for e in p["events"])
    lastmod = all_dates[-1][:10] if all_dates else "2026-01-01"
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        '  <url>\n'
        f'    <loc>{SITE}/</loc>\n'
        f'    <lastmod>{lastmod}</lastmod>\n'
        '    <changefreq>daily</changefreq>\n'
        '    <priority>1.0</priority>\n'
        '  </url>\n'
        '</urlset>\n')


def main() -> None:
    payload = build(load_events())
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    INDEX.write_text(render_index(payload), encoding="utf-8")
    SITEMAP.write_text(render_sitemap(payload), encoding="utf-8")

    for f in (OUTPUT, INDEX, SITEMAP):
        print(f"wrote {f.relative_to(ROOT)}")
    for key, provider in payload["providers"].items():
        events = provider["events"]
        resets = [e for e in events if e["kind"] == "reset"]
        other = len(events) - len(resets)
        extra = f" + {other} limit change(s)" if other else ""
        print(f"  {key + ':':8} {len(resets)} resets{extra}"
              f"  ({events[0]['date'][:10]} .. {events[-1]['date'][:10]})")


if __name__ == "__main__":
    main()
