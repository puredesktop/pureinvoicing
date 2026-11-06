import { styled, css } from 'styled-components'
import { primaryLook, quiet, quietLabel, selectedRow, statusLabel, type StatusTone } from '../../ui/styles'

/**
 * The desk look: white sheets on a neutral grey ground, ruled with hairlines,
 * square corners, no shadows on rows. Every value binds to the app's own
 * neutral (--n-*) and palette (--p-*) tokens from ui/styles, so light and dark
 * follow the desk. Invoice pages themselves stay white paper: they are what the
 * client receives.
 */
export const Desk = styled.div`
  --d-acc: var(--p-text);
  --d-acc-ink: var(--p-deep);
  --d-acc-soft: var(--p-chosen);
  --d-on-acc: var(--p-on-text);
  --d-ink: var(--n-ink);
  --d-soft: var(--n-soft);
  --d-muted: var(--n-faint);
  --d-faint: var(--n-faint);
  --d-paper: var(--n-sheet);
  --d-panel: var(--n-sheet);
  --d-panel-strong: var(--n-panel);
  --d-popover: var(--n-sheet);
  --d-edge: var(--n-line);
  --d-edge-strong: var(--n-strong);
  --d-line: var(--n-line);
  --d-well: var(--n-hover);
  --d-blur: none;
  --d-shadow-card: none;
  --d-shadow-float: 0 2px 8px rgb(0 0 0 / 0.14);
  --d-ok-bg: var(--n-panel);
  --d-ok-ink: var(--p-done-text);
  --d-warn-bg: var(--n-panel);
  --d-warn-ink: var(--p-needs-you-text);
  --d-bad-bg: var(--n-panel);
  --d-bad-ink: var(--p-failed-text);
  --d-info-bg: var(--n-panel);
  --d-info-ink: var(--p-working-text);
  --d-mono: var(--platform-typography-font-family-mono, ui-monospace, monospace);
  --d-font: var(--platform-typography-font-family);

  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  color: var(--d-ink);
  font: 13px/1.4 var(--d-font);
  -webkit-font-smoothing: antialiased;
  *, *::before, *::after { box-sizing: border-box; }
  button, input, select, textarea { font: inherit; color: inherit; }
  :focus-visible { outline: 2px solid var(--d-acc); outline-offset: 2px; }
`

const frost = css`
  background: var(--n-sheet);
  border: 1px solid var(--n-line);
`

export const TopBar = styled.header`
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  height: 52px;
  padding: 0 16px;
  ${frost}
  border-width: 0 0 1px;
  border-radius: 0;
`
export const Wordmark = styled.span`
  font-size: 15px;
  font-weight: 500;
  letter-spacing: -0.01em;
  margin-right: 4px;
  white-space: nowrap;
  b { font-weight: 700; color: var(--d-acc-ink); }
`
export const Tabs = styled.div`
  display: inline-flex;
  gap: 2px;
`
export const Tab = styled.button<{ $on?: boolean }>`
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: ${({ $on }) => ($on ? 'var(--n-ink)' : 'var(--n-soft)')};
  font-weight: ${({ $on }) => ($on ? 600 : 500)};
  font-size: 12.5px;
  cursor: pointer;
  white-space: nowrap;
  &:hover { background: var(--n-hover); }
  ${({ $on }) => ($on ? css`${selectedRow} border-radius: 3px;` : '')}
`
export const SearchBox = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 10px;
  min-width: 240px;
  border-radius: 3px;
  border: 1px solid var(--n-line);
  background: var(--n-sheet);
  color: var(--d-muted);
  input { flex: 1; min-width: 0; border: 0; background: transparent; outline: none; font-size: 12.5px; color: var(--d-ink); &::placeholder { color: var(--d-muted); } }
  kbd { font: 500 10.5px var(--d-mono); color: var(--d-faint); }
  &:focus-within { border-color: var(--d-acc); }
`
export const Btn = styled.button<{ $acc?: boolean; $quiet?: boolean; $danger?: boolean; $sm?: boolean }>`
  ${quiet}
  height: ${({ $sm }) => ($sm ? '26px' : '28px')};
  padding: 0 ${({ $sm }) => ($sm ? '9px' : '11px')};
  font-size: ${({ $sm }) => ($sm ? '12px' : '12.5px')};
  ${({ $danger }) => ($danger ? 'color: var(--p-failed-text);' : '')}
  ${({ $acc }) => ($acc ? primaryLook : '')}
  kbd { font: 500 10.5px var(--d-mono); opacity: 0.75; }
  svg { width: 15px; height: 15px; flex: 0 0 auto; }
