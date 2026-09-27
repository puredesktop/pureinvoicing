# pureinvoicing roadmap

## Scope

Keep outgoing invoices, one business identity and one ascending number counter. Do not add bookkeeping, tax filing, payment processing or automatic sending.

These are proposed, incremental improvements, not a release schedule or a list of missing core features. Keep each change small and preserve existing file formats, user data and app workflows.

## Improvements

1. **Required-field navigation.** Make each pre-issue validation message focus the corresponding business, recipient or invoice field so missing details can be corrected quickly.

2. **Line item duplicate action.** Add a duplicate-row control to the draft line editor that copies the selected line immediately below it without issuing or numbering the invoice.

3. **Line item keyboard flow.** Keep Tab navigation predictable across description, quantity, price, discount and tax fields, including after inserting or removing a row.

4. **Decimal input feedback.** Explain malformed quantity or price input next to the field and retain the draft text instead of silently turning it into zero.

5. **Rounding explanation.** Add a short tooltip explaining the existing rounding rule beside totals, with a concrete example that matches the calculation code.

6. **Currency code visibility.** Show the currency code alongside ambiguous symbols in list totals and previews, using the invoice's stored currency.

7. **Due-date interval hint.** Display the number of days between invoice and due dates beside the date fields and flag a due date earlier than the invoice date.

8. **Payment instructions preview.** Show inherited payment instructions in the editor before issue so users can confirm what will appear on the PDF.

9. **Number pattern examples.** Expand numbering-pattern help with examples of the next label, making clear that previewing does not advance the counter.

10. **Issue action summary.** Repeat the client, total and proposed invoice label in the existing issue confirmation so the consequential action is easy to verify.

11. **Correction version context.** Show the previous and current version labels beside a correction's change note without modifying the original issued version.

12. **Sent status explanation.** Clarify next to the manual sent mark that it records a user's action and does not itself send email or prove delivery.

13. **Paid status explanation.** Clarify next to the manual paid mark that it records payment as reported and does not initiate or verify a bank transaction.

14. **Overdue age in archive rows.** Extend the existing detail-view overdue-day label to archive rows, using the same calculation so overdue invoices can be compared without opening each one.

15. **Archive filter summary.** Display active client, status and date filters above invoice results and provide a single clear-filters action.

16. **Archive result counts.** Show visible row range and total matching invoices next to the existing page-size selector.

17. **Long client name layout.** Improve wrapping of long client and organisation names in record lists and invoice headers without truncating the saved values.

18. **Client test preview explanation.** Make the existing test-invoice view clearly state that it uses no invoice number and saves no issued record.

19. **PDF recovery guidance.** If an issued invoice lacks its retained PDF, distinguish that state from an unissued draft and point to the existing recovery or reissue action.

20. **Linked document failure detail.** When an attachment cannot be opened, name the file and distinguish a missing file from an unavailable host app while retaining the link.

## References

- [App guide](docs/app-guide.md)
- [Development guide](docs/development.md)
- [Current implementation](src/components/desk/EditorView.tsx)
