import { STATUS_LABEL } from '../../../lib/invoices/agreements'
import { formatMoney, sumMoney } from '../../../lib/invoices/money'
import type { AgreementStatus } from '../../../lib/invoices/types'
import { Chip } from '../deskStyles'

const STATUS_TONE: Record<AgreementStatus, 'neutral' | 'warn' | 'ok' | 'info'> = { draft: 'neutral', sent: 'warn', signed: 'ok', complete: 'info', ended: 'neutral' }
export const STATUS_DOT: Record<AgreementStatus, string> = { draft: 'var(--d-faint)', sent: 'var(--d-warn-ink)', signed: 'var(--d-ok-ink)', complete: 'var(--d-info-ink)', ended: 'var(--d-faint)' }

export function AgreementStatusChip({ status }: { status: AgreementStatus }): React.ReactElement {
  return <Chip $tone={STATUS_TONE[status]}>{status === 'signed' || status === 'sent' ? <i /> : null}{STATUS_LABEL[status]}</Chip>
}
/** An amount held as a number, shown in the agreement's currency. */
export const money = (amount: number | string | undefined | null, currency: string) => amount === undefined || amount === null || amount === '' ? '—' : formatMoney(sumMoney([String(amount)], currency), currency)
/** Parse a typed amount; empty is undefined, junk is NaN (the caller refuses it). */
export const parseAmount = (text: string): number | undefined => text.trim() === '' ? undefined : Number(text.replace(/[,\s$€£]/g, ''))
