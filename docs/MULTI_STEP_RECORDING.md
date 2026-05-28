# Multi-Step Recording Metadata

Manual recording can capture bounded setup context before a form is saved. This is useful for internal tools where a human opens a modal, moves to a known step, or navigates to the final form page before committing the workflow YAML.

Today `submit` supports bounded setup click replay for named non-submit controls, then replays fields in the first-recorded field order. It does not replay arbitrary clicks or waits. That boundary keeps dry-run and approval behavior predictable while allowing common modal-opening setup flows.

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
- `submit` checks that each setup click selector resolves to exactly one non-submit control, clicks it, and writes `selector_check` plus `setup_click` audit events.
- `wait` documents a bounded navigation wait without storing the destination URL.
- Field events can affect replay order because `submit` replays fields in the order the human first recorded them.
- `wait` events are not replayed by `submit` yet.

## Current Safe Boundary

Use bounded setup click replay when a known form requires opening a stable modal or panel before the fields exist. Use wait metadata only when reviewers need to understand that manual navigation happened before recording.

Do not rely on this metadata for dynamic branching, arbitrary page exploration, hidden approvals, login bypasses, CAPTCHA handling, MFA replay, or navigation replay. `formctl` still stops before the final submit selector during dry-run and requires explicit approval before a real submission.

Use raw Playwright or a browser agent when the workflow needs custom assertions, conditional branching, open-ended exploration, or arbitrary click/wait replay. Bring the workflow back to `formctl` once the final form path is known and should become a reviewable CLI command.

## Validation Rules

Validation rejects recording metadata that is not bounded and redacted:

- recording mode must be `manual`
- event values must be `[redacted]` or `[file]`
- field events must match a known workflow field and selector
- click events must use named non-submit selectors
- setup click selectors must resolve to exactly one non-submit control before fields are checked
- wait events must use `waitFor: navigation`
- wait events must not store URLs, tokens, or private navigation data
