# Invoice rendering boundary

`invoiceCommands` is the shared UI/assistant surface. Native imports retain a verified binary copy and append an immutable asset record to the invoice repository. The SHA-256 digest is checked on reads. Retained HTML embeds all logo and font bytes. Changing a template or historical reference never deletes assets.

`renderInvoice` paginates the retained HTML with `preparePagedPreview`, captures every page with `capturePagedSnapshot`, and requires overflow and overlap metrics. It compares source text to paginated text, then compares PDF page count and text for each page to the preview. `renderPrintHtml` always uses Paged.js. Unsupported font characters, invalid appearance, failed asset reads, missing diagnostics, content loss, and pagination mismatches block output. No browser print path is used.

Documents are indexed by a digest of invoice content and the exact number. Existing documents always reuse their retained HTML, even if app templates or bundled fonts later change. PDF metadata lives outside immutable invoice versions. Missing PDFs can be regenerated from the original retained HTML without assigning numbers or changing issued content. Exports use a unique child folder under the native folder selection, preserving existing files.

The issuance task must call `requirePrintableInvoice(repository, exactContent, approvedNumber, currencyReviewRequired)` before committing its approved version. This task supplies that blocking gate; it does not implement the separate confirmation-token or number-assignment workflow.

Verification:

- `node tests/invoice-rendering.mjs` exercises three-page pipeline agreement and rejects mismatched PDFs, missing metrics, overflow, unreadable assets, and removal of retained assets using deterministic bridge fixtures.
- `node tests/invoice-domain.mjs` covers persisted domain regression and assistant schemas.
- Host verification must exercise real Paged.js geometry: use at least 80 items, a description longer than a page, multiline letterhead/footer, all three font styles, both page sizes, and a retained logo. Inspect every page, then export the same version and compare page count, content, and appearance. Delete or corrupt a retained asset to verify diagnostics; cancel export and repeat export into the same folder to verify cancellation and non-overwrite behavior. The deterministic tests do not claim a real host visual review.