`
export const Pill = styled.button<{ $on?: boolean; $quiet?: boolean }>`
  ${quiet}
  font-weight: 500;
  ${({ $on }) => ($on ? css`${selectedRow} border-radius: 3px; border-color: transparent; font-weight: 600;` : '')}
  .caret { font-size: 9px; opacity: 0.6; }
`
export type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info' | 'acc'
const toneInk: Record<Tone, string> = { neutral: 'var(--d-soft)', ok: 'var(--d-ok-ink)', warn: 'var(--d-warn-ink)', bad: 'var(--d-bad-ink)', info: 'var(--d-info-ink)', acc: 'var(--d-acc-ink)' }
const toneLabel: Record<Exclude<Tone, 'neutral' | 'acc'>, StatusTone> = { ok: 'done', warn: 'needs-you', bad: 'failed', info: 'working' }
/** A label says something: a flat tag in the colour of what it says. Grey for a plain fact; the app's colour marks a quiet one. */
export const Chip = styled.span<{ $tone?: Tone }>`
  ${({ $tone = 'neutral' }) => ($tone === 'neutral' ? statusLabel('idle') : $tone === 'acc' ? css`${quietLabel} --lab-colour: var(--p-text);` : statusLabel(toneLabel[$tone]))}
  i { display: none; }
`
export const Body = styled.div`
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  gap: 12px;
  padding: 12px 18px 16px;
`
export const Rail = styled.nav`
  width: 264px;
  flex: 0 0 264px;
  @media (max-width: 1080px) { width: 212px; flex-basis: 212px; }
  @media (max-width: 760px) { display: none; }
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0;
  min-height: 0;
  overflow: auto;
`
export const RailRow = styled.button<{ $on?: boolean }>`
  display: flex;
  align-items: center;
  gap: 9px;
  height: 30px;
  width: 100%;
  padding: 0 8px;
  border: 0;
  border-radius: 0;
  background: transparent;
  font-size: 13px;
  font-weight: ${({ $on }) => ($on ? 600 : 500)};
  text-align: left;
  cursor: pointer;
  &:hover:not(:disabled) { background: var(--n-hover); }
  ${({ $on }) => ($on ? selectedRow : '')}
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  small { font-size: 11.5px; color: var(--n-faint); }
`
export const Dot = styled.span<{ $color?: string }>`
  width: 8px;
  height: 8px;
  border-radius: 1px;
  flex: 0 0 auto;
  background: ${({ $color }) => $color ?? 'var(--d-acc)'};
`
export const Kicker = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: var(--n-soft);
`
export const Meta = styled.span`
  font-size: 12px;
  color: var(--d-muted);
`
export const Hint = styled.span<{ $err?: boolean }>`
  font-size: 11.5px;
  color: ${({ $err }) => ($err ? 'var(--d-bad-ink)' : 'var(--d-muted)')};
`
/** Numbers, in the sans: amounts line up on their right edge, not by tabular figures, which this face spaces out around the separators. */
export const Mono = styled.span`
  white-space: nowrap;
`
export const Main = styled.main`
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
`
export const Panel = styled.section<{ $strong?: boolean }>`
  ${frost}
  ${({ $strong }) => ($strong ? 'background: var(--n-panel);' : '')}
  border-radius: 3px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
`
export const Card = styled.div`
  background: var(--n-sheet);
  border: 1px solid var(--n-line);
  border-radius: 3px;
`
export const Sec = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 18px;
  border-top: 1px solid var(--d-line);
  &:first-child { border-top: 0; }
  h3 { margin: 0; font-size: 13.5px; font-weight: 600; letter-spacing: -0.005em; }
`
export const SecHead = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 26px;
  .sp { flex: 1; }
`
export const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  > span:first-child { font-size: 11.5px; font-weight: 500; color: var(--d-muted); }
`
const control = css`
  width: 100%;
  min-width: 0;
  height: 30px;
  padding: 0 9px;
  border-radius: 3px;
  border: 1px solid var(--n-line);
  background: var(--n-sheet);
  color: var(--n-ink);
  font-size: 13px;
  &:focus { outline: none; border-color: var(--p-text); box-shadow: inset 0 0 0 1px var(--p-text); }
  &[aria-invalid='true'] { border-color: var(--d-bad-ink); }
  &:disabled { opacity: 0.6; }
