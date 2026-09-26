# pureinvoicing technical reference

[Back to the README](../README.md) · [Development guide](development.md)

Outgoing invoices for [puredesktop](https://puredesktop.ai): prepare them, issue them as numbered
PDFs, and keep track of what was sent and paid. One business identity,
one ascending counter written through a pattern such as `PS-{YYYY}-{NNN}`,
a client directory, retained issued versions, same-number corrections, and
marks the person sets (sent, paid); overdue follows from the due date.

Identity: manifest `id` and `app.slug` are both `invoicing` (the shell keys tabs, settings and storage by one value); the folder and repo are `pureinvoicing`.

## Start

```bash
npm install
npm run dev
```

`plugin.json` declares `http://localhost:5490` as the preferred development
port. Inside the suite, `npm run dev:suite` starts it with the shell; opened
directly, the Vite page keeps its workspace in `localStorage` so the UI can
be worked on without the shell (page rendering and PDFs still need it).

## Check and build

```bash
npm run typecheck
npm test
npm run build
npm run puredesktop:check
```

The tests are deterministic node scripts against the production domain:
`tests/invoice-domain.mjs` (money, patterns, terms, marks, archive,
guarded saves), `tests/invoice-finalization.mjs` (confirmation tokens,
competing commits, corrections, historical registration, the issue sheet
and the issued view), `tests/invoice-rendering.mjs` (pagination, PDF
agreement, retained assets).

## Project layout

- `plugin.json`: identity, permissions, entrypoint, agent tool schemas.
- `agents.md`: the in-app assistant's instructions.
- `src/App.tsx`: bridge gate, boot gate, then `AppShell` inside `AppFrame`.
- `src/bridge/platformBridge.ts`: every bridge call, wrapped once.
- `src/lib/invoices/`: the domain. `types`, `parse` (validation and the
  immutability rules), `updates`, `queries`, `calculations` (exact decimal
  money), `numbering` (patterns and labels), `lifecycle` (terms, marks,
  standing), `stats`, `finalization` (tokens and publication), `rendering`
  and `presentation` (the retained document), `repository` (guarded CAS
  saves and conflict merge).
- `src/components/desk/`: the UI. `DeskShell` routes places; `ArchiveView`,
  `EditorView` (+ `LinesEditor`, `ClientPicker`, `IssueSheet`,
  `AppearanceControls`, `PreviewPane`), `IssuedView`, `ClientsView`,
  `BusinessView`, `FirstUse`; `deskStyles` binds every colour and measure to
  the shell's tokens.
- `src/agents/`: tool catalog, schemas (regenerated from `plugin.json`) and
  handlers.

## Bulk import

A `pure-invoicing/1` JSON file brings in a business, its number pattern,
its clients and every invoice it already issued, with sent and paid marks
and the original PDFs beside it. See `docs/import-format.md` and
`docs/examples/pure-invoicing-import.json`. In the app: Invoices →
"Import invoices…" (or the first-use card); from the drawer:
`previewInvoiceImport` then `importInvoices`.

## Core rules

- The counter is the sequence. A label is the counter through the pattern of
  the day, frozen on each issued invoice; changing the pattern never rewrites
  a label already given.
- Issued means finalised here. Sent and paid are marks the person (or the
  agent, with approval) sets; nothing is inferred and nothing is posted to a
  ledger. Overdue is computed from the due date.
- Terms drive the due date until a custom date is typed.
- Issued numbers, retained versions and retained files are immutable. A
  correction adds a version under the same number with a change note.
- Every capability ships twice: a control in the UI and a drawer tool over
  the same code path. Apps never call models; the drawer does the thinking.
