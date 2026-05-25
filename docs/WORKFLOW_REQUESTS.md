# Workflow Request Guide

Use this guide when asking early users for workflows that should become safe, repeatable `formctl` examples.

Do not include credentials, cookies, private URLs, or production data.

## What To Send

### Painful API-less workflow

Describe the web form, internal tool, government site, admin panel, SaaS settings page, CRM update, or compliance attestation that still has no useful API.

### Current workaround

Explain how the workflow is done today:

- Manual browser steps
- Spreadsheet copy/paste
- Raw Playwright script
- Browser macro
- RPA
- AI browser agent

### Trust barrier

Name the thing that makes automation risky:

- File uploads
- Approvals
- Money movement
- Account or permission changes
- Private data
- Compliance records
- Selector drift

### Expected CLI command

Sketch the command you wish existed:

```bash
formctl submit vendor-onboarding --legalName "Acme Supplies" --riskTier medium --dry-run
```

### Fixture permission

Say whether this can become a public mock fixture. Good fixtures use fake data and local HTML only.

## Good Request Example

```text
Painful API-less workflow: Monthly compliance attestation in a vendor portal.
Current workaround: Ops opens the portal, checks five boxes, uploads a PDF, and screenshots the confirmation page.
Trust barrier: We need dry-run proof before submitting because the attestation is legally meaningful.
Expected CLI command: formctl submit compliance-attestation --period 2026-05 --attestation ./signed.pdf --dry-run
Fixture permission: Yes, if the portal and PDF are mocked with fake data.
```

## Not Useful Yet

- "Support every website"
- "Make browser automation reliable"
- "Use AI to click it"
- Requests that require real credentials or private production data

## Where To File It

Open a GitHub feature request and include this information:

https://github.com/codeyoma/formctl/issues/new?template=feature_request.yml
