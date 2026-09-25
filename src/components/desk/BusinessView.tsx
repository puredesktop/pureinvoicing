import { AppSettingsPages, useAppSettings } from '@purescience/platform-bridge/components/settings/AppSettings'
import { useState } from 'react'
import type { BusinessSetup } from '../../hooks/useBusinessSetup'
import type { InvoiceProduct } from '../../hooks/useInvoiceProduct'
import { TERMS_PRESETS } from '../../lib/invoices/lifecycle'
import type { InvoiceStore } from '../../lib/invoices/types'
import { AppearanceControls } from './AppearanceControls'
import { PreviewPane } from './PreviewPane'
import { ImportSheet } from './ImportSheet'
import { Icon } from './bits'
import { Desk, Area, Btn, Callout, Chip, Field, Grid, Hint, Input, Mono, Row, Sec, SecHead, Select, Switch } from './deskStyles'


/** Defaults for the next invoice. Nothing drafted or issued changes when these do. */
export function BusinessView({ setup: s, product: p, store, disabled }: { setup: BusinessSetup; product: InvoiceProduct; store: InvoiceStore; disabled: boolean }): React.ReactElement {
  const settings = useAppSettings()
  const [sample, setSample] = useState('')
  const identityDone = !!s.business.name.trim() && !!s.business.address.trim()
  const registered = Object.values(store.invoices).filter(invoice => invoice.historical).length
  return (
    <AppSettingsPages wrap={content => <Desk style={{ height: 'auto', overflow: 'visible' }}>{content}</Desk>} pages={[
      { id: 'business-identity', label: 'Business identity', description: 'Your business details appear on new invoices. Save after editing; issued invoices remain unchanged.' },
      { id: 'business-numbering', label: 'Invoice numbering', description: 'Choose a numbering pattern and verify the next counter against your existing invoices.' },
      { id: 'business-payment', label: 'Payment details', description: 'Set the payment instructions printed on new invoices.' },
      { id: 'business-terms', label: 'Terms', description: 'Choose the default terms offered on new invoices.' },
      { id: 'business-template', label: 'Letterhead & template', description: 'Set the default appearance and preview a sample. Changes apply to future invoices.' },
    ]}>
        <Sec id="business-identity">
          <SecHead><h3>Identity</h3><Chip $tone={identityDone ? 'ok' : 'warn'}>{identityDone ? 'Complete' : 'Needed to issue'}</Chip><span className="sp" /><Btn $acc $sm disabled={disabled || !s.dirtyBusiness} onClick={s.saveBusiness}>Save</Btn></SecHead>
          <Grid><Field><span>Business name</span><Input value={s.business.name} aria-invalid={!s.business.name.trim()} onChange={event => s.editBusiness({ name: event.target.value })} /></Field><Field><span>Email</span><Input type="email" value={s.business.email ?? ''} onChange={event => s.editBusiness({ email: event.target.value })} /></Field></Grid>
          <Field><span>Address</span><Area value={s.business.address} aria-invalid={!s.business.address.trim()} onChange={event => s.editBusiness({ address: event.target.value })} /></Field>
          <Grid $cols="1fr 1fr 1fr"><Field><span>Phone</span><Input value={s.business.phone ?? ''} onChange={event => s.editBusiness({ phone: event.target.value })} /></Field><Field><span>Website</span><Input value={s.business.website ?? ''} onChange={event => s.editBusiness({ website: event.target.value })} /></Field><Field><span>Contact name</span><Input value={s.business.contactName ?? ''} onChange={event => s.editBusiness({ contactName: event.target.value })} /></Field></Grid>
          <Grid><Field><span>Registration identifier</span><Input value={s.business.registrationIdentifier ?? ''} placeholder="optional" onChange={event => s.editBusiness({ registrationIdentifier: event.target.value })} /></Field><Field><span>Tax identifier</span><Input value={s.business.taxIdentifier ?? ''} placeholder="optional" onChange={event => s.editBusiness({ taxIdentifier: event.target.value })} /></Field></Grid>
        </Sec>
        <Sec id="business-numbering">
          <SecHead><h3>Numbering</h3><Chip $tone={store.sequence.verified ? 'ok' : 'warn'}>{store.sequence.verified ? 'Verified' : 'Confirm before issuing'}</Chip></SecHead>
          <Grid $cols="1.4fr 1fr">
            <Field><span>Pattern</span><Input value={s.pattern} aria-invalid={!!s.patternError} style={{ fontFamily: 'var(--d-mono)' }} onChange={event => s.editPattern(event.target.value)} />{s.patternError ? <Hint $err>{s.patternError}</Hint> : <Hint>Reads as <Mono>{s.nextLabel}</Mono>. {'{YYYY}'} is the invoice year, {'{NNN}'} the counter padded to three digits.</Hint>}</Field>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Field><span>Next counter</span><Input inputMode="numeric" value={s.number} aria-invalid={!s.validNumber} onChange={event => s.editNumber(event.target.value)} />{!s.validNumber ? <Hint $err>A whole number of at least {s.nextNumber}.</Hint> : Number(s.number) > s.nextNumber ? <Hint $err>Skips {s.nextNumber}–{Number(s.number) - 1}; the counter never moves back.</Hint> : null}</Field>
              {s.dirtyPattern ? <Btn $sm disabled={disabled || !!s.patternError} onClick={s.savePattern}>Save pattern</Btn> : null}
            </div>
          </Grid>
          <Row><Field style={{ flex: 1 }}><span>Or paste your last invoice number</span><Row><Input value={sample} placeholder="e.g. PS-2026-004" onChange={event => setSample(event.target.value)} /><Btn $sm disabled={!sample.trim()} onClick={() => { if (!s.suggestFrom(sample)) alert('No counter found in that text.') }}>Read pattern</Btn></Row></Field></Row>
          <Callout $tone="info"><Icon.info /><span>{registered ? <><b>{registered} past invoice{registered === 1 ? '' : 's'} registered</b>, so those numbers are checked for conflicts. </> : <><b>No past invoices registered.</b> </>}Anything issued elsewhere and not registered cannot be checked. Confirm the next counter against your own records.</span></Callout>
          {!s.confirmation ? (
            <Row>
              <Switch $on={s.verified}><input type="checkbox" checked={s.verified} disabled={disabled} onChange={event => s.setVerified(event.target.checked)} /><i />I checked my unregistered invoices and this counter is right</Switch>
              <span className="sp" />
              <Btn $acc $sm disabled={disabled || !s.validNumber || !s.verified} onClick={s.requestNumber}>{store.sequence.verified ? 'Move the counter' : 'Confirm counter'}</Btn>
              <Btn $quiet $sm disabled={disabled} onClick={p.openImport}>Import past invoices…</Btn>
            </Row>
          ) : (
            <Callout $tone="warn" role="region" aria-label="Confirm the counter" style={{ alignItems: 'center' }}><Icon.warn /><span><b>Next counter {s.confirmation.to}.</b> {s.confirmation.to > s.confirmation.from ? `Numbers ${s.confirmation.from}–${s.confirmation.to - 1} are skipped for good.` : 'This sets the starting point of the sequence.'}</span><span className="sp" /><Btn $acc $sm disabled={disabled || !s.verified} onClick={s.confirmNumber}>Confirm</Btn><Btn $quiet $sm disabled={s.busy} onClick={s.cancelNumber}>Cancel</Btn></Callout>
          )}
        </Sec>
        <Sec id="business-payment">
          <SecHead><h3>Payment details</h3><Chip $tone={s.business.defaultPaymentInstructions.trim() ? 'ok' : 'neutral'}>{s.business.defaultPaymentInstructions.trim() ? 'On every new invoice' : 'Not set'}</Chip><span className="sp" /><Btn $acc $sm disabled={disabled || !s.dirtyBusiness} onClick={s.saveBusiness}>Save</Btn></SecHead>
          <Field><span>Printed under the totals</span><Area value={s.business.defaultPaymentInstructions} placeholder={'Bank, account name and number, reference to quote, a thank-you'} onChange={event => s.editBusiness({ defaultPaymentInstructions: event.target.value })} /></Field>
        </Sec>
        <Sec id="business-terms">
          <SecHead><h3>Terms</h3><span className="sp" /><Btn $acc $sm disabled={disabled || !s.dirtyBusiness} onClick={s.saveBusiness}>Save</Btn></SecHead>
          <Grid><Field><span>Default terms for new drafts</span><Select value={s.business.defaultTermsDays ?? ''} onChange={event => s.editBusiness({ defaultTermsDays: event.target.value === '' ? undefined : Number(event.target.value) })}><option value="">None (type a due date each time)</option>{TERMS_PRESETS.map(preset => <option key={preset.days} value={preset.days}>{preset.label}</option>)}</Select></Field><div><Hint>A client's own terms win over this. Overdue starts the day after the due date and shows in the archive and on the client.</Hint></div></Grid>
        </Sec>
        <Sec id="business-template">
          <SecHead><h3>Letterhead and template</h3><span className="sp" /><Btn $acc $sm disabled={disabled || !s.dirtyTemplate || s.diagnostics.length > 0} onClick={s.saveTemplate}>Save template</Btn></SecHead>
          <AppearanceControls presentation={s.template} store={store} diagnostics={s.diagnostics} disabled={disabled} onChange={s.editTemplate} onImportLogo={s.importLogo} />
        </Sec>
      <div id="business-template">
        <PreviewPane pages={s.preview?.pages ?? null} diagnostics={s.preview?.diagnostics.filter(d => !d.field.startsWith('pages.')) ?? []} rendering={s.busy && !s.preview} caption="a sample invoice with your details" onRefresh={() => void s.preparePreview()} emptyText={s.diagnostics.length ? 'Fix the appearance problems, then render the sample.' : 'Render a sample page to see the letterhead, type and footer.'} />
        {!s.preview && !s.busy ? <div><Btn $sm disabled={disabled || s.diagnostics.length > 0} onClick={() => void s.preparePreview()}>Render sample page</Btn></div> : null}
      </div>
      <Row><Btn $quiet onClick={() => { settings.close(); p.openAssistant() }}>Ask about this setup</Btn></Row>
      <ImportSheet product={p} disabled={disabled} />
    </AppSettingsPages>
  )
}
