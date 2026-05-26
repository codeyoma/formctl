# Growth Log

Use this file for the weekly 10k-star loop. Record the metric snapshot, what shipped, what changed in positioning, and the next distribution action.

## Baseline: 2026-05-26

| Date | GitHub Stars | Forks | Open Issues | npm Downloads | Demo Views | Workflow Leads | Next Action |
| --- | ---: | ---: | ---: | --- | --- | ---: | --- |
| 2026-05-26 | 0 | 0 | 1 | Not published: `npm view formctl` returns `E404` | Not measured | 0 | Post one example-led outreach message from `docs/POSTING_QUEUE.md` |

## Snapshot: 2026-05-27

| Date | GitHub Stars | Forks | Open Issues | npm Downloads | Demo Views | Workflow Leads | Next Action |
| --- | ---: | ---: | ---: | --- | --- | ---: | --- |
| 2026-05-27 | 0 | 0 | 1 | Not published: `npm view formctl` returns `E404` | Not measured | 0 | Human posts Reddit r/commandline candidate from `docs/POSTING_QUEUE.md` |

**Shipped:** Shipped MCP workflow discovery and validation tools for agent clients.

**Notes:** Repository remains public at https://github.com/codeyoma/formctl. npm package name still returns `E404`; npm publish is still blocked until npm auth is configured. Open issue #1 tracks the first outreach channels and remains active.

## Source commands

```bash
gh repo view codeyoma/formctl --json stargazerCount,forkCount
gh api repos/codeyoma/formctl --jq '{stars: .stargazers_count, forks: .forks_count, open_issues_count: .open_issues_count, pushed_at: .pushed_at}'
gh issue list --repo codeyoma/formctl --state open --json number,title --jq 'length'
npm view formctl version --json
```

The npm package name still appears available, but npm publish blocked until npm auth is configured.

## Weekly Review Template

**Week Ending:** YYYY-MM-DD

**Metrics:** GitHub stars, forks, open issues, npm downloads, demo views, workflow leads.

**Shipped:** Product, docs, examples, launch assets, or reliability improvements.

**Most Useful Feedback:** The highest-signal comment, issue, user quote, or workflow request.

**Positioning Change:** What should change in the pitch, README, examples, or outreach copy.

**Next Action:** One concrete action for the next week.
