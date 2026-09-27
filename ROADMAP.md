# pureinvoicing contribution roadmap

Build something you can see and try in the app. The first five items are **good first contributions**: bounded changes with a concrete demonstration. Choose a feature below, fix a bug, or propose your own improvement.

## Scope

Keep outgoing invoices, one business identity and one ascending number counter. Do not add bookkeeping, tax filing, payment processing or automatic sending.

Size describes scope, not a promised completion time: **Small** = one focused interface change; **Medium** = coordinated interface/state work; **Large** = a feature across several flows, storage or export paths. All items are proposals, not claims that existing features are absent. Check the current code and extend what is there. Maintainers review code and tests before merging. Attribution is your choice.

## Good first contributions

1. **Duplicate a draft invoice line.** Add a duplicate-row control to the draft line editor that copies the selected line immediately below it without issuing or numbering the invoice.
   <!-- contribution: {"id": "line-item-duplicate-action", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/line-item-duplicate-action.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/line-item-duplicate-action.md)

2. **See the currency beside invoice amounts.** Show the currency code alongside ambiguous symbols in list totals and previews, using the invoice's stored currency.
   <!-- contribution: {"id": "currency-code-visibility", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/currency-code-visibility.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/currency-code-visibility.md)

3. **See the payment term in days.** Display the number of days between invoice and due dates beside the date fields and flag a due date earlier than the invoice date.
   <!-- contribution: {"id": "due-date-interval-hint", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/due-date-interval-hint.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/due-date-interval-hint.md)

4. **See how overdue each invoice is.** Extend the existing detail-view overdue-day label to archive rows, using the same calculation so overdue invoices can be compared without opening each one.
   <!-- contribution: {"id": "overdue-age-in-archive-rows", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/overdue-age-in-archive-rows.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/overdue-age-in-archive-rows.md)

5. **See how many invoices match your view.** Show visible row range and total matching invoices next to the existing page-size selector.
   <!-- contribution: {"id": "archive-result-counts", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/archive-result-counts.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/archive-result-counts.md)

## More improvements

6. **Jump straight to an incomplete invoice field.** Make each pre-issue validation message focus the corresponding business, recipient or invoice field so missing details can be corrected quickly.
   <!-- contribution: {"id": "required-field-navigation", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/required-field-navigation.md"} -->
   [Medium · Implementation brief](docs/contributions/required-field-navigation.md)

7. **Edit invoice lines with the keyboard.** Keep Tab navigation predictable across description, quantity, price, discount and tax fields, including after inserting or removing a row.
   <!-- contribution: {"id": "line-item-keyboard-flow", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/line-item-keyboard-flow.md"} -->
   [Medium · Implementation brief](docs/contributions/line-item-keyboard-flow.md)

8. **Correct a price without it becoming zero.** Explain malformed quantity or price input next to the field and retain the draft text instead of silently turning it into zero.
   <!-- contribution: {"id": "decimal-input-feedback", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/decimal-input-feedback.md"} -->
   [Medium · Implementation brief](docs/contributions/decimal-input-feedback.md)

9. **Understand how totals are rounded.** Add a short tooltip explaining the existing rounding rule beside totals, with a concrete example that matches the calculation code.
   <!-- contribution: {"id": "rounding-explanation", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/rounding-explanation.md"} -->
   [Small · Implementation brief](docs/contributions/rounding-explanation.md)

10. **Review payment instructions before issue.** Show inherited payment instructions in the editor before issue so users can confirm what will appear on the PDF.
   <!-- contribution: {"id": "payment-instructions-preview", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/payment-instructions-preview.md"} -->
   [Medium · Implementation brief](docs/contributions/payment-instructions-preview.md)

11. **Preview the next invoice number.** Expand numbering-pattern help with examples of the next label, making clear that previewing does not advance the counter.
   <!-- contribution: {"id": "number-pattern-examples", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/number-pattern-examples.md"} -->
   [Small · Implementation brief](docs/contributions/number-pattern-examples.md)

12. **Check client and total before issuing.** Repeat the client, total and proposed invoice label in the existing issue confirmation so the consequential action is easy to verify.
   <!-- contribution: {"id": "issue-action-summary", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/issue-action-summary.md"} -->
   [Medium · Implementation brief](docs/contributions/issue-action-summary.md)

13. **See which version a correction replaces.** Show the previous and current version labels beside a correction's change note without modifying the original issued version.
   <!-- contribution: {"id": "correction-version-context", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/correction-version-context.md"} -->
   [Medium · Implementation brief](docs/contributions/correction-version-context.md)

14. **Know what marking an invoice sent does.** Clarify next to the manual sent mark that it records a user's action and does not itself send email or prove delivery.
   <!-- contribution: {"id": "sent-status-explanation", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/sent-status-explanation.md"} -->
   [Small · Implementation brief](docs/contributions/sent-status-explanation.md)

15. **Know what marking an invoice paid does.** Clarify next to the manual paid mark that it records payment as reported and does not initiate or verify a bank transaction.
   <!-- contribution: {"id": "paid-status-explanation", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/paid-status-explanation.md"} -->
   [Small · Implementation brief](docs/contributions/paid-status-explanation.md)

16. **Clear invoice filters.** Display active client, status and date filters above invoice results and provide a single clear-filters action.
   <!-- contribution: {"id": "archive-filter-summary", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/archive-filter-summary.md"} -->
   [Medium · Implementation brief](docs/contributions/archive-filter-summary.md)

17. **Read long client names.** Improve wrapping of long client and organisation names in record lists and invoice headers without truncating the saved values.
   <!-- contribution: {"id": "long-client-name-layout", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/long-client-name-layout.md"} -->
   [Small · Implementation brief](docs/contributions/long-client-name-layout.md)

18. **Recognise an unnumbered test invoice.** Make the existing test-invoice view clearly state that it uses no invoice number and saves no issued record.
   <!-- contribution: {"id": "client-test-preview-explanation", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/client-test-preview-explanation.md"} -->
   [Small · Implementation brief](docs/contributions/client-test-preview-explanation.md)

19. **Recover a missing issued PDF.** If an issued invoice lacks its retained PDF, distinguish that state from an unissued draft and point to the existing recovery or reissue action.
   <!-- contribution: {"id": "pdf-recovery-guidance", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/pdf-recovery-guidance.md"} -->
   [Medium · Implementation brief](docs/contributions/pdf-recovery-guidance.md)

20. **Understand why a linked document will not open.** When an attachment cannot be opened, name the file and distinguish a missing file from an unavailable host app while retaining the link.
   <!-- contribution: {"id": "linked-document-failure-detail", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/linked-document-failure-detail.md"} -->
   [Medium · Implementation brief](docs/contributions/linked-document-failure-detail.md)

21. **Preview cash due over the next few weeks.** Add a read-only due-date timeline grouped by week and currency using issued unpaid balances. Selecting a week opens matching invoices; never add totals across different currencies.
   <!-- contribution: {"id": "preview-cash-due-over-the-next-few-weeks", "size": "large", "goodFirstIssue": false, "guide": "docs/contributions/preview-cash-due-over-the-next-few-weeks.md"} -->
   [Large · Implementation brief](docs/contributions/preview-cash-due-over-the-next-few-weeks.md)

## References

- [Contribution brief index](docs/contributions/README.md)
- [App guide](docs/app-guide.md)
- [Development guide](docs/development.md)
- [Contributing](CONTRIBUTING.md)
