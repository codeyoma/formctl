# Example Before And After Posts

Use these short posts when explaining concrete `formctl` examples in outreach, issues, or release notes. They stay local and mock-backed so no real credentials, private URLs, or production data are needed.

## Expense report

Before:

Open the expense portal, fill the amount, attach the receipt, check that the form did not change, and click submit by hand.

After:

```bash
formctl submit expense-report --amount 120000 --receipt ./receipt.txt --dry-run --json
formctl submit expense-report --amount 120000 --receipt ./receipt.txt --approve --json
```

The dry-run captures review artifacts before the submit button is clicked.

## Admin invite

Before:

Open the admin panel, type the new user's email, choose the role, decide whether to notify them, and hope the page still matches the old runbook.

After:

```bash
formctl submit admin-invite --email ops@example.com --role admin --notify true --dry-run --json
formctl submit admin-invite --email ops@example.com --role admin --notify true --approve --json
```

Selectors must match before `formctl` fills the invite form.

## Support refund

Before:

Find the refund screen, copy the order ID, pick a refund date, paste a reason, and manually submit a customer-impacting action.

After:

```bash
formctl submit support-refund --orderId ORD-1001 --refundDate 2026-05-26 --reason "Duplicate charge" --dry-run --json
formctl submit support-refund --orderId ORD-1001 --refundDate 2026-05-26 --reason "Duplicate charge" --approve --json
```

The approval gate keeps refund submission separate from preview.

## Vendor onboarding

Before:

Open the vendor portal, fill legal details, upload a tax form, choose risk tier, confirm NDA status, and add notes.

After:

```bash
formctl submit vendor-onboarding --legalName "Acme Supplies" --website https://vendor.example --taxForm ./tax-form.txt --riskTier medium --ndaSigned true --onboardingDate 2026-05-26 --notes "Approved vendor" --dry-run --json
formctl submit vendor-onboarding --legalName "Acme Supplies" --website https://vendor.example --taxForm ./tax-form.txt --riskTier medium --ndaSigned true --onboardingDate 2026-05-26 --notes "Approved vendor" --approve --json
```

File inputs are summarized as `[file]` in JSON and audit output.

## Procurement approval

Before:

Open the approval modal, enter requester details, department, amount, needed-by date, justification, and urgency before approving a purchase.

After:

```bash
formctl submit procurement-approval --requestorEmail buyer@example.com --department finance --amount 98000 --neededBy 2026-06-01 --justification "Quarterly laptop refresh" --urgent true --dry-run --json
formctl submit procurement-approval --requestorEmail buyer@example.com --department finance --amount 98000 --neededBy 2026-06-01 --justification "Quarterly laptop refresh" --urgent true --approve --json
```

The modal form is still just a recorded workflow with dry-run and approval artifacts.

## CRM update

Before:

Open the CRM, search for the account, set the pipeline stage, update the owner, choose the next contact date, mark priority, and save notes.

After:

```bash
formctl submit crm-update --accountName "Northwind Traders" --stage renewal --ownerEmail ae@example.com --nextContactDate 2026-06-03 --priority true --notes "Renewal risk flagged" --dry-run --json
formctl submit crm-update --accountName "Northwind Traders" --stage renewal --ownerEmail ae@example.com --nextContactDate 2026-06-03 --priority true --notes "Renewal risk flagged" --approve --json
```

This is the shape of a common API-less internal-tool workflow.

## Compliance attestation

Before:

Open the compliance tool, enter the employee, choose a control area, set the attestation date, check the compliant box, and add audit notes.

After:

```bash
formctl submit compliance-attestation --employeeEmail auditor@example.com --controlArea security --attestationDate 2026-06-15 --compliant true --notes "Quarterly access review complete" --dry-run --json
formctl submit compliance-attestation --employeeEmail auditor@example.com --controlArea security --attestationDate 2026-06-15 --compliant true --notes "Quarterly access review complete" --approve --json
```

The run produces `summary.json`, screenshots, and `audit.jsonl` for review.
