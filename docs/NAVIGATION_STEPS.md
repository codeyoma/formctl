# Bounded Navigation Step Design

Navigation step replay is not implemented yet. This note defines the boundary that must hold before `formctl` accepts navigation replay in workflow YAML.

`formctl` should support known multi-page forms without becoming a general browser automation runner. A future navigation step must be triggered by a named non-submit click that a reviewer can inspect in YAML. It must not store full destination URLs, query strings, fragments, tokens, cookies, or arbitrary browser state.

## Future Workflow Shape

The exact YAML is still a draft. A safe shape would look like this:

```yaml
steps:
  - name: continue to details page
    action: click
    selector: button[name="continue"]
    when: after-fields
    waitFor:
      type: navigation
      sameOrigin: true
      path: /procurement/details
```

This is not accepted by `formctl validate` yet. The point of the shape is to keep navigation explicit, named, same-origin, and reviewable before runtime support exists.

## Required Contract

- The trigger must be a named non-submit click, not a free-form browser action.
- The wait target must be same-origin and must not store full destination URLs.
- The workflow must not persist query strings, fragments, tokens, credentials, cookies, or request bodies.
- The run must rerun interaction-required checks after navigation and before checking the next page's selectors.
- Field, step, and submit selectors must still fail with structured artifacts instead of silently healing.
- A dry-run still stops before the final submit selector, even after navigation succeeds.
- Approved submit still requires `--approve` or an interactive approval prompt.
- Audit logs must include the navigation step, selector check, wait result, and screenshot artifact paths.

## Non-Goals

- No automatic branching.
- No direct `page.goto` replay.
- No arbitrary wait conditions.
- No cross-origin navigation replay.
- No hidden approval, login, CAPTCHA, MFA, or credential replay.
- No selector healing during submission.

Use raw Playwright or a browser agent when the workflow needs exploration, conditional branching, arbitrary navigation, custom assertions, or cross-origin coordination. Bring the stable path back to `formctl` only after it is known, bounded, and worth reviewing as a CLI workflow.
