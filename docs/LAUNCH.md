# formctl Launch Checklist

Public repo: https://github.com/codeyoma/formctl

## Pre-Launch Verification

- [ ] Run `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`.
- [ ] Run `npm run build`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run demo`.
- [ ] In a second terminal, run the README record command.
- [ ] Run the README dry-run command and inspect `.formctl/runs/<run-id>/summary.json`.
- [ ] Run an approval-required command and confirm exit code `5`.
- [ ] Run an approved submit command only against the local demo.

## Demo Media

- [ ] Capture a 30-60 second demo showing record, dry-run JSON, screenshot artifact, approval-required JSON, and approved submit.
- [ ] Keep the terminal readable at 1280x720 or larger.
- [ ] Avoid real credentials, private URLs, or private forms.
- [ ] Add the demo media to the README after the file is small enough for GitHub.

## Launch Copy

One-line pitch:

```text
formctl turns any browser form into a safe, repeatable CLI command.
```

Short post:

```text
I built formctl: record a browser form once, then run it as a CLI command with dry-run screenshots, selector mismatch checks, approval gates, and JSON output for agents.

It is for API-less internal tools, expense forms, admin panels, and workflows where raw browser automation is too fragile to trust.

GitHub: https://github.com/codeyoma/formctl
```

## First 500 stars

- [ ] Post the demo to developer communities that care about CLI tools, browser automation, internal tools, and AI agents.
- [ ] Ask for painful API-less workflows, not generic feature requests.
- [ ] Convert the best requests into local fixture examples.
- [ ] Keep README first-run time under two minutes.

## 10k stars Loop

- [ ] Every week, record stars, forks, issues, discussions, and demo views in `REVIEW.md`.
- [ ] Ship one first-run or trust improvement.
- [ ] Publish one artifact: demo, example, comparison, or short technical post.
- [ ] Keep positioning focused on safe form submission, not generic RPA.
