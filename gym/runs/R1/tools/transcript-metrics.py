#!/usr/bin/env python3
"""T4 real-session metrics (01 §3 T4) over Claude Code session transcripts.

Usage: transcript-metrics.py [--reviews DIR] TRANSCRIPT.jsonl [...]
Prints one JSON object: per-session metrics, per-review reviewer usage, and
the metrics that cannot be computed from these inputs (null + reason).

Re-created in R1 iteration 0 from the metric definitions in 00-audit.md §4;
the planning verifier's scripts S1–S12 were never written to disk.
"""
import json
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

# Invocations only: a bare word match counted `ls vitest*.ts` in the it1–3
# session as a vitest run.
INVOKED = r"(?:npx\s+|node_modules/\.bin/|npm\s+run\s+|(?:^|[;&|(]\s*)){}(?![\w.*-])"
CHECK_PATTERNS = {
    name: re.compile(INVOKED.format(name), re.M) for name in ("tsc", "vitest", "eslint", "prettier")
}
RETRIEVED_AT = re.compile(r'retrievedAt\\*"\s*:\s*\\*"([^"\\]+)')
# The investigate session set `now="2026-09-28T12:00:00.000Z"` in a Python
# heredoc and wrote `"retrievedAt":now`; the literal-only match missed it.
RETRIEVED_AT_NAME = re.compile(r'retrievedAt\\*"\s*:\s*([A-Za-z_]\w*)')
ASSIGNMENT = r'\b{}\s*=\s*\\*"(\d{{4}}-\d\d-\d\dT[^"\\]+)'
# Label characters only: an it4–6 command grepped for `mcpServer":"[^"]*"`.
MCP_SERVER = re.compile(r'mcpServer\\*"\s*:\s*\\*"([\w:.-]+)\\*"')


def ts(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def text_of(content):
    if isinstance(content, str):
        return content
    return json.dumps(content)


def session_metrics(path):
    rows = [json.loads(line) for line in open(path) if line.strip()]
    assistant = [r for r in rows if r.get("type") == "assistant"]
    uses, results = {}, {}
    response_usage = {}
    for r in assistant:
        msg = r["message"]
        # One API response is split over several rows that repeat `usage`
        # (00-audit §4: totals were 2.1–2.9x too high when summed per row).
        response_usage[msg.get("id")] = msg.get("usage") or {}
        for c in msg.get("content", []):
            if isinstance(c, dict) and c.get("type") == "tool_use":
                uses[c["id"]] = {"at": r["timestamp"], "name": c["name"], "input": c.get("input", {})}
    for r in rows:
        if r.get("type") != "user":
            continue
        content = r["message"].get("content")
        if not isinstance(content, list):
            continue
        for c in content:
            if isinstance(c, dict) and c.get("type") == "tool_result":
                results[c["tool_use_id"]] = {"at": r["timestamp"], "text": text_of(c.get("content"))}

    tool_mix = Counter(u["name"] for u in uses.values())
    bash = [(i, u) for i, u in uses.items() if u["name"] == "Bash"]

    asks = [(i, u) for i, u in uses.items() if u["name"] == "AskUserQuestion"]
    waits = []
    mcp_questions = 0
    for i, u in asks:
        if re.search(r"MCP server", json.dumps(u["input"]), re.I):
            mcp_questions += 1
        if i in results:
            waits.append(int((ts(results[i]["at"]) - ts(u["at"])).total_seconds()))

    mcp_fetches = sorted(
        (u["at"], i) for i, u in uses.items() if u["name"].startswith("mcp__") and u["name"].endswith("getJiraIssue")
    )
    jira_keys = Counter(
        str(uses[i]["input"].get("issueIdOrKey")) for _, i in mcp_fetches
    )
    first_fetch = mcp_fetches[0][0] if mcp_fetches else None

    # A provenance stamp is fabricated when it names a time after the command
    # that carries it was issued, or before the first requirement fetch.
    stamps, fabricated, labels = {}, set(), Counter()
    for i, u in bash:
        cmd = json.dumps(u["input"])
        for label in MCP_SERVER.findall(cmd):
            labels[label] += 1
        values = RETRIEVED_AT.findall(cmd)
        raw = u["input"].get("command", "")
        for name in set(RETRIEVED_AT_NAME.findall(raw)):
            values += re.findall(ASSIGNMENT.format(re.escape(name)), raw)
        for value in values:
            stamps.setdefault(value, u["at"])
            try:
                late = ts(value) > ts(u["at"])
                early = first_fetch is not None and ts(value) < ts(first_fetch)
            except ValueError:
                late, early = True, False
            if late or early:
                fabricated.add(value)

    denials = sum(1 for r in results.values() if "has been denied" in r["text"])
    refusals = [
        {"at": results[i]["at"], "bytes": [int(b) for b in re.findall(r"is (\d+) bytes", results[i]["text"])]}
        for i, u in uses.items()
        if i in results and "snapshot-too-large" in results[i]["text"]
    ]
    checks = {
        name: sum(1 for _, u in bash if pattern.search(u["input"].get("command", "")))
        for name, pattern in CHECK_PATTERNS.items()
    }
    prepare_calls = [
        u["at"] for _, u in bash if re.search(r"ambicode(\.mjs\"?)?\s+prepare\b", u["input"].get("command", ""))
    ]
    stamps_ts = [r["timestamp"] for r in rows if r.get("timestamp")]
    return {
        "transcript": Path(path).name,
        "span": [stamps_ts[0], stamps_ts[-1]] if stamps_ts else None,
        "assistantRows": len(assistant),
        "responses": len(response_usage),
        "toolCalls": len(uses),
        "outputTokensDedup": sum(u.get("output_tokens", 0) for u in response_usage.values()),
        "toolMix": dict(tool_mix.most_common()),
        "humanQuestions": len(asks),
        "humanWaitSeconds": waits,
        "mcpServerQuestions": mcp_questions,
        "requirementFetches": len(mcp_fetches),
        "requirementKeys": dict(jira_keys),
        "firstRequirementFetchAt": first_fetch,
        "retrievedAtValues": stamps,
        "fabricatedProvenanceFields": len(fabricated),
        "mcpServerLabels": dict(labels),
        "permissionDenials": denials,
        "reviewLaunchesRefused": len(refusals),
        "refusals": refusals,
        "selfRunChecks": checks,
        "lspCalls": tool_mix.get("LSP", 0),
        "prepareCalls": len(prepare_calls),
    }


def review_metrics(directory):
    out = []
    for result in sorted(Path(directory).glob("*/result.json")):
        data = json.loads(result.read_text())
        usage = (data.get("reviewer") or {}).get("usage") or {}
        out.append({
            "review": result.parent.name,
            "status": data.get("status"),
            "findings": len(data.get("findings") or []),
            "turns": usage.get("turns"),
            "costUsd": usage.get("costUsd"),
        })
    return out


def main(argv):
    reviews = None
    if len(argv) > 1 and argv[0] == "--reviews":
        reviews, argv = argv[1], argv[2:]
    if not argv:
        sys.exit(__doc__)
    report = {
        "sessions": [session_metrics(p) for p in argv],
        "reviews": review_metrics(reviews) if reviews else None,
        "notComputed": {
            "shortlistRecallAt10": "needs `git diff --name-only <base> <head>` in the FE repository, which agents may not enter (08 §4)",
            "laterIterationFindings": "human label (02 §6)",
        },
    }
    json.dump(report, sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main(sys.argv[1:])
