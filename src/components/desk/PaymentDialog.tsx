import { useEffect, useRef, useState } from 'react'
import { localToday } from '../../lib/invoices/defaults'
import { formatMoney } from '../../lib/invoices/money'
import type { MarkRequest } from '../../lib/invoices/lifecycle'
import type { InvoiceMarks } from '../../lib/invoices/types'
import { Icon, longDate } from './bits'
import { Area, Btn, Field, Input, Kicker, Meta, Mono, Scrim, Sheet } from './deskStyles'

export interface PaymentTarget {
  id: string
  numberText: string
  client: string
  total: string
  currency?: string
  dueDate?: string
  marks?: InvoiceMarks
}

/**
 * Recording a payment: the day the money actually arrived (not the day the
 * button was pressed), its reference, and a note. Opening it on a paid invoice
 * edits that record; "Not paid" clears it.
 */
export function PaymentDialog({ target, disabled, onSave, onClose }: {
  target: PaymentTarget
  disabled: boolean
  onSave: (request: MarkRequest, invoiceId: string) => void
  onClose: () => void
}): React.ReactElement {
  const editing = !!target.marks?.paidAt
  const [at, setAt] = useState(target.marks?.paidAt ?? localToday())
  const [reference, setReference] = useState(target.marks?.paidReference ?? '')
  const [note, setNote] = useState(target.marks?.paidNote ?? '')
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => { first.current?.focus() }, [])
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  const today = localToday()
  const future = at > today
  const save = () => { if (!at || future) return; onSave({ kind: 'paid', at, reference, note }, target.id); onClose() }
  const quick = [{ label: 'Today', day: today }, ...(target.dueDate && target.dueDate <= today ? [{ label: 'On the due date', day: target.dueDate }] : [])]
  return (
    <Scrim onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <Sheet role="dialog" aria-label={editing ? 'Edit payment' : 'Record payment'} style={{ width: 'min(460px, 100%)' }}>
        <form onSubmit={event => { event.preventDefault(); save() }} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 22px 14px', borderBottom: '1px solid var(--d-line)' }}>
            <div style={{ minWidth: 0 }}>
              <Kicker>{editing ? 'Edit payment' : 'Record payment'}</Kicker>
              <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em', marginTop: 2 }}>{formatMoney(target.total, target.currency ?? null)} <span style={{ fontWeight: 400, color: 'var(--d-muted)' }}>from</span> {target.client}</div>
              <Meta style={{ display: 'block', marginTop: 2 }}>Invoice <Mono>{target.numberText}</Mono>{target.dueDate ? ` · due ${longDate(target.dueDate)}` : ''}</Meta>
            </div>
            <span style={{ flex: 1 }} />
            <Btn type="button" $quiet $sm onClick={onClose} aria-label="Close"><Icon.x /></Btn>
          </div>
          <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field>
              <span>Date paid</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Input id="payment-date" type="date" required value={at} max={today} onChange={event => setAt(event.target.value)} style={{ width: 170 }} aria-invalid={future} />
                {quick.map(q => <Btn key={q.label} type="button" $sm $quiet aria-pressed={at === q.day} onClick={() => setAt(q.day)}>{q.label}</Btn>)}
              </div>
              <Meta>{future ? 'A payment date cannot be in the future.' : 'The day the money arrived in your account.'}</Meta>
            </Field>
            <Field>
              <span>Reference</span>
              <Input ref={first} id="payment-reference" value={reference} placeholder="Bank reference, cheque number, transfer ID" onChange={event => setReference(event.target.value)} />
            </Field>
            <Field>
              <span>Note</span>
              <Area id="payment-note" rows={3} value={note} placeholder="Anything worth remembering: paid in two parts, paid by the parent company…" onChange={event => setNote(event.target.value)} />
            </Field>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--d-line)' }}>
            {editing ? <Btn type="button" $sm $quiet disabled={disabled} onClick={() => { onSave({ kind: 'clear', which: 'paid' }, target.id); onClose() }}>Not paid</Btn> : <Meta>Nothing on the issued invoice changes.</Meta>}
            <span style={{ flex: 1 }} />
            <Btn type="button" $quiet onClick={onClose}>Cancel</Btn>
            <Btn type="submit" $acc disabled={disabled || !at || future}><Icon.check />{editing ? 'Save payment' : 'Mark paid'}</Btn>
          </div>
        </form>
      </Sheet>
    </Scrim>
  )
}
