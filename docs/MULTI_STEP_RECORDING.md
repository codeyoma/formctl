# Multi-Step Recording Metadata

Manual recording can capture bounded setup context before a form is saved. This is useful for internal tools where a human opens a modal, moves to a known step, or navigates to the final form page before committing the workflow YAML.

Today `submit` supports bounded setup click replay for named non-submit controls at the start of `recording.events`, then replays fields in the first-recorded field order. It does not replay arbitrary clicks or waits. That boundary keeps dry-run and approval behavior predictable while allowing common modal-opening setup flows.
Reviewed workflows can also declare structured `before-fields` click steps for known setup actions and structured `after-fields` click steps for known review or confirmation controls that run after field values are filled.

## Example

```yaml
name: procurement-approval
targetUrl: http://localhost:4317/procurement-approval
steps:
  - name: open approval modal
    action: click
    selector: button[name="open-details"]
    when: before-fields
  - name: review entered details
    action: click
    selector: button[name="review-details"]
    when: after-fields
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

- `steps` can declare reviewed setup clicks that run before field selector checks and reviewed confirmation clicks that run after fields are filled.
- A `before-fields` step must be a named non-submit click with a bounded selector.
- An `after-fields` step must also be a named non-submit click with a bounded selector. Its selector and control type are checked before fields are filled; the actual click runs after field replay.
- Structured steps emit `workflow_step` and `step_screenshot_saved` audit events, and `submit --json` includes their screenshot artifacts under `artifacts.steps`.
- `click` documents a named non-submit control the human used during setup.
- Only leading `click` events before the first field or wait event are replayed as setup.
- `submit` checks that each setup click selector resolves to exactly one non-submit control, clicks it, and writes `selector_check` plus `setup_click` audit events.
- Setup click selector failures return selector-mismatch JSON with `role: "setup-click"` before any field filling or final submission.
- `wait` documents a bounded navigation wait without storing the destination URL.
- Field events can affect replay order because `submit` replays fields in the order the human first recorded them.
- `wait` events are not replayed by `submit` yet.

## Current Safe Boundary

Use bounded setup click replay when a known form requires opening a stable modal or panel before the fields exist. Use an `after-fields` step when a known review button is already selectable before field filling, becomes clickable after field values are entered, and reveals the final submit control. A raw `click` recorded after a field event remains review metadata until it is promoted into a reviewed structured step. Use wait metadata only when reviewers need to understand that manual navigation happened before recording.

Do not rely on this metadata for dynamic branching, arbitrary page exploration, hidden approvals, login bypasses, CAPTCHA handling, MFA replay, or navigation replay. `formctl` still stops before the final submit selector during dry-run and requires explicit approval before a real submission.

Use raw Playwright or a browser agent when the workflow needs custom assertions, conditional branching, open-ended exploration, or arbitrary click/wait replay. Bring the workflow back to `formctl` once the final form path is known and should become a reviewable CLI command.

See the [Bounded navigation step design](NAVIGATION_STEPS.md) before adding any navigation replay support. Navigation steps must remain explicit, same-origin, reviewable, and approval-gated.

## Validation Rules

Validation rejects recording metadata that is not bounded and redacted:

- structured steps must use `name`, `action: click`, a named selector, and `when: before-fields` or `when: after-fields`
- recording mode must be `manual`
- event values must be `[redacted]` or `[file]`
- field events must match a known workflow field and selector
- click events must use named non-submit selectors
- only leading click events are replayed as setup
- setup click selectors must resolve to exactly one non-submit control before fields are checked
- setup click selector drift is reported with `role: "setup-click"` in JSON failure output
- structured step selector drift is reported with `role: "workflow-step"` in JSON failure output
- `after-fields` step selectors are checked before field filling, clicked after field replay, and screenshot artifacts are captured after the click
- wait events must use `waitFor: navigation`
- wait events must not store URLs, tokens, or private navigation data
