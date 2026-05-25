# formctl Outreach Tracker

Primary ask: share painful API-less workflows that should become safe, repeatable CLI commands.

Release: https://github.com/codeyoma/formctl/releases/tag/v0.1.0

## Channel Plan

| Channel | Angle | Status | Stars before | Stars after 24h | Comments | Workflow leads | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| Hacker News | Show HN: safe CLI for API-less browser forms | Ready | 0 | 0 | 0 | 0 | Use concise technical pitch and ask for workflows. |
| Reddit r/commandline | CLI-first browser form automation with dry-run and approval gates | Ready | 0 | 0 | 0 | 0 | Emphasize terminal ergonomics and exit codes. |
| Reddit r/LocalLLaMA | Agent-safe form submission tool for workflows with no API | Ready | 0 | 0 | 0 | 0 | Emphasize JSON output and approval-required behavior. |
| LinkedIn | Product/ops angle for internal tools and API-less workflows | Ready | 0 | 0 | 0 | 0 | Ask operators/founders for manual form workflows. |
| Direct outreach | Ask 5 developers/operators about painful forms | Ready | 0 | 0 | 0 | 0 | Target people who build internal tools or use browser agents. |

## Hacker News Draft

```text
Show HN: formctl – turn browser forms into safe CLI commands

I built formctl for forms that still have no useful API: expense reports, admin panels, refund requests, vendor onboarding, and internal tools.

The idea: record a browser form once, then run it from the terminal with dry-run screenshots, selector mismatch checks, approval gates, and JSON output for agents.

GitHub release: https://github.com/codeyoma/formctl/releases/tag/v0.1.0

I am looking for painful API-less workflows that should become safe fixture examples.
```

## Reddit r/commandline Draft

```text
I built formctl, a CLI that records a browser form and turns it into repeatable commands.

The MVP supports:
- record live forms into YAML
- submit --dry-run with screenshot/summary artifacts
- submit --approve as the only non-interactive submit path
- selector mismatch checks before filling
- JSON output and stable exit codes

Release: https://github.com/codeyoma/formctl/releases/tag/v0.1.0

What API-less form workflows do you still automate manually?
```

## Reddit r/LocalLLaMA Draft

```text
I built formctl for agent-safe web form submission.

Browser agents can click forms, but repeatability and approval are weak. formctl records the form as YAML, does dry-run previews, fails on selector drift, and only submits with explicit --approve. It also returns JSON so agents can branch on status instead of scraping terminal text.

Release: https://github.com/codeyoma/formctl/releases/tag/v0.1.0

Looking for API-less workflows where this would be safer than raw browser control.
```

## LinkedIn Draft

```text
I built formctl: a small CLI for turning API-less browser forms into safe, repeatable commands.

It is aimed at internal tools and operations workflows where people still open a browser, fill a form, upload a file, and click submit.

formctl records the form, previews submissions with dry-run artifacts, blocks accidental submit unless --approve is passed, and gives JSON output for agents.

Release: https://github.com/codeyoma/formctl/releases/tag/v0.1.0

I am collecting painful manual form workflows to turn into examples.
```

## Direct Outreach Note

```text
I am testing a CLI called formctl for API-less browser forms.

It records a form once, then lets you dry-run and approve submissions from the terminal with screenshots, selector checks, and JSON output.

Do you have any internal tool, admin panel, expense, refund, vendor, or compliance form that is still painful because it has no API?
```

## Tracking Rules

- Record the first posted URL for each channel.
- Update Stars before and Stars after 24h.
- Count useful comments separately from total comments when possible.
- Treat Workflow leads as the main signal, not likes.
- Append every completed channel to the Launch Attempts section in `REVIEW.md`.

