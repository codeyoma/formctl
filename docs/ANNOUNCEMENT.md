# formctl Announcement Draft

GitHub: https://github.com/codeyoma/formctl

## Primary Post

I built formctl: record a browser form once, then run it as a CLI command with dry-run screenshots, selector mismatch checks, approval gates, and JSON output for agents.

It is for API-less workflows: internal tools, expense forms, admin panels, refund requests, vendor onboarding, and any browser form that is still manual because there is no useful API.

Demo video: `docs/assets/demo.mp4`

Trust notes: `docs/TRUST.md`

Comparison: `docs/COMPARISON.md`

The safety model is intentionally boring:

- `submit --dry-run` fills the form and captures review artifacts without clicking submit.
- `submit` without approval exits `5`.
- `submit --approve` is the only non-interactive path that clicks the recorded submit selector.
- Recorded selectors must match exactly one element before formctl fills anything.
- JSON output lets agents branch on status instead of scraping terminal text.

What I want feedback on:

- Which API-less workflows are painful enough that you would commit a workflow file to git?
- Is the approval model strict enough for agent use?
- Which fixture examples would make this easier to evaluate?

Workflow request guide: `docs/WORKFLOW_REQUESTS.md`

Repo: https://github.com/codeyoma/formctl

## Short Post

formctl turns any browser form into a safe, repeatable CLI command.

Record once, then run with dry-run screenshots, selector mismatch checks, approval gates, audit-friendly artifacts, and JSON output for agents.

Looking for painful API-less workflows to turn into examples.

https://github.com/codeyoma/formctl

## Launch checklist run

Last local verification before this draft:

```bash
npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts
npm run build
npx tsc --noEmit
npm run formctl -- doctor --json
```

Expected result:

- Full test suite passes.
- TypeScript typecheck passes.
- `doctor --json` returns status `ok`.
- README demo media is present.
- GitHub repo is public at https://github.com/codeyoma/formctl.
