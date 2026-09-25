import type { BusinessSetup } from '../../hooks/useBusinessSetup'
import type { InvoiceProduct } from '../../hooks/useInvoiceProduct'
import type { InvoiceStore } from '../../lib/invoices/types'
import { Btn, Card, Hint, Meta, Mono, Panel } from './deskStyles'
import { Icon } from './bits'

/** Three cards, any order, each a minute: who you are, how you number, how it looks. Drafts need none of it. */
export function FirstUse({ product: p, setup: s, store, disabled }: { product: InvoiceProduct; setup: BusinessSetup; store: InvoiceStore; disabled: boolean }): React.ReactElement {
  const identityDone = !!store.business.name.trim() && !!store.business.address.trim()
  const numberingDone = store.sequence.verified
  const lookDone = !!store.template.logoAssetId || !!store.template.letterheadText.trim()
  const step = (n: number, done: boolean, title: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: done ? 500 : 600 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: done ? 'var(--d-ok-bg)' : 'var(--d-acc)', color: done ? 'var(--d-ok-ink)' : 'var(--d-on-acc)', font: `600 11px var(--d-mono)` }}>{done ? '✓' : n}</span>{title}
    </div>
  )
  return (
    <Panel $strong style={{ padding: '18px 20px', gap: 14 }}>
      <div><div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.015em' }}>Your first invoice can be a draft right now.</div><Meta style={{ fontSize: 13 }}>Issuing needs the first two. Do them in any order; each takes a minute.</Meta></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        <Card style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 150 }}>
          {step(1, identityDone, 'Who you are')}
          <div style={{ fontWeight: 600 }}>{store.business.name || 'Your business'}</div>
          <Hint>Name and address go on the invoice. Email, tax and registration ids are optional.</Hint>
          <span style={{ flex: 1 }} />
          <Btn $quiet $sm style={{ alignSelf: 'flex-start' }} onClick={() => p.navigate('business')}>{identityDone ? 'Edit' : 'Add details'}</Btn>
        </Card>
        <Card style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 150, ...(identityDone && !numberingDone ? { borderColor: 'var(--d-acc)', boxShadow: '0 0 0 3px var(--d-acc-soft)' } : {}) }}>
          {step(2, numberingDone, 'How you number')}
          <Mono style={{ fontSize: 14 }}>{s.nextLabel}</Mono>
          <Hint>{numberingDone ? 'Confirmed. Change the pattern in Business any time.' : 'Set the pattern and the next counter after the invoices you already issued.'}</Hint>
          <span style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 6 }}><Btn $acc={!numberingDone} $quiet={numberingDone} $sm onClick={() => p.navigate('business')}>{numberingDone ? 'Change' : 'Set numbering'}</Btn><Btn $quiet $sm disabled={disabled} onClick={p.registerExisting}>Register a past invoice</Btn></div>
        </Card>
        <Card style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 150 }}>
          {step(3, lookDone, 'How it looks')}
          <Hint>Logo, letterhead, accent and footer. The default is a clean page you can issue with today.</Hint>
          <span style={{ flex: 1 }} />
          <Btn $quiet $sm style={{ alignSelf: 'flex-start' }} onClick={() => p.navigate('business')}>Set up letterhead</Btn>
        </Card>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--d-well)' }}>
        <Icon.file />
        <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>Have invoices from before?</div><Hint>Import them all from one file (business, clients, invoices, marks and PDFs), or register them one at a time. The assistant can build the file from a folder of PDFs for your approval.</Hint></div>
        <Btn $acc $sm disabled={disabled} onClick={p.openImport}>Import from a file…</Btn>
        <Btn $sm disabled={disabled} onClick={p.registerExisting}>Register one</Btn>
        <Btn $quiet $sm onClick={p.openAssistant}>Ask the assistant</Btn>
      </div>
    </Panel>
  )
}
