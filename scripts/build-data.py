#!/usr/bin/env python3
"""Build public/data/resets.json from data/events.json.

Events are stored as bare X status IDs. Every timestamp is derived from the
ID's embedded snowflake timestamp rather than transcribed, so a date cannot
drift from its source.

Add an event by appending it to data/events.json, then run this. An entry needs
only the X status ID; `kind` is "reset" (the counters were flushed, counts toward
every metric) or "policy" (the ceiling moved, listed but never counted), and
Claude entries also need a `note`, which is the archive card's body.

Output is deterministic: same input, byte-identical output.
"""

import datetime
import json
import pathlib

SNOWFLAKE_EPOCH_MS = 1288834974657

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "events.json"
OUTPUT = ROOT / "public" / "data" / "resets.json"


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

    return {"generated": None, "providers": providers}


def main() -> None:
    payload = build(load_events())
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    print(f"wrote {OUTPUT.relative_to(ROOT)}")
    for key, provider in payload["providers"].items():
        events = provider["events"]
        resets = [e for e in events if e["kind"] == "reset"]
        other = len(events) - len(resets)
        extra = f" + {other} limit change(s)" if other else ""
        print(f"  {key + ':':8} {len(resets)} resets{extra}"
              f"  ({events[0]['date'][:10]} .. {events[-1]['date'][:10]})")


if __name__ == "__main__":
    main()
