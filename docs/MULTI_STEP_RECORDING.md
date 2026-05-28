# Multi-Step Recording Metadata

Manual recording can capture bounded setup context before a form is saved. This is useful for internal tools where a human opens a modal, moves to a known step, or navigates to the final form page before committing the workflow YAML.

Today this is review-only metadata for non-field interactions. `submit` replays fields in the first-recorded field order, but it does not replay arbitrary clicks or waits. That boundary keeps dry-run and approval behavior predictable while making the workflow easier to review in git.

## Example

```yaml
name: procurement-approval
targetUrl: http://localhost:4317/procurement-approval
recording:
  mode: manual
  events:
    - event: click
      selector: button[name="open-details"]
      value: "[redacted]"
    - event: wait
      waitFor: navigation
      value: "[redacted]"
    - event: select
      field: department
      selector: select[name="department"]
      value: "[redacted]"
    - event: input
      field: amount
      selector: input[name="amount"]
      value: "[redacted]"
```

What this means:

- `click` documents a named non-submit control the human used during setup.
- `wait` documents a bounded navigation wait without storing the destination URL.
- Field events can affect replay order because `submit` replays fields in the order the human first recorded them.
- Non-field `click` and `wait` events are not replayed by `submit` yet.

## Current Safe Boundary

Use this metadata when reviewers need to understand how a known form was prepared before recording. Good examples are opening a stable modal, moving through a local two-step form, or manually navigating from a setup page to the final form page.

Do not rely on this metadata for dynamic branching, arbitrary page exploration, hidden approvals, login bypasses, CAPTCHA handling, or MFA replay. `formctl` still stops before the final submit selector during dry-run and requires explicit approval before a real submission.

Use raw Playwright or a browser agent when the workflow needs custom assertions, conditional branching, open-ended exploration, or arbitrary click/wait replay. Bring the workflow back to `formctl` once the final form path is known and should become a reviewable CLI command.

## Validation Rules

Validation rejects recording metadata that is not bounded and redacted:

- recording mode must be `manual`
- event values must be `[redacted]` or `[file]`
- field events must match a known workflow field and selector
- click events must use named non-submit selectors
- wait events must use `waitFor: navigation`
- wait events must not store URLs, tokens, or private navigation data
