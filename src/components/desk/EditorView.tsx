import { useEffect, useState } from 'react'
import type { ClientDirectory } from '../../hooks/useClientDirectory'
import type { InvoiceProduct } from '../../hooks/useInvoiceProduct'
import { calculateInvoice } from '../../lib/invoices/calculations'
import { supportedCurrencies } from '../../lib/invoices/defaults'
import { TERMS_PRESETS, termsLabel } from '../../lib/invoices/lifecycle'
import { formatAmount, formatMoney, isZeroMoney } from '../../lib/invoices/money'
import type { Diagnostic, InvoiceStore } from '../../lib/invoices/types'
import { AppearanceControls } from './AppearanceControls'
import { ClientPicker } from './ClientPicker'
import { IssueSheet } from './IssueSheet'
import { LinesEditor } from './LinesEditor'
import { PreviewPane } from './PreviewPane'
import { EmailsInput } from './EmailsInput'
import { PeopleLookupInput } from './PeopleLookupInput'
import { Icon, Money } from './bits'
import { Area, Body, Btn, Callout, Chip, Dot, Field, Grid, Hint, Input, Main, Meta, Mono, Panel, Sec, SecHead, Select, Switch, TopBar } from './deskStyles'

const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'NZD', 'AUD', 'CAD', 'CHF', 'JPY', 'SEK', 'NOK', 'DKK', 'INR', 'SGD', 'HKD', 'ZAR', 'BRL', 'MXN']