`
export const Input = styled.input`${control}`
export const Select = styled.select`${control} padding-right: 26px;`
export const Area = styled.textarea`
  ${control}
  height: auto;
  min-height: 64px;
  padding: 8px 10px;
  line-height: 1.45;
  resize: vertical;
`
export const Grid = styled.div<{ $cols?: string }>`
  display: grid;
  grid-template-columns: ${({ $cols }) => $cols ?? '1fr 1fr'};
  gap: 10px;
  min-width: 0;
`
export const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  .sp { flex: 1; }
`
export const List = styled.table`
  width: 100%;
  /* Fixed columns: the client column takes what is left and truncates, so the table fits a frame narrowed by the drawer. */
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 13px;
  th { position: sticky; top: 0; z-index: 1; font-size: 12px; font-weight: 600; color: var(--n-soft); text-align: left; padding: 0 12px; height: 34px; background: var(--n-panel); border-bottom: 1px solid var(--n-line); white-space: nowrap; }
  td { padding: 9px 12px; border-bottom: 1px solid var(--n-fence); vertical-align: middle; }
  th.num, td.num { text-align: right; }
  tbody tr { cursor: pointer; }
  tbody tr:hover td { background: var(--n-hover); }
  tbody tr[aria-selected='true'] td { background: var(--p-chosen); box-shadow: inset 0 1px 0 color-mix(in srgb, var(--p-deep) 65%, var(--n-sheet)), inset 0 -1px 0 color-mix(in srgb, var(--p-deep) 65%, var(--n-sheet)); }
  td:last-child { text-align: right; white-space: nowrap; }
  .note-line { display: flex; align-items: center; gap: 5px; max-width: 100%; margin-top: 3px; padding: 0; border: 0; border-radius: 0;
    background: none; color: var(--n-soft); font: inherit; font-size: 11.5px; cursor: pointer; }
  .note-line svg { color: var(--p-needs-you-text); }
  .note-line svg { flex: 0 0 auto; width: 12px; height: 12px; }
  .note-line span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .note-line small { flex: 0 0 auto; opacity: .75; }
  @media (max-width: 1080px) { .c-due { display: none; } }
  @media (max-width: 900px) { .c-issued { display: none; } }
`
export const Stat = styled(Card)`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  min-width: 0;
  .v { font-size: 19px; font-weight: 600; letter-spacing: -0.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .l { font-size: 11.5px; color: var(--d-muted); }
`
export const Callout = styled.div<{ $tone?: Tone }>`
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: 3px;
  background: var(--n-panel);
  border: 1px solid ${({ $tone }) => ($tone && $tone !== 'neutral' ? toneInk[$tone] : 'var(--n-line)')};
  color: var(--n-ink);
  font-size: 12.5px;
  b { font-weight: 600; }
  .sp { flex: 1; }
  svg { width: 15px; height: 15px; flex: 0 0 auto; margin-top: 1px; color: ${({ $tone }) => ($tone && $tone !== 'neutral' ? toneInk[$tone] : 'var(--n-soft)')}; }
`
export const Seg = styled.div`
  display: inline-flex;
  gap: 2px;
`
export const SegBtn = styled.button<{ $on?: boolean }>`
  height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: ${({ $on }) => ($on ? 'var(--n-ink)' : 'var(--n-soft)')};
  font-size: 12px;
  font-weight: ${({ $on }) => ($on ? 600 : 500)};
  cursor: pointer;
  white-space: nowrap;
  &:hover { background: var(--n-hover); }
  ${({ $on }) => ($on ? css`${selectedRow} border-radius: 3px;` : '')}
`
export const Switch = styled.label<{ $on?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  cursor: pointer;
  input { position: absolute; opacity: 0; width: 0; height: 0; }
  i { position: relative; display: inline-block; width: 30px; height: 18px; border-radius: 999px; border: 1.5px solid ${({ $on }) => ($on ? 'var(--d-acc)' : 'var(--d-edge-strong)')}; background: ${({ $on }) => ($on ? 'var(--d-acc)' : 'transparent')}; flex: 0 0 auto; }
  i::after { content: ''; position: absolute; top: 2px; left: ${({ $on }) => ($on ? '14px' : '2px')}; width: 11px; height: 11px; border-radius: 50%; background: ${({ $on }) => ($on ? 'var(--d-on-acc)' : 'var(--d-soft)')}; }
`
export const Avatar = styled.span<{ $hue: number; $size?: number }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${({ $size = 24 }) => $size}px;
  height: ${({ $size = 24 }) => $size}px;
  border-radius: 3px;
  flex: 0 0 auto;
  /* Initials on grey: a client is told apart by name, not by a colour. */
  background: var(--n-hover);
  box-shadow: inset 0 0 0 1px var(--n-line);
  color: var(--n-soft);
  --hue: ${({ $hue }) => $hue};
  font-size: ${({ $size = 24 }) => Math.round($size * 0.42)}px;
  font-weight: 600;
`
export const Paper = styled.div`
  background: #fff;
  color: #16181d;
  box-shadow: 0 1px 2px rgba(18, 18, 22, 0.05), 0 18px 48px rgba(18, 18, 22, 0.13);
  img { display: block; width: 100%; height: auto; }
`
export const Scrim = styled.div`
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 40px 24px 24px;
  background: color-mix(in srgb, var(--platform-colors-text) 22%, transparent);
`
export const Sheet = styled.div`
  ${frost}
  background: var(--n-sheet);
  border-radius: 4px;
  box-shadow: 0 8px 28px rgb(0 0 0 / 0.22);
  display: flex;
  flex-direction: column;
  width: min(880px, 100%);
  max-height: calc(100% - 24px);
  min-height: 0;
  overflow: hidden;
`
export const Popover = styled.div`
  position: fixed;
  z-index: 140;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 0;
  border-radius: 3px;
  background: var(--n-sheet);
  border: 1px solid var(--n-line);
  box-shadow: var(--d-shadow-float);
`
export const MenuItem = styled.button<{ $on?: boolean; $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 0;
  background: ${({ $on }) => ($on ? 'var(--p-chosen)' : 'transparent')};
  box-shadow: ${({ $on }) => ($on ? 'var(--p-chosen-edge)' : 'none')};
  color: ${({ $danger }) => ($danger ? 'var(--p-failed-text)' : 'var(--n-ink)')};
  font-size: 13px;
  font-weight: ${({ $on }) => ($on ? 600 : 500)};
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  &:hover:not(:disabled) { background: ${({ $on }) => ($on ? 'var(--p-chosen)' : 'var(--n-hover)')}; }
  &:disabled { opacity: 0.5; cursor: default; }
  small { margin-left: auto; padding-left: 14px; font-size: 11.5px; color: var(--n-faint); }
`
export const MenuHead = styled.span`
  padding: 6px 10px 4px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--n-soft);
`
export const Toast = styled.div`
  position: absolute;
  left: 50%;
  bottom: 18px;
  z-index: 60;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: min(720px, 90%);
  padding: 9px 14px;
  border-radius: 3px;
  background: var(--platform-colors-tooltip-bg, var(--platform-colors-text));
  color: var(--platform-colors-tooltip-text, var(--platform-colors-text-inverse));
  font-size: 12.5px;
  box-shadow: var(--d-shadow-float);
`
export const Timeline = styled.div`
  display: flex;
  flex-direction: column;
`
export const TimelineItem = styled.div<{ $tone?: Tone; $last?: boolean; $pending?: boolean }>`
  display: grid;
  grid-template-columns: 18px 1fr;
  gap: 10px;
  padding: 5px 0;
  .k { display: flex; flex-direction: column; align-items: center; }
  .k i { display: block; width: 10px; height: 10px; margin-top: 3px; border-radius: 1px; background: var(--d-paper); border: 2px ${({ $pending }) => ($pending ? 'dashed' : 'solid')} ${({ $tone }) => ($tone && $tone !== 'neutral' ? toneInk[$tone] : $tone === 'neutral' ? 'var(--d-edge-strong)' : 'var(--d-acc)')}; }
  .k s { display: ${({ $last }) => ($last ? 'none' : 'block')}; flex: 1; width: 2px; margin-top: 2px; background: var(--d-line); }
  b { font-size: 12.5px; font-weight: 600; }
  .w { font-size: 11.5px; color: var(--d-muted); }
`
/** An icon-only button, where space is tight: raised like every button, always there, named by its tooltip. */
export const IconBtn = styled.button`
  ${quiet}
  width: 26px;
  height: 26px;
  padding: 0;
  color: var(--n-soft);
  svg { width: 14px; height: 14px; }
`
export const Slot = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px dashed var(--n-strong);
  border-radius: 3px;
  color: var(--d-muted);
  font-size: 12.5px;
  svg { width: 15px; height: 15px; flex: 0 0 auto; }
`
