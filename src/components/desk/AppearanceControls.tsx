import type { Diagnostic, InvoiceStore, Presentation } from '../../lib/invoices/types'
import { Btn, Callout, Field, Grid, Hint, Input, Row, Seg, SegBtn, Switch } from './deskStyles'
import { Icon } from './bits'

export interface AppearanceControlsProps {
  presentation: Presentation
  store: InvoiceStore
  diagnostics: Diagnostic[]
  disabled: boolean
  onChange: (patch: Partial<Presentation>) => void
  onImportLogo: () => void
  /** True when these are one invoice's settings rather than the template. */
  invoiceLocal?: boolean
}

/** Logo, letterhead, footer, type, colour, page: the same controls for the template and for one invoice. */
export function AppearanceControls({ presentation: p, store, diagnostics, disabled, onChange, onImportLogo, invoiceLocal }: AppearanceControlsProps): React.ReactElement {
  const num = (key: 'logoWidthMm' | 'letterheadTextSizePt' | 'footerTextSizePt' | 'bodyTextSizePt' | 'lineSpacing' | 'sectionSpacingMm', label: string, min: number, max: number, step = 1, unit = '') => (
    <Field><span>{label}{unit ? ` (${unit})` : ''}</span><Input type="number" min={min} max={max} step={step} disabled={disabled} value={Number.isFinite(p[key]) ? p[key] : ''} aria-invalid={diagnostics.some(d => d.field === `presentation.${key}`)} onChange={event => onChange({ [key]: event.target.value === '' ? NaN : Number(event.target.value) })} /></Field>
  )
  const align = (key: 'logoPlacement' | 'letterheadAlignment' | 'footerAlignment') => (
    <Seg>{(['left', 'center', 'right'] as const).map(value => <SegBtn key={value} $on={p[key] === value} disabled={disabled} onClick={() => onChange({ [key]: value })}>{value === 'left' ? 'Left' : value === 'center' ? 'Centre' : 'Right'}</SegBtn>)}</Seg>
  )
  const logo = p.logoAssetId ? store.assets[p.logoAssetId] : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {invoiceLocal ? <Hint>These settings travel with this invoice. Save them as the default to reuse them.</Hint> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong style={{ fontSize: 12.5 }}>Logo</strong>
        <Row><Btn $sm disabled={disabled} onClick={onImportLogo}>{p.logoAssetId ? 'Replace logo' : 'Upload logo'}</Btn>{p.logoAssetId ? <Btn $quiet $sm disabled={disabled} onClick={() => onChange({ logoAssetId: null })}>Remove</Btn> : null}<Hint>{p.logoAssetId ? logo?.name ?? 'Logo file missing; replace or remove it' : 'PNG, JPEG, WebP or GIF'}</Hint></Row>
        {p.logoAssetId ? <Grid $cols="auto 1fr" style={{ alignItems: 'end' }}>{align('logoPlacement')}{num('logoWidthMm', 'Logo width', 1, 200, 1, 'mm')}</Grid> : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong style={{ fontSize: 12.5 }}>Letterhead</strong>
        <Field><span>Text above your details</span><Input as="textarea" style={{ height: 'auto', minHeight: 48, padding: '6px 10px' }} disabled={disabled} value={p.letterheadText} onChange={event => onChange({ letterheadText: event.target.value })} /></Field>
        <Grid $cols="auto 1fr" style={{ alignItems: 'end' }}>{align('letterheadAlignment')}{num('letterheadTextSizePt', 'Size', 8, 36, 0.5, 'pt')}</Grid>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong style={{ fontSize: 12.5 }}>Footer</strong>
        <Field><span>Repeats on every page</span><Input as="textarea" style={{ height: 'auto', minHeight: 48, padding: '6px 10px' }} disabled={disabled} value={p.footerText} aria-invalid={diagnostics.some(d => d.field === 'presentation.footerText')} onChange={event => onChange({ footerText: event.target.value })} /></Field>
        <Grid $cols="auto 1fr auto" style={{ alignItems: 'end' }}>{align('footerAlignment')}{num('footerTextSizePt', 'Size', 8, 36, 0.5, 'pt')}<Switch $on={p.showPageNumbers}><input type="checkbox" checked={p.showPageNumbers} disabled={disabled} onChange={event => onChange({ showPageNumbers: event.target.checked })} /><i />Page numbers</Switch></Grid>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong style={{ fontSize: 12.5 }}>Type and colour</strong>
        <Grid $cols="auto 1fr 1fr" style={{ alignItems: 'end' }}>
          <Seg>{(['sans', 'serif', 'mono'] as const).map(value => <SegBtn key={value} $on={p.typeStyle === value} disabled={disabled} onClick={() => onChange({ typeStyle: value })}>{value === 'sans' ? 'Sans' : value === 'serif' ? 'Serif' : 'Mono'}</SegBtn>)}</Seg>
          {num('bodyTextSizePt', 'Body size', 8, 36, 0.5, 'pt')}
          <Field><span>Accent</span><Row><input type="color" disabled={disabled} value={/^#[0-9a-f]{6}$/i.test(p.accentColor) ? p.accentColor : '#284B63'} onChange={event => onChange({ accentColor: event.target.value })} style={{ width: 32, height: 32, padding: 0, border: '1px solid var(--d-line)', borderRadius: 8, background: 'transparent' }} aria-label="Accent colour" /><Input value={p.accentColor} disabled={disabled} aria-invalid={diagnostics.some(d => d.field === 'presentation.accentColor')} onChange={event => onChange({ accentColor: event.target.value })} /></Row></Field>
        </Grid>
        <Grid>{num('lineSpacing', 'Line spacing', 1.15, 3, 0.05)}{num('sectionSpacingMm', 'Space between sections', 0, 40, 1, 'mm')}</Grid>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong style={{ fontSize: 12.5 }}>Page</strong>
        <Grid $cols="auto 1fr 1fr 1fr 1fr" style={{ alignItems: 'end' }}>
          <Seg>{(['A4', 'Letter'] as const).map(value => <SegBtn key={value} $on={p.pageSize === value} disabled={disabled} onClick={() => onChange({ pageSize: value })}>{value}</SegBtn>)}</Seg>
          {(['top', 'right', 'bottom', 'left'] as const).map(side => <Field key={side}><span>{side[0].toUpperCase() + side.slice(1)} margin (mm)</span><Input type="number" min={side === 'top' ? 12 : 8} disabled={disabled} value={Number.isFinite(p.marginsMm[side]) ? p.marginsMm[side] : ''} aria-invalid={diagnostics.some(d => d.field === `presentation.marginsMm.${side}` || d.field === 'presentation.marginsMm')} onChange={event => onChange({ marginsMm: { ...p.marginsMm, [side]: event.target.value === '' ? NaN : Number(event.target.value) } })} /></Field>)}
        </Grid>
      </div>
      {diagnostics.length ? <Callout $tone="warn"><Icon.warn /><span>{diagnostics.map(d => d.message).join(' ')}</span></Callout> : null}
    </div>
  )
}
