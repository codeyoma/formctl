# Growth Log

Use this file for the weekly 10k-star loop. Record the metric snapshot, what shipped, what changed in positioning, and the next distribution action.

## Baseline: 2026-05-26

| Date | Channel | Posted URL | GitHub Stars | Forks | Open Issues | Discussions | npm Downloads | Demo Views | Comments | Workflow Leads | Next Action |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | --- |
| 2026-05-26 | Not posted | Not posted | 0 | 0 | 1 | 0 | Not published: `npm view formctl` returns `E404` | Not measured | 0 | 0 | Post one example-led outreach message from `docs/POSTING_QUEUE.md` |

## Snapshot: 2026-05-27

| Date | Channel | Posted URL | GitHub Stars | Forks | Open Issues | Discussions | npm Downloads | Demo Views | Comments | Workflow Leads | Next Action |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | --- |
| 2026-05-27 | Not posted | Not posted | 0 | 0 | 1 | 0 | Not published: `npm view formctl` returns `E404` | Not measured | 0 | 0 | Human posts Reddit r/commandline candidate from `docs/POSTING_QUEUE.md` |

**Shipped:** Shipped MCP workflow discovery and validation tools for agent clients.

**Notes:** Repository remains public at https://github.com/codeyoma/formctl. npm package name still returns `E404`; npm publish is still blocked until npm browser/one-time-password authentication is completed. Open issue #1 tracks the first outreach channels and remains active.

## Snapshot: 2026-05-28

| Date | Channel | Posted URL | GitHub Stars | Forks | Open Issues | Discussions | npm Downloads | Demo Views | Comments | Workflow Leads | Next Action |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | --- |
| 2026-05-28 | Not posted | Not posted | 0 | 0 | 1 | 0 | Not published: `npm view formctl` returns `E404` | Not measured | 0 | 0 | Post one example-led outreach message |

**Shipped:** Added `npm run growth:snapshot` so weekly growth metrics can be captured as JSON or a markdown table row before updating this log.

**Notes:** Repository metrics were captured from `gh api repos/codeyoma/formctl`; npm still reports `E404`, so package publication remains blocked on npm browser/one-time-password authentication rather than package name availability.

## Snapshot: 2026-05-29

| Date | Channel | Posted URL | GitHub Stars | Forks | Open Issues | Discussions | npm Downloads | Demo Views | Comments | Workflow Leads | Next Action |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | --- |
| 2026-05-29 | npm publish | https://www.npmjs.com/package/formctl | 0 | 0 | 1 | 0 | Unavailable: npm downloads API failed | Not measured | 0 | 0 | Post one example-led outreach message |

**Shipped:** Published `formctl@0.1.1` to npm and verified the installed package from a temporary directory.

**Notes:** The npm package is published as latest `0.1.1`. Future publishes still require OTP or a granular publish token; run `npm run publish:check -- --json` before the next version.

## Source commands

```bash
npm run growth:snapshot -- --markdown --timezone Asia/Seoul
npm run growth:snapshot -- --json --timezone Asia/Seoul
npm run growth:snapshot -- --markdown --timezone Asia/Seoul --demo-views N --workflow-leads N
npm run growth:snapshot -- --markdown --timezone Asia/Seoul --demo-views N --comments N --workflow-leads N
npm run growth:snapshot -- --markdown --timezone Asia/Seoul --comments N
npm run growth:snapshot -- --markdown --timezone Asia/Seoul --channel CHANNEL --posted-url URL
npm run growth:snapshot -- --markdown --date YYYY-MM-DD
gh repo view codeyoma/formctl --json stargazerCount,forkCount
gh api repos/codeyoma/formctl --jq '{stars: .stargazers_count, forks: .forks_count, open_issues_count: .open_issues_count, pushed_at: .pushed_at}'
gh api graphql -F owner=codeyoma -F name=formctl -f 'query=query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { discussions(first: 1) { totalCount } } }'
gh issue list --repo codeyoma/formctl --state open --json number,title --jq 'length'
npm view formctl version --json
curl -sS https://api.npmjs.org/downloads/point/last-week/formctl
```

Use the snapshot command first; the raw `gh` and `npm` commands are kept here for auditability if the script output needs to be checked by hand.

The npm package is published as latest `0.1.1`. npm's downloads API may lag immediately after first publish; record `Unavailable: npm downloads API failed` until it returns a `downloads` number.

## Weekly Review Template

**Week Ending:** YYYY-MM-DD

**Metrics:** Channel, posted URL, GitHub stars, forks, open issues, discussions, npm downloads, demo views, comments, workflow leads.

**Shipped:** Product, docs, examples, launch assets, or reliability improvements.

**Most Useful Feedback:** The highest-signal comment, issue, user quote, or workflow request.

**Positioning Change:** What should change in the pitch, README, examples, or outreach copy.

**Next Action:** One concrete action for the next week.
