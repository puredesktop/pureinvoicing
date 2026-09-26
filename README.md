<p><img src="docs/assets/app-icon.svg" width="88" height="88" alt="pureinvoicing icon"></p>

# pureinvoicing

## What pureinvoicing does

An outgoing-invoice workspace for preparing drafts, issuing numbered invoice PDFs, and tracking what was sent and paid. It also connects billing work to clients and agreements.

## App layout

| Area | What you use it for |
| --- | --- |
| **Workspace navigation** | Move between the available billing records and work areas. |
| **Record lists** | Find and select invoices, clients, or agreements. |
| **Invoice and record editor** | Enter details, line items, dates, and payment information for the selected record. |
| **Preview and status** | Check the rendered invoice, validation messages, save status, and issuing or payment actions. |

The app also uses the shared [puredesktop](https://puredesktop.ai) shell and drawer agent. Panels can vary with the current view and selection.

## Getting started

1. Enter your business details and the customer information needed for the invoice.
2. Create a draft, add line items, and review dates, totals, tax, and payment details.
3. Issue the invoice when ready, then record sending and payment status. Review the rendered PDF before sharing it.

Read the [app guide](docs/app-guide.md) for development, loading, and source-layout details.

## Develop and customize

We welcome **developers and vibecoders alike**. You can add features to pureinvoicing, develop a fork, or create a new app for [puredesktop](https://puredesktop.ai).

### Use Claude Code, Codex, or your own tools

Open a local source checkout or a purefactory project's folder in your preferred coding tool. Ask it to read this README, `plugin.json`, `package.json`, `agents.md`, and the [development guide](docs/development.md) before making changes. Review the changes, run the app's checks, and test it inside [puredesktop](https://puredesktop.ai). This source may require matching shared platform packages; a browser preview alone does not provide desktop services.

The [development guide](docs/development.md) explains how to start Claude Code or Codex in the project, work on this repository, and load your app into the desktop.

### Use purefactory inside the desktop

Open **purefactory** (Factory) to describe a new app, or select an available app project and request a feature. Use **Open folder** to continue with external tools and **Open app** to test the result. You can also request a local app change through the app's drawer where app-development integration is available; distinguish changing the app from editing its current document.

Use **Share** in purefactory to create a `.pureapp` package. In current builds, install it through **Settings → System → Install an app → Choose package…**. See the [development guide](docs/development.md#load-and-share-your-app) for the full workflow and version differences.

## Developer accounts and the marketplace

We welcome **developers and vibecoders alike**. Go to [puredesktop.ai](https://puredesktop.ai) and [create a developer account](https://puredesktop.ai/developers) to join the developer community and submit your app for review.

Bring improvements to this app, develop a fork, or build something entirely new. We welcome **open-source and proprietary projects alike** to the [puredesktop](https://puredesktop.ai) marketplace. Support for **paid apps is coming soon**, so you will be able to charge for your apps if you choose. Forks and redistributed dependencies must follow their applicable licenses.

For developer access, app submissions, or marketplace questions, contact [info@puredesktop.ai](mailto:info@puredesktop.ai).

## Open source and contributions

Prepare, issue, and track invoices in [puredesktop](https://puredesktop.ai).

Anyone may use, study, modify, and share this software under the applicable licenses.
We welcome pull requests, bug reports, documentation improvements, and new ideas.
See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute.

### License

Original code by pure.science inc is licensed under the [MIT License](LICENSE).
Copyright (c) 2026 pure.science inc. Third-party code, dependencies, and assets retain their own licenses and copyright notices.

### Major open-source projects

| Project / source | Homepage or documentation | Support the maintainers |
| --- | --- | --- |
| [mozilla/pdf.js](https://github.com/mozilla/pdf.js) | [Homepage / docs](https://mozilla.github.io/pdf.js/) | — |
| [react/react](https://github.com/react/react) | [Homepage / docs](https://react.dev) | — |
| [styled-components/styled-components](https://github.com/styled-components/styled-components) | [Homepage / docs](https://styled-components.com) | [GitHub Sponsors](https://github.com/sponsors/quantizor) · [Open Collective](https://opencollective.com/styled-components) |

Thank you to these projects and their contributors. Additional direct dependencies,
upstream links, and asset notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).


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
