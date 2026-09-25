import { useEffect, useState } from 'react'
import type { InvoiceProduct } from '../../../hooks/useInvoiceProduct'
import { KIND_LABEL, billCheck } from '../../../lib/invoices/agreements'
import { invoiceCommands } from '../../../lib/invoices/workspace'
import type { Contractor, InvoiceStore } from '../../../lib/invoices/types'
import { DocumentsList } from '../Annotations'
import { EmailsInput } from '../EmailsInput'
import { Icon, hueOf, initials } from '../bits'
import { Area, Avatar, Body, Btn, Card, Field, Hint, Input, Meta, Mono, Panel, SearchBox, Sec, SecHead, Stat } from '../deskStyles'
import { AgreementStatusChip, money } from './agreementBits'
import { NewAgreementSheet, type NewAgreementPreset } from './NewAgreementSheet'

type Details = Omit<Contractor, 'id' | 'updatedAt' | 'documents'>

/** People and firms who work for Pure Science: their details, their agreements, and what they have billed. */
export function ContractorsView({ product: p, store, disabled }: { product: InvoiceProduct; store: InvoiceStore; disabled: boolean }): React.ReactElement {
  const contractors = Object.values(store.contractors ?? {}).sort((a, b) => a.name.localeCompare(b.name))
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<{ id: string | null; details: Details } | null>(null)
  const [creating, setCreating] = useState<NewAgreementPreset | null>(null)
  const selectedId = p.selectedContractorId && store.contractors?.[p.selectedContractorId] ? p.selectedContractorId : contractors[0]?.id ?? null
  const contractor = selectedId ? store.contractors![selectedId] : null
  useEffect(() => { if (editing?.id && editing.id !== selectedId) setEditing(null) }, [selectedId])
  const needle = query.trim().toLocaleLowerCase()
  const visible = needle ? contractors.filter(c => [c.name, c.email ?? '', c.contactName ?? ''].some(v => v.toLocaleLowerCase().includes(needle))) : contractors
  const agreementsOf = (id: string) => Object.values(store.agreements ?? {}).filter(a => a.contractorId === id)
  const save = () => {
    if (!editing) return
    void p.act(async () => {
      const result = await invoiceCommands.saveContractor({ ...(editing.id ? { contractorId: editing.id } : {}), details: editing.details })
      setEditing(null)
      if (!editing.id) await p.openContractor(result.contractor.id)
    }, editing.id ? 'Contractor saved.' : 'Contractor added.')
  }
  const agreements = contractor ? agreementsOf(contractor.id) : []
  const bills = agreements.flatMap(a => a.bills.map(b => ({ ...b, agreement: a, check: billCheck(a, b) }))).sort((x, y) => y.period.localeCompare(x.period))
  const currency = agreements[0]?.currency ?? contractor?.currency ?? 'USD'
  const billed = bills.reduce((sum, b) => sum + b.amount, 0), unpaid = bills.filter(b => !b.paidAt).reduce((sum, b) => sum + b.amount, 0)
  return (
    <Body style={{ gap: 14, padding: '14px 18px 18px' }}>
      <Panel style={{ flex: '0 0 360px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 12px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <SearchBox style={{ minWidth: 0, flex: 1 }}><Icon.search /><input aria-label="Search contractors" placeholder="Search contractors" value={query} onChange={event => setQuery(event.target.value)} /></SearchBox>
          <Btn $acc $sm disabled={disabled || !!editing} onClick={() => setEditing({ id: null, details: { name: '' } })}><Icon.plus />Contractor</Btn>
        </div>
        <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: '0 10px 10px' }}>
          {visible.map(c => {
            const theirs = agreementsOf(c.id), active = theirs.filter(a => a.status === 'signed').length
            return (
              <Card key={c.id} role="button" tabIndex={0} onClick={() => p.openContractor(c.id)} onKeyDown={event => { if (event.key === 'Enter') void p.openContractor(c.id) }} style={{ padding: '10px 12px', display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', ...(c.id === selectedId ? { borderColor: 'var(--d-acc)', boxShadow: '0 0 0 3px var(--d-acc-soft)' } : {}) }}>
                <Avatar $hue={hueOf(c.name)} $size={32}>{initials(c.name)}</Avatar>
                <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div><Hint>{theirs.length ? `${theirs.length} agreement${theirs.length === 1 ? '' : 's'}${active ? ` · ${active} active` : ''}` : 'No agreement yet'}</Hint></div>
              </Card>
            )
          })}
          {!visible.length ? <Meta style={{ padding: '10px 4px' }}>{needle ? 'Nothing matches.' : 'No contractors yet. Add the people and firms who work for you, then draft their agreement.'}</Meta> : null}
        </div>
      </Panel>
      <Panel $strong style={{ flex: '1 1 auto', overflow: 'auto' }}>
        {editing ? (
          <Sec>
            <SecHead><h3>{editing.id ? 'Edit contractor' : 'New contractor'}</h3><span className="sp" /><Btn $quiet $sm onClick={() => setEditing(null)}>Cancel</Btn><Btn $acc $sm disabled={disabled || !editing.details.name.trim()} onClick={save}>{editing.id ? 'Save' : 'Add contractor'}</Btn></SecHead>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, maxWidth: 720 }}>
              <Field><span>Name</span><Input autoFocus value={editing.details.name} placeholder="Person or firm" onChange={event => setEditing({ ...editing, details: { ...editing.details, name: event.target.value } })} /></Field>
              <Field><span>Contact</span><Input value={editing.details.contactName ?? ''} placeholder="optional" onChange={event => setEditing({ ...editing, details: { ...editing.details, contactName: event.target.value } })} /></Field>
              <Field as="div"><span>Email</span><EmailsInput value={editing.details.email} onChange={email => setEditing({ ...editing, details: { ...editing.details, email } })} /></Field>
              <Field><span>Tax identifier</span><Input value={editing.details.taxIdentifier ?? ''} placeholder="optional" onChange={event => setEditing({ ...editing, details: { ...editing.details, taxIdentifier: event.target.value } })} /></Field>
              <Field style={{ gridColumn: '1 / -1' }}><span>Address</span><Area rows={3} value={editing.details.address ?? ''} onChange={event => setEditing({ ...editing, details: { ...editing.details, address: event.target.value } })} /></Field>
              <Field><span>Usual currency</span><Input value={editing.details.currency ?? ''} placeholder="USD" onChange={event => setEditing({ ...editing, details: { ...editing.details, currency: event.target.value.toUpperCase() } })} /></Field>
            </div>
          </Sec>
        ) : contractor ? (
          <>
            <Sec style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Avatar $hue={hueOf(contractor.name)} $size={44}>{initials(contractor.name)}</Avatar>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{contractor.name}</div><Meta>{[contractor.contactName, contractor.email, contractor.taxIdentifier ? `tax id ${contractor.taxIdentifier}` : ''].filter(Boolean).join(' · ') || 'No contact details yet'}</Meta></div>
              <span style={{ flex: 1 }} />
              <Btn disabled={disabled} onClick={() => setEditing({ id: contractor.id, details: { name: contractor.name, contactName: contractor.contactName, email: contractor.email, address: contractor.address, taxIdentifier: contractor.taxIdentifier, currency: contractor.currency } })}>Edit details</Btn>
              <Btn $acc disabled={disabled} onClick={() => setCreating({ direction: 'contractor', contractorId: contractor.id, kind: agreements.some(a => a.kind === 'contractor') ? 'sow' : 'contractor' })}><Icon.plus />Agreement with {contractor.name.split(' ')[0]}</Btn>
            </Sec>
            <Sec style={{ flexDirection: 'row', gap: 10 }}>
              <Stat style={{ flex: 1 }}><span className="l">Active agreements</span><span className="v">{agreements.filter(a => a.status === 'signed').length}</span></Stat>
              <Stat style={{ flex: 1 }}><span className="l">Billed to us</span><span className="v">{money(billed, currency)}</span></Stat>
              <Stat style={{ flex: 1 }}><span className="l">Unpaid</span><span className="v" style={{ color: unpaid > 0 ? 'var(--d-warn-ink)' : undefined }}>{money(unpaid, currency)}</span></Stat>
              <Stat style={{ flex: 1 }}><span className="l">Address</span><span className="v" style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'pre-line', overflow: 'visible' }}>{contractor.address || 'not given'}</span></Stat>
            </Sec>
            <Sec>
              <SecHead><h3>Agreements</h3><Meta>{agreements.length}</Meta></SecHead>
              {agreements.length ? agreements.map(a => (
                <Card key={a.id} role="button" tabIndex={0} onClick={() => p.openAgreement(a.id)} onKeyDown={event => { if (event.key === 'Enter') void p.openAgreement(a.id) }} style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                  <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 600 }}>{a.title}</div><Hint>{KIND_LABEL[a.kind]}{a.numberText ? ` · ${a.numberText}` : ''}{a.fee.kind === 'hourly' && a.fee.rate ? ` · ${money(a.fee.rate, a.currency)}/hr` : ''}</Hint></div>
                  <AgreementStatusChip status={a.status} />
                </Card>
              )) : <Meta>No agreement yet. Draft one before work starts: rate, cap, work product and confidentiality.</Meta>}
            </Sec>
            <Sec>
              <SecHead><h3>Their bills</h3><Meta>{bills.length}</Meta></SecHead>
              {bills.length ? bills.slice(0, 12).map(b => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                  <Mono style={{ fontWeight: 600, minWidth: 90 }}>{b.reference}</Mono><Meta style={{ flex: 1 }}>{b.agreement.numberText ?? b.agreement.title}</Meta>
                  <span style={{ color: b.check.level === 'ok' ? 'var(--d-muted)' : 'var(--d-warn-ink)' }}>{b.check.level === 'ok' ? '' : b.check.message}</span>
                  <Mono>{money(b.amount, b.agreement.currency)}</Mono><Meta style={{ minWidth: 70, textAlign: 'right' }}>{b.paidAt ? 'paid' : 'unpaid'}</Meta>
                </div>
              )) : <Meta>Bills are recorded on the agreement they are for.</Meta>}
            </Sec>
            <Sec>
              <SecHead><h3>Documents</h3><Meta>{contractor.documents?.length ?? 0}</Meta><span className="sp" /><Meta>tax forms, NDAs, insurance</Meta></SecHead>
              <DocumentsList documents={contractor.documents ?? []} disabled={disabled} empty="Nothing linked. Link their tax form (W-9 or W-8BEN), an NDA, or proof of insurance; the files stay where they are."
                onLink={kind => p.linkDocument({ contractorId: contractor.id }, kind)} onOpen={doc => p.openDocument(doc.path, doc.name)} onUnlink={doc => p.unlinkDocument({ contractorId: contractor.id }, doc.id)} />
            </Sec>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '80px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 600 }}>Who works for Pure Science?</div>
            <Meta style={{ maxWidth: 440 }}>Add the people and firms you engage. Each gets an agreement with a rate and a cap, and their bills are checked against it.</Meta>
            <Btn $acc disabled={disabled} onClick={() => setEditing({ id: null, details: { name: '' } })}><Icon.plus />Add a contractor</Btn>
          </div>
        )}
      </Panel>
      {creating ? <NewAgreementSheet product={p} store={store} preset={creating} disabled={disabled} onClose={() => setCreating(null)} /> : null}
    </Body>
  )
}
