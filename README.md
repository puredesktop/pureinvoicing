<p><img src="docs/assets/app-icon.svg" width="88" height="88" alt="pureinvoicing icon"></p>

# pureinvoicing

**Prepare, issue, and track outgoing invoices.** An app for [puredesktop](https://puredesktop.ai).

[Get started](#getting-started) · [App guide](docs/app-guide.md) · [Develop](docs/development.md) · [Developer account](https://puredesktop.ai/developers)

## What it does

An outgoing-invoice workspace for preparing drafts, issuing numbered invoice PDFs, and tracking what was sent and paid. It also connects billing work to clients and agreements.

## Requirements

Use a compatible [puredesktop](https://puredesktop.ai) build for desktop integration, storage, and the app drawer. Developer setup is covered in the [development guide](docs/development.md).

Set up your business identity and invoice numbering before issuing invoices. PDF rendering requires the compatible desktop host.

## Getting started

1. Enter your business details and the customer information needed for the invoice.
2. Create a draft, add line items, and review dates, totals, tax, and payment details.
3. Issue the invoice when ready, then record sending and payment status. Review the rendered PDF before sharing it.

## App layout

| Area | What you use it for |
| --- | --- |
| **Workspace navigation** | Move between the available billing records and work areas. |
| **Record lists** | Find and select invoices, clients, or agreements. |
| **Invoice and record editor** | Enter details, line items, dates, and payment information for the selected record. |
| **Preview and status** | Check the rendered invoice, validation messages, save status, and issuing or payment actions. |

The app also uses the shared [puredesktop](https://puredesktop.ai) shell and drawer agent. Panels can vary with the current view and selection.

## Working with the agent

Open the app’s drawer in [puredesktop](https://puredesktop.ai) and describe what you want to do. For example:

> Find unpaid invoices.
>
> Prepare an invoice draft for this client.

The app exposes 59 tools, including `getWorkspaceState`, `searchInvoices`, `getInvoice`. See [agents.md](agents.md) for workflows and [plugin.json](plugin.json) for the complete tool schemas and approval flags. Some actions apply directly, while approval-marked actions ask first. Check the result in the app after a change.

## Files and data

The app retains issued invoice versions and PDFs, client records, agreements, and sent/paid marks. Bulk import uses the `pure-invoicing/1` JSON format with referenced PDFs.

## Develop and customize

We welcome **developers and vibecoders alike**. Fork pureinvoicing, add a feature, or use what you learn to build a new app.

| Develop your way | Workflow |
| --- | --- |
| **Claude Code, Codex, or your editor** | Open the app’s source folder, read `README.md`, `plugin.json`, `package.json`, and `agents.md`, then make changes and run the app’s checks. Test inside [puredesktop](https://puredesktop.ai) with matching shared platform packages. |
| **purefactory** | Choose **Start building** for a new app, or select an available app project to extend it. Use **Open folder** for external tools and **Open app** to test. |
| **App drawer** | Request a local app change where app-development integration is available. Make clear whether you want to change the app itself or its current document. |

Use **Share** in purefactory to create a `.pureapp` package, then **Settings → System → Install an app → Choose package…** to load it in current builds. Source availability and integration vary by host build.

Follow the [development guide](docs/development.md) for Claude Code/Codex commands, app-specific setup and checks, and packaging. A standalone browser preview does not provide every desktop service.

## Documentation and limitations

| Guide | What it covers |
| --- | --- |
| [App guide](docs/app-guide.md) | App overview, source layout, and usage. |
| [Development guide](docs/development.md) | External coding tools, purefactory, checks, and installation. |
| [Agent guide](agents.md) | App-specific agent workflows and constraints. |
| [Technical reference](docs/technical-reference.md) | Architecture, file formats, detailed controls, and checks. |
| [Bulk import](docs/import-format.md) | Import business, client, and historical invoice records. |

Issued records are retained; corrections create versions rather than silently rewriting an issued invoice. Review the PDF and finalization details before issuing. Payment marks do not automatically post to a ledger.

## Contributing and marketplace

We welcome **developers and vibecoders alike**. Go to [puredesktop.ai](https://puredesktop.ai) and [create a developer account](https://puredesktop.ai/developers) to join the developer community and submit your app for review.

Bring improvements to this app, develop a fork, or build something entirely new. We welcome **open-source and proprietary projects alike** to the [puredesktop](https://puredesktop.ai) marketplace. Support for **paid apps is coming soon**, so you will be able to charge for your apps if you choose. Forks and redistributed dependencies must follow their applicable licenses.

For developer access, app submissions, or marketplace questions, contact [info@puredesktop.ai](mailto:info@puredesktop.ai).

Anyone may use, study, modify, and share this app under its applicable licenses. We welcome pull requests, bug reports, and documentation improvements. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits and license

Prepare, issue, and track invoices in [puredesktop](https://puredesktop.ai).

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
