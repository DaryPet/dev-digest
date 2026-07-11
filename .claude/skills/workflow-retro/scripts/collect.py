#!/usr/bin/env python3
"""Collect multi-agent run metrics from the current Claude Code session transcript.

Usage:
    python3 collect.py [session-id]

Reads ~/.claude/projects/<cwd-slug>/<session>.jsonl plus its subagents/ folder
and prints a ready-to-paste markdown metrics block (table, totals, launch
order). Numbers only — every value is computed from the transcript; nothing is
estimated. Narrative sections are the caller's job.

Pricing: per-MTok rates below cover known model families; cache-read is billed
at 0.1x the input rate, 5m cache writes at 1.25x. Unknown models get cost
"n/a" — never guess. Update rates from the claude-api skill when models change.
"""

import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

PRICING = {  # USD per MTok: (input, output). Cache: read=0.1x in, 5m write=1.25x in, 1h write=2x in.
    "opus": (15.0, 75.0),
    "sonnet": (3.0, 15.0),
    "haiku": (1.0, 5.0),
}


def price_for(model: str):
    for family, rates in PRICING.items():
        if family in (model or ""):
            return rates
    return None


def parse_ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None


def iter_jsonl(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


class Stats:
    def __init__(self):
        self.inp = self.out = self.cache_read = self.cache_write = 0
        self.tools = 0
        self.models = Counter()
        self.first_ts = self.last_ts = None
        self.reads = Counter()  # file_path -> count (Read tool)

    def add(self, rec):
        ts = parse_ts(rec.get("timestamp"))
        if ts:
            self.first_ts = min(self.first_ts or ts, ts)
            self.last_ts = max(self.last_ts or ts, ts)
        if rec.get("type") != "assistant":
            return
        msg = rec.get("message") or {}
        usage = msg.get("usage") or {}
        self.inp += usage.get("input_tokens", 0)
        self.out += usage.get("output_tokens", 0)
        self.cache_read += usage.get("cache_read_input_tokens", 0)
        self.cache_write += usage.get("cache_creation_input_tokens", 0)
        if msg.get("model"):
            self.models[msg["model"]] += 1
        for block in msg.get("content") or []:
            if isinstance(block, dict) and block.get("type") == "tool_use":
                self.tools += 1
                if block.get("name") == "Read":
                    fp = (block.get("input") or {}).get("file_path")
                    if fp:
                        self.reads[fp] += 1

    @property
    def model(self):
        return self.models.most_common(1)[0][0] if self.models else "?"

    @property
    def span_s(self):
        if self.first_ts and self.last_ts:
            return (self.last_ts - self.first_ts).total_seconds()
        return 0

    @property
    def hit_pct(self):
        denom = self.inp + self.cache_read + self.cache_write
        return round(100 * self.cache_read / denom) if denom else 0

    @property
    def cost(self):
        rates = price_for(self.model)
        if not rates:
            return None
        rin, rout = rates
        return (
            self.inp * rin + self.out * rout
            + self.cache_read * rin * 0.1 + self.cache_write * rin * 1.25
        ) / 1e6


def fmt_cost(c):
    return f"${c:.2f}" if c is not None else "n/a"


def fmt_span(s):
    return f"{s:.0f}s"


def main():
    slug = re.sub(r"[/.]", "-", os.getcwd())
    proj = Path.home() / ".claude" / "projects" / slug
    if not proj.is_dir():
        sys.exit(f"no transcript dir: {proj}")

    if len(sys.argv) > 1:
        session = proj / f"{sys.argv[1]}.jsonl"
    else:
        candidates = sorted(proj.glob("*.jsonl"), key=lambda p: p.stat().st_mtime)
        if not candidates:
            sys.exit("no session transcripts found")
        session = candidates[-1]
    sid = session.stem

    # main-session stats + launch order of Agent/Task spawns
    main_stats = Stats()
    launches = []  # (ts, tool_use_id, subagent_type, description)
    for rec in iter_jsonl(session):
        if rec.get("isSidechain"):
            continue
        main_stats.add(rec)
        if rec.get("type") != "assistant":
            continue
        for block in (rec.get("message") or {}).get("content") or []:
            if isinstance(block, dict) and block.get("type") == "tool_use" \
                    and block.get("name") in ("Agent", "Task"):
                inp = block.get("input") or {}
                launches.append((rec.get("timestamp"), block.get("id"),
                                 inp.get("subagent_type", "?"), inp.get("description", "")))

    # subagents: current layout <session>/subagents/agent-*.jsonl (+ .meta.json);
    # legacy layout: isSidechain lines inside the main file, grouped by agentId
    agents = {}  # id -> {"meta": {...}, "stats": Stats}
    subdir = proj / sid / "subagents"
    for tr in sorted(subdir.glob("agent-*.jsonl")) if subdir.is_dir() else []:
        aid = tr.stem.removeprefix("agent-")
        meta_path = tr.with_suffix("").with_suffix(".meta.json")
        meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
        st = Stats()
        for rec in iter_jsonl(tr):
            st.add(rec)
        agents[aid] = {"meta": meta, "stats": st}
    if not agents:  # legacy fallback
        legacy = defaultdict(Stats)
        for rec in iter_jsonl(session):
            if rec.get("isSidechain") and rec.get("agentId"):
                legacy[rec["agentId"]].add(rec)
        agents = {aid: {"meta": {}, "stats": st} for aid, st in legacy.items()}

    by_tool_use = {a["meta"].get("toolUseId"): aid for aid, a in agents.items()}

    print(f"session: {sid}\n")
    header = "| agent | role | model | depth | in | out | cache-read | hit% | tools | span | cost |"
    print(header)
    print("|" + "---|" * 11)

    def row(name, role, model, depth, st):
        print(f"| {name} | {role} | {model} | {depth} | {st.inp:,} | {st.out:,} "
              f"| {st.cache_read:,} | {st.hit_pct}% | {st.tools} "
              f"| {fmt_span(st.span_s)} | {fmt_cost(st.cost)} |")

    row("main", "orchestrator", main_stats.model, 0, main_stats)
    for aid, a in sorted(agents.items(), key=lambda kv: kv[1]["stats"].first_ts or datetime.max):
        st, meta = a["stats"], a["meta"]
        row(aid[:8], meta.get("agentType", "?"), st.model, meta.get("spawnDepth", "?"), st)

    all_stats = [main_stats] + [a["stats"] for a in agents.values()]
    tin = sum(s.inp for s in all_stats)
    tout = sum(s.out for s in all_stats)
    tcr = sum(s.cache_read for s in all_stats)
    tcw = sum(s.cache_write for s in all_stats)
    ttools = sum(s.tools for s in all_stats)
    costs = [s.cost for s in all_stats]
    tcost = fmt_cost(sum(c for c in costs if c is not None)) if any(c is not None for c in costs) else "n/a"
    if None in costs:
        tcost += " (partial — unknown model pricing)"
    hit = round(100 * tcr / (tin + tcr + tcw)) if (tin + tcr + tcw) else 0
    wall = main_stats.span_s
    busy = sum(a["stats"].span_s for a in agents.values())
    agent_wall = 0
    firsts = [a["stats"].first_ts for a in agents.values() if a["stats"].first_ts]
    lasts = [a["stats"].last_ts for a in agents.values() if a["stats"].last_ts]
    if firsts and lasts:
        agent_wall = (max(lasts) - min(firsts)).total_seconds()
    par = f"{busy / agent_wall:.1f}x" if agent_wall else "n/a"

    print(f"\nTotals: in {tin:,} · out {tout:,} · cache-read {tcr:,} · cache hit {hit}% "
          f"· tools {ttools} · session wall {wall/60:.1f}m · agent parallelism {par} · cost {tcost}")

    if launches:
        print("\nLaunch order:")
        for ts, tuid, stype, desc in launches:
            aid = by_tool_use.get(tuid)
            mark = aid[:8] if aid else "(rejected/not run)"
            print(f"  {ts}  {stype} — {desc} [{mark}]")
    else:
        print("\nLaunch order: no agent spawns found in this session")

    # cross-agent duplicated reads
    readers = defaultdict(set)
    for aid, a in agents.items():
        for fp in a["stats"].reads:
            readers[fp].add(aid[:8])
    for fp in main_stats.reads:
        readers[fp].add("main")
    dups = {fp: who for fp, who in readers.items() if len(who) > 1}
    if dups:
        print("\nDuplicated reads (same file read by >1 agent):")
        for fp, who in sorted(dups.items(), key=lambda kv: -len(kv[1])):
            print(f"  {len(who)}x  {fp}  ({', '.join(sorted(who))})")
    else:
        print("\nDuplicated reads: none")


if __name__ == "__main__":
    main()
