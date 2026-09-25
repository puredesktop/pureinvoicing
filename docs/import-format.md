# Bulk import format: `pure-invoicing/1`

One JSON file brings a business into PureInvoicing: its identity, its
number pattern, its clients, and every invoice it already issued, with the
marks (sent, paid) and the original PDF beside each. The app previews the
whole file, then registers everything in one write. Nothing already in the
archive changes.

```json
{
  "format": "pure-invoicing/1",
  "clients": [],
  "invoices": []
}
```

Fill this structure with your own client and invoice records before importing.
No personal, billing, or payment example records are bundled.

## Fields

| Field | Required | Meaning |
| --- | --- | --- |
| `format` | yes | Exactly `pure-invoicing/1`. |
| `business` | no | Used only when the app's business name and address are still empty. `paymentInstructions` and `termsDays` fill empty defaults. |
| `numberFormat` | no | A pattern with one counter token (`{N}`, `{NNN}`, …) and at most one year token (`{YYYY}`, `{YY}`). Set only when the app has no pattern yet; also used to write labels for rows without `label`. |
| `clients[]` | no | `name` required; `key` lets invoices refer to it. Matched to the directory by name (case-insensitive): an existing client is linked and its empty fields filled; a new one is created. |
| `invoices[]` | yes | At least one. |
| `invoices[].number` | yes | The counter, a positive whole number. Unique in the file and not already in the archive (or skip conflicts). |
| `invoices[].label` | no | What the client saw, e.g. `PS-2026-002`. Kept verbatim. Without it the label is `numberFormat` applied to the counter and the year of `issuedAt`. |
| `invoices[].client` | yes | A `key` from `clients[]`, or an inline `{ "name", "address", "contactName", "email", "phone", "taxIdentifier" }` kept on the invoice only. |
| `invoices[].issuedAt` | yes | ISO date `YYYY-MM-DD`. |
| `invoices[].dueAt` / `termsDays` | no | A due date, or terms in days after `issuedAt` (the client's `termsDays` is the fallback). |
| `invoices[].currency` | no | ISO 4217; defaults to the client's, then USD. |
| `invoices[].lines[]` | yes | `description` and `unitPrice` required; `quantity` defaults to 1; `discountPercent`, `taxPercent` optional. Tax applies after the line discount. |
| `invoices[].notes`, `paymentInstructions` | no | Printed under the totals. Payment instructions default to the business default. |
| `invoices[].sentAt`, `sentTo`, `paidAt`, `paidReference` | no | Marks. `paidAt` makes the invoice paid; otherwise `sentAt` makes it sent; a past `dueAt` without `paidAt` shows overdue. |
| `invoices[].pdf` | no | Path relative to the JSON file. Retained as the unverified original; the app produces no PDF for imported invoices. |
| `invoices[].total` | no | A stated total. The app computes from the lines and warns when they differ. |

## What the import does

1. Reads the file and lists every problem by path (`invoices[3].lines[0]`).
2. Plans each row: the label it gets, the client it links or creates, the computed total, its standing, whether its counter already exists.
3. On confirmation, retains the PDFs, then in one guarded write: fills empty business fields, sets the pattern if none, creates or links clients, registers each invoice as historical with its counter, label, marks and original PDF, and moves the counter past the highest number.

Invoices are immutable once registered. Re-importing the same file skips
the counters already in the archive when asked, and refuses otherwise.

## From the drawer

The assistant has the same two steps: `previewInvoiceImport` (read) and
`importInvoices` (approval), each taking `source: { "path" }` for a file or
`source: { "document" }` for a document it assembled itself, for example
from a folder of old PDFs. It must show the preview and get approval before
importing.