/** A draft or a correction: the structured editor on the left, the pages as they will print on the right. */
export function EditorView({ product: p, directory: d, store, disabled }: { product: InvoiceProduct; directory: ClientDirectory; store: InvoiceStore; disabled: boolean }): React.ReactElement | null {
  const [picker, setPicker] = useState<DOMRect | null>(null)
  const [appearance, setAppearance] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [historical, setHistorical] = useState(p.registering)
  const [originalNumber, setOriginalNumber] = useState('')
  const [changeNote, setChangeNote] = useState('')
  useEffect(() => { if (p.registering) setHistorical(true) }, [p.registering])
  const selected = p.selected, content = p.content
  if (!selected || !content) return null
  const correction = !!selected.correctionOf
  const calculation = calculateInvoice(content, selected.currencyReviewRequired)
  const diagnostics = calculation.diagnostics
  const problem = (field: string): Diagnostic | undefined => diagnostics.find(candidate => candidate.field === field)
  const linkedClient = content.clientId ? store.clients[content.clientId] : undefined
  const previousForClient = Object.values(store.invoices)
    .filter(invoice => invoice.id !== selected.correctionOf && (content.clientId ? invoice.versions[invoice.versions.length - 1].content.clientId === content.clientId : invoice.versions[invoice.versions.length - 1].content.recipient.name.trim().toLocaleLowerCase() === content.recipient.name.trim().toLocaleLowerCase() && !!content.recipient.name.trim()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  const reuseFrom = previousForClient ? { label: p.labelFor(previousForClient.id) ?? '', lines: previousForClient.versions[previousForClient.versions.length - 1].content.lineItems } : null
  const currencies = [...COMMON_CURRENCIES, ...(content.currency && !COMMON_CURRENCIES.includes(content.currency) ? [content.currency] : [])]
  const primary = () => p.preparePublication(correction ? { kind: 'publishCorrection', changeNote } : historical ? { kind: 'registerHistorical', originalNumber: Number(originalNumber) } : { kind: 'issue' })
  const primaryLabel = correction ? 'Publish correction…' : historical ? 'Register…' : 'Issue…'
  const primaryBlocked = disabled || (correction && !changeNote.trim()) || (historical && !/^\d+$/.test(originalNumber))
  const quickFix = (diagnostic: Diagnostic) => {
    if (diagnostic.field === 'presentation.footerText') return { label: 'Fix: footer to 8 pt', apply: () => p.editPresentation({ footerTextSizePt: 8 }) }
    if (diagnostic.field === 'presentation.marginsMm.top') return { label: 'Fix: top margin 12 mm', apply: () => p.editPresentation({ marginsMm: { ...content.presentation.marginsMm, top: 12 } }) }
    if (diagnostic.field.startsWith('presentation.marginsMm')) return { label: 'Fix: margins 18 mm', apply: () => p.editPresentation({ marginsMm: { top: 18, right: 18, bottom: 18, left: 18 } }) }
    if (diagnostic.field === 'currency' && selected.currencyReviewRequired) return { label: 'I reviewed all prices', apply: () => void p.acknowledgeCurrency() }
    return null
  }
  const previewDiagnostics = [...(p.preview?.diagnostics.filter(candidate => !candidate.field.startsWith('pages.')) ?? []), ...calculation.warnings]
  return (
    <>
      <TopBar as="div" style={{ height: 44, borderTop: '1px solid var(--d-line)', background: 'transparent', backdropFilter: 'none' }}>
        <Mono style={{ fontSize: 14, fontWeight: 500 }}>{historical && originalNumber ? `#${originalNumber}` : p.label}</Mono>
        <Chip $tone={correction ? 'warn' : historical ? 'info' : 'neutral'}>{correction ? 'Correction · same number, new version' : historical ? 'Registering a past invoice' : 'Draft · number assigned when issued'}</Chip>
        {selected.source && !correction ? <Hint>copied from {p.labelFor(selected.source.invoiceId) ?? 'a draft'}</Hint> : null}
        <span style={{ flex: 1 }} />
        <Meta style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Dot $color={p.dirty ? 'var(--d-warn-ink)' : 'var(--d-ok-ink)'} />{p.dirty ? 'Saving…' : 'Saved'}</Meta>
        <Btn onClick={() => setAppearance(open => !open)} aria-pressed={appearance}>Appearance</Btn>
        {correction ? <Btn disabled={disabled} onClick={() => p.download({ kind: 'downloadVersion' })} title="The PDF as issued, unchanged by this correction">Issued PDF</Btn> : null}
        <Btn $acc disabled={primaryBlocked} onClick={primary}>{primaryLabel}</Btn>
      </TopBar>
      <Body style={{ position: 'relative' }}>
        <Panel $strong style={{ flex: '0 0 700px', overflow: 'auto' }}>
          <Sec>
            <SecHead><h3>Bill to</h3>{linkedClient ? <Chip $tone="acc">From directory · {linkedClient.name}</Chip> : null}<span className="sp" />
              <Btn $quiet $sm disabled={disabled} onClick={event => setPicker(event.currentTarget.getBoundingClientRect())}>{linkedClient ? 'Change client' : 'Choose a client'}</Btn>
              {content.recipient.name.trim() ? <Btn $quiet $sm disabled={disabled || !!d.editor} onClick={() => d.saveRecipient(content.recipient, linkedClient?.id)} title={linkedClient ? 'Update the directory record with these details' : 'Save these details as a client'}>{linkedClient ? 'Update directory' : 'Save as client'}</Btn> : null}
            </SecHead>
            <Grid>
              <Field><span>Client organisation</span><PeopleLookupInput kind="org" value={content.recipient.name} invalid={!!problem('recipient.name')} placeholder="Name or PurePeople organisation" onChange={name => p.editDraft({ recipient: { name } })} onPick={org => p.editDraft({ recipient: { name: org.name, phone: content.recipient.phone || org.phone } })} />{problem('recipient.name') ? <Hint $err>{problem('recipient.name')!.message}</Hint> : null}</Field>
              <Field><span>Attention</span><PeopleLookupInput kind="person" value={content.recipient.contactName ?? ''} placeholder="Name or PurePeople contact" onChange={contactName => p.editDraft({ recipient: { contactName } })} onPick={person => p.editDraft({ recipient: { contactName: person.name, email: content.recipient.email || person.email, phone: content.recipient.phone || person.phone, name: content.recipient.name.trim() || person.organization || content.recipient.name } })} /></Field>
            </Grid>
            <Grid $cols="1.4fr 1fr">
              <Field><span>Billing address</span><Area value={content.recipient.address} aria-invalid={!!problem('recipient.address')} placeholder={'Street\nCity, region, postcode'} onChange={event => p.editDraft({ recipient: { address: event.target.value } })} />{problem('recipient.address') ? <Hint $err>{problem('recipient.address')!.message}</Hint> : null}</Field>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field as="div"><span>Email</span><EmailsInput value={content.recipient.email} onChange={email => p.editDraft({ recipient: { email } })} onPickPerson={person => p.editDraft({ recipient: { contactName: content.recipient.contactName?.trim() ? content.recipient.contactName : person.name, phone: content.recipient.phone || person.phone, name: content.recipient.name.trim() || person.organization || content.recipient.name } })} /></Field>
                <Field><span>Tax identifier</span><Input value={content.recipient.taxIdentifier ?? ''} placeholder="optional" onChange={event => p.editDraft({ recipient: { taxIdentifier: event.target.value } })} /></Field>
              </div>
            </Grid>
            {linkedClient ? <Hint>Edits here stay on this invoice. Update the directory if the details have changed for good.</Hint> : null}
          </Sec>
          <Sec>
            <SecHead><h3>Dates and terms</h3></SecHead>
            <Grid $cols="1fr 1fr 1fr 1fr">
              <Field><span>Invoice date</span><Input type="date" value={content.invoiceDate ?? ''} aria-invalid={!!problem('invoiceDate')} onChange={event => p.editDraft({ invoiceDate: event.target.value || null })} /></Field>
              <Field><span>Terms</span><Select value={content.termsDays === null || content.termsDays === undefined ? 'custom' : String(content.termsDays)} onChange={event => p.editDraft({ termsDays: event.target.value === 'custom' ? null : Number(event.target.value) })}>{TERMS_PRESETS.map(preset => <option key={preset.days} value={preset.days}>{preset.label}</option>)}{content.termsDays !== null && content.termsDays !== undefined && !TERMS_PRESETS.some(preset => preset.days === content.termsDays) ? <option value={content.termsDays}>{termsLabel(content.termsDays)}</option> : null}<option value="custom">Custom date</option></Select></Field>
              <Field><span>Due date</span><Input type="date" value={content.dueDate ?? ''} aria-invalid={!!problem('dueDate')} onChange={event => p.editDraft({ dueDate: event.target.value || null })} />{problem('dueDate') ? <Hint $err>{problem('dueDate')!.message}</Hint> : <Hint>{content.termsDays !== null && content.termsDays !== undefined ? 'from the terms · type to override' : 'custom'}</Hint>}</Field>
              <Field><span>Currency</span><Select value={content.currency ?? ''} aria-invalid={!!problem('currency')} onChange={event => p.editDraft({ currency: event.target.value || null })}><option value="">Choose</option>{currencies.map(code => <option key={code} value={code}>{code}</option>)}<option value="__more">More…</option></Select></Field>
            </Grid>
            {content.currency === '__more' ? <Field><span>Currency code</span><Input list="all-currencies" placeholder="ISO 4217, e.g. PLN" onChange={event => { if (supportedCurrencies.includes(event.target.value.toUpperCase())) p.editDraft({ currency: event.target.value.toUpperCase() }) }} /><datalist id="all-currencies">{supportedCurrencies.map(code => <option key={code} value={code} />)}</datalist></Field> : null}
            {selected.currencyReviewRequired ? <Callout $tone="warn" style={{ alignItems: 'center' }}><Icon.warn /><span><b>Currency changed without conversion.</b> Review every rate before issuing.</span><span className="sp" /><Btn $sm disabled={disabled} onClick={p.acknowledgeCurrency}>I reviewed all prices</Btn></Callout> : null}
            <Field><span>Reference</span><Input value={content.reference} placeholder="Agreement, PO or statement of work" onChange={event => p.editDraft({ reference: event.target.value })} /></Field>
            {!correction ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <Switch $on={historical}><input type="checkbox" checked={historical} disabled={disabled} onChange={event => { setHistorical(event.target.checked); p.cancelPublication() }} /><i />This is an invoice I issued before</Switch>
                {historical ? <>
                  <Field style={{ width: 180 }}><span>Original number (counter)</span><Input inputMode="numeric" value={originalNumber} placeholder="e.g. 4" onChange={event => { setOriginalNumber(event.target.value.replace(/\D/g, '')); p.cancelPublication() }} /></Field>
                  <Btn $sm disabled={disabled} onClick={p.importHistoricalPdf}>{p.historicalAsset ? 'Replace original PDF' : 'Attach original PDF'}</Btn>
                  {p.historicalAsset ? <><Hint>{p.historicalAsset.name}</Hint><Btn $quiet $sm disabled={disabled} onClick={p.removeHistoricalPdf}>Remove reference</Btn></> : <Hint>optional, kept as an unverified reference</Hint>}
                </> : null}
              </div>
            ) : (
              <Field><span>Change note (goes in the history)</span><Input value={changeNote} placeholder="What changed and why" onChange={event => { setChangeNote(event.target.value); p.cancelPublication() }} /></Field>
            )}
          </Sec>
          <Sec>
            <LinesEditor product={p} reuseFrom={reuseFrom} />
          </Sec>
          <Sec style={{ background: 'color-mix(in srgb, var(--d-paper) 45%, transparent)' }}>
            <Grid $cols="1fr 250px" style={{ gap: 18, alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Field><span>Note to client</span><Input value={content.notes} placeholder="Printed under the totals" onChange={event => p.editDraft({ notes: event.target.value })} /></Field>
                <Field><span>Payment instructions</span><Area style={{ minHeight: 48, fontSize: 12 }} value={content.paymentInstructions} onChange={event => p.editDraft({ paymentInstructions: event.target.value })} /><Hint>From Business defaults. Change it here for this invoice only.</Hint></Field>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><Meta>Subtotal</Meta><Mono>{formatAmount(calculation.subtotal, content.currency)}</Mono></div>
                {!isZeroMoney(calculation.totalDiscount) ? <div style={{ display: 'flex', justifyContent: 'space-between' }}><Meta>Discounts</Meta><Mono>−{formatAmount(calculation.totalDiscount, content.currency)}</Mono></div> : null}
                {calculation.taxBreakdown.filter(tax => tax.rate > 0).map(tax => <div key={tax.rate} style={{ display: 'flex', justifyContent: 'space-between' }}><Meta>Tax {tax.rate}%</Meta><Mono>{formatAmount(tax.amount, content.currency)}</Mono></div>)}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 6, borderTop: '1px solid var(--d-line)' }}><span style={{ fontWeight: 600 }}>Total due</span><Mono style={{ fontSize: 20, fontWeight: 600 }}>{formatMoney(calculation.total, content.currency)}</Mono></div>
                <Hint style={{ textAlign: 'right' }}>{content.currency ?? 'no currency'} · {calculation.complete ? 'totals sum the rounded line amounts' : 'incomplete lines are left out'}</Hint>
              </div>
            </Grid>
          </Sec>
          <Sec>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Btn $quiet $sm $danger disabled={disabled} onClick={() => setDeleting(true)}>{correction ? 'Discard correction' : 'Delete draft'}</Btn>
              <span style={{ flex: 1 }} />
              {p.selected.source ? <Btn $quiet $sm onClick={() => p.openInvoice(p.selected!.source!.invoiceId, undefined, p.selected!.source!.versionId)}>Open the source</Btn> : null}
            </div>
            {deleting ? <Callout $tone="bad" role="alertdialog" style={{ alignItems: 'center' }}><Icon.warn /><span>{correction ? 'Discard only these unpublished changes? The issued invoice and its versions stay.' : `Delete this draft for ${content.recipient.name || 'an unnamed client'}? This cannot be undone.`}</span><span className="sp" /><Btn $sm $danger disabled={disabled} onClick={p.deleteDraft}>{correction ? 'Discard' : 'Delete'}</Btn><Btn $quiet $sm onClick={() => setDeleting(false)}>Keep</Btn></Callout> : null}
          </Sec>
        </Panel>
        <Main>
          {appearance ? (
            <Panel $strong style={{ flex: '1 1 auto', overflow: 'auto', padding: '16px 18px', gap: 12 }}>
              <SecHead><h3>Appearance</h3><span className="sp" /><Btn $sm disabled={disabled || p.presentationDiagnostics.length > 0} onClick={p.saveAppearanceDefault}>Save as default</Btn><Btn $quiet $sm onClick={() => setAppearance(false)}>Done</Btn></SecHead>
              <AppearanceControls invoiceLocal presentation={content.presentation} store={store} diagnostics={p.presentationDiagnostics} disabled={disabled} onChange={p.editPresentation} onImportLogo={p.importDraftLogo} />
            </Panel>
          ) : (
            <PreviewPane pages={p.preview?.pages ?? null} diagnostics={previewDiagnostics} rendering={!p.preview} caption={p.dirty ? 'catching up with your edits' : 'current as of your last edit'} quickFix={quickFix} onOpenAppearance={() => setAppearance(true)} onRefresh={p.preparePreview} emptyText="The pages appear here once the draft has a client and a line." />
          )}
        </Main>
        {picker ? <ClientPicker directory={d} anchor={picker} onClose={() => setPicker(null)} onPick={client => { setPicker(null); void p.applyClient(client.id) }} /> : null}
        <IssueSheet product={p} disabled={disabled} />
      </Body>
      {d.editor ? (
        <div style={{ position: 'absolute', inset: 0, zIndex: 45, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--platform-colors-text) 22%, transparent)' }}>
          <Panel $strong style={{ width: 480, padding: '18px 20px', gap: 12 }}>
            <SecHead><h3>{d.editor.clientId ? 'Update directory record' : 'Save as a client'}</h3><span className="sp" /><Btn $quiet $sm onClick={d.cancel}>Cancel</Btn></SecHead>
            <Field><span>Client organisation</span><PeopleLookupInput kind="org" value={d.editor.details.name} invalid={!d.editor.details.name.trim()} placeholder="Name or PurePeople organisation" onChange={name => d.change({ name })} onPick={org => d.change({ name: org.name, phone: d.editor!.details.phone || org.phone })} /></Field>
            <Field><span>Billing address</span><Area value={d.editor.details.billingAddress} onChange={event => d.change({ billingAddress: event.target.value })} /></Field>
            <Grid $cols="1fr 1fr 1fr"><Field><span>Contact person</span><PeopleLookupInput kind="person" value={d.editor.details.contactName ?? ''} placeholder="Name or PurePeople contact" onChange={contactName => d.change({ contactName })} onPick={person => d.change({ contactName: person.name, email: d.editor!.details.email || person.email, phone: d.editor!.details.phone || person.phone, name: d.editor!.details.name.trim() || person.organization || d.editor!.details.name })} /></Field><Field as="div"><span>Email</span><EmailsInput value={d.editor.details.email} onChange={email => d.change({ email })} onPickPerson={person => d.change({ contactName: d.editor!.details.contactName || person.name, phone: d.editor!.details.phone || person.phone, name: d.editor!.details.name.trim() || person.organization || d.editor!.details.name })} /></Field><Field><span>Terms</span><Select value={d.editor.details.termsDays ?? ''} onChange={event => d.change({ termsDays: event.target.value === '' ? undefined : Number(event.target.value) })}><option value="">Business default</option>{TERMS_PRESETS.map(preset => <option key={preset.days} value={preset.days}>{preset.label}</option>)}</Select></Field></Grid>
            {d.error ? <Hint $err>{d.error}</Hint> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Btn $acc disabled={d.busy || !d.editor.details.name.trim()} onClick={d.save}>{d.editor.clientId ? 'Update record' : 'Save client'}</Btn></div>
          </Panel>
        </div>
      ) : null}
    </>
  )
}
