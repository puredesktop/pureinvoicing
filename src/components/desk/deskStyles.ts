import { styled, css } from 'styled-components'

/**
 * The desk look: frosted panels over the PureDesktop wallpaper, paper cards
 * for anything read, the shell's chrome measures and colours throughout.
 * Every value binds to a shell token. The fallbacks exist because this app
 * ships against the public SDK and may meet a shell that predates a token;
 * they are derived from the platform ramp, never a second palette.
 */
export const Desk = styled.div`
  --d-acc: var(--pure-chrome-accent, var(--platform-colors-accent));
  --d-acc-ink: color-mix(in oklab, var(--d-acc) 72%, var(--platform-colors-text));
  --d-acc-soft: color-mix(in srgb, var(--d-acc) 12%, transparent);
  --d-on-acc: var(--pure-chrome-on-accent, var(--platform-colors-text-inverse));
  --d-ink: var(--platform-colors-text);
  --d-soft: var(--pure-chrome-soft, var(--platform-colors-text-secondary));
  --d-muted: var(--pure-chrome-muted, var(--platform-colors-text-secondary));
  --d-faint: var(--platform-colors-text-disabled);
  --d-paper: var(--pure-chrome-paper, var(--platform-colors-elevated));
  --d-panel: var(--glass-panel, color-mix(in srgb, var(--platform-colors-elevated) 62%, transparent));
  --d-panel-strong: var(--glass-panel-strong, color-mix(in srgb, var(--platform-colors-elevated) 80%, transparent));
  --d-popover: var(--glass-popover, var(--platform-colors-elevated));
  --d-edge: var(--glass-edge, color-mix(in srgb, var(--platform-colors-elevated) 85%, transparent));
  --d-edge-strong: var(--glass-edge-strong, var(--platform-colors-border-strong));
  --d-line: var(--glass-line, var(--pure-chrome-line, var(--platform-colors-divider)));
  --d-well: var(--glass-well, var(--pure-chrome-well, var(--platform-colors-surface-hover)));
  --d-blur: var(--glass-blur, blur(24px) saturate(140%));
  --d-shadow-card: 0 1px 2px rgba(16, 22, 40, 0.06), 0 10px 22px -16px rgba(16, 22, 40, 0.35);
  --d-shadow-float: 0 18px 44px rgba(23, 26, 31, 0.22);
  --d-ok-bg: var(--pure-success-muted, var(--platform-colors-success-muted));
  --d-ok-ink: var(--pure-success-text, var(--platform-colors-success-text));
  --d-warn-bg: var(--pure-attention-muted, var(--platform-colors-warning-muted));
  --d-warn-ink: var(--pure-attention-text, var(--platform-colors-warning-text));
  --d-bad-bg: var(--pure-danger-muted, var(--platform-colors-danger-muted));
  --d-bad-ink: var(--pure-danger-text, var(--platform-colors-danger-text));
  --d-info-bg: var(--pure-info-muted, var(--platform-colors-info-muted));
  --d-info-ink: var(--pure-info-text, var(--platform-colors-info-text));
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
  background: var(--d-panel);
  border: 1px solid var(--d-edge);
  backdrop-filter: var(--d-blur);
  -webkit-backdrop-filter: var(--d-blur);
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
  padding: 3px;
  border-radius: 999px;
  background: var(--d-well);
`
export const Tab = styled.button<{ $on?: boolean }>`
  height: 26px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: ${({ $on }) => ($on ? 'var(--d-paper)' : 'transparent')};
  color: ${({ $on }) => ($on ? 'var(--d-ink)' : 'var(--d-soft)')};
  font-weight: ${({ $on }) => ($on ? 600 : 500)};
  font-size: 12.5px;
  box-shadow: ${({ $on }) => ($on ? '0 1px 2px rgba(16, 22, 40, 0.08)' : 'none')};
  cursor: pointer;
  white-space: nowrap;
`
export const SearchBox = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 10px;
  min-width: 240px;
  border-radius: 9px;
  border: 1px solid var(--d-line);
  background: color-mix(in srgb, var(--d-paper) 55%, transparent);
  color: var(--d-muted);
  input { flex: 1; min-width: 0; border: 0; background: transparent; outline: none; font-size: 12.5px; color: var(--d-ink); &::placeholder { color: var(--d-muted); } }
  kbd { font: 500 10.5px var(--d-mono); color: var(--d-faint); }
  &:focus-within { border-color: var(--d-acc); }
`
export const Btn = styled.button<{ $acc?: boolean; $quiet?: boolean; $danger?: boolean; $sm?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: ${({ $sm }) => ($sm ? '26px' : '30px')};
  padding: 0 ${({ $sm }) => ($sm ? '9px' : '12px')};
  border-radius: 8px;
  border: 1px solid ${({ $acc, $quiet }) => ($acc ? 'var(--d-acc)' : $quiet ? 'transparent' : 'var(--d-line)')};
  background: ${({ $acc, $quiet }) => ($acc ? 'var(--d-acc)' : $quiet ? 'transparent' : 'var(--d-paper)')};
  color: ${({ $acc, $quiet, $danger }) => ($acc ? 'var(--d-on-acc)' : $danger ? 'var(--d-bad-ink)' : $quiet ? 'var(--d-soft)' : 'var(--d-ink)')};
  font-size: ${({ $sm }) => ($sm ? '12px' : '12.5px')};
  font-weight: ${({ $acc }) => ($acc ? 600 : 500)};
  white-space: nowrap;
  cursor: pointer;
  &:hover:not(:disabled) { border-color: ${({ $acc }) => ($acc ? 'var(--d-acc)' : 'var(--d-edge-strong)')}; ${({ $quiet }) => ($quiet ? 'background: var(--d-well);' : '')} }
  &:disabled { opacity: 0.5; cursor: default; }
  kbd { font: 500 10.5px var(--d-mono); opacity: 0.75; }
  svg { width: 15px; height: 15px; flex: 0 0 auto; }
`
export const Pill = styled.button<{ $on?: boolean; $quiet?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid ${({ $on, $quiet }) => ($on ? 'var(--d-acc)' : $quiet ? 'transparent' : 'var(--d-line)')};
  background: ${({ $on, $quiet }) => ($on ? 'var(--d-acc)' : $quiet ? 'transparent' : 'color-mix(in srgb, var(--d-paper) 55%, transparent)')};
  color: ${({ $on, $quiet }) => ($on ? 'var(--d-on-acc)' : $quiet ? 'var(--d-soft)' : 'var(--d-ink)')};
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  &:hover:not(:disabled) { border-color: ${({ $on }) => ($on ? 'var(--d-acc)' : 'var(--d-edge-strong)')}; }
  &:disabled { opacity: 0.5; cursor: default; }
  .caret { font-size: 9px; opacity: 0.6; }
`
export type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info' | 'acc'
const toneBg: Record<Tone, string> = { neutral: 'var(--d-well)', ok: 'var(--d-ok-bg)', warn: 'var(--d-warn-bg)', bad: 'var(--d-bad-bg)', info: 'var(--d-info-bg)', acc: 'var(--d-acc-soft)' }
const toneInk: Record<Tone, string> = { neutral: 'var(--d-soft)', ok: 'var(--d-ok-ink)', warn: 'var(--d-warn-ink)', bad: 'var(--d-bad-ink)', info: 'var(--d-info-ink)', acc: 'var(--d-acc-ink)' }
export const Chip = styled.span<{ $tone?: Tone }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 20px;
  padding: 0 8px;
  border-radius: 6px;
  background: ${({ $tone = 'neutral' }) => toneBg[$tone]};
  color: ${({ $tone = 'neutral' }) => toneInk[$tone]};
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.8; }
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
  border-radius: 8px;
  background: ${({ $on }) => ($on ? 'var(--d-paper)' : 'transparent')};
  font-size: 13px;
  font-weight: ${({ $on }) => ($on ? 600 : 500)};
  text-align: left;
  cursor: pointer;
  box-shadow: ${({ $on }) => ($on ? '0 1px 2px rgba(16, 22, 40, 0.06)' : 'none')};
  &:hover:not(:disabled) { ${({ $on }) => ($on ? '' : 'background: var(--d-well);')} }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  small { font: 500 11px var(--d-mono); color: var(--d-faint); }
`
export const Dot = styled.span<{ $color?: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 auto;
  background: ${({ $color }) => $color ?? 'var(--d-acc)'};
`
export const Kicker = styled.span`
  font: 500 10px var(--d-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--d-faint);
`
export const Meta = styled.span`
  font-size: 12px;
  color: var(--d-muted);
`
export const Hint = styled.span<{ $err?: boolean }>`
  font-size: 11.5px;
  color: ${({ $err }) => ($err ? 'var(--d-bad-ink)' : 'var(--d-muted)')};
`
export const Mono = styled.span`
  font-family: var(--d-mono);
  font-variant-numeric: tabular-nums;
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
  ${({ $strong }) => ($strong ? 'background: var(--d-panel-strong);' : '')}
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
`
export const Card = styled.div`
  background: var(--d-paper);
  border: 1px solid var(--d-edge);
  border-radius: 12px;
  box-shadow: var(--d-shadow-card);
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
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--d-line);
  background: var(--d-paper);
  color: var(--d-ink);
  font-size: 13px;
  &:focus { outline: none; border-color: var(--d-acc); box-shadow: 0 0 0 3px var(--d-acc-soft); }
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
  th { font: 500 10.5px var(--d-mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--d-faint); text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--d-line); white-space: nowrap; }
  td { padding: 10px 12px; border-bottom: 1px solid var(--d-line); vertical-align: middle; }
  th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tbody tr { cursor: pointer; }
  tbody tr:hover td { background: var(--d-well); }
  tbody tr[aria-selected='true'] td { background: var(--d-acc-soft); }
  .note-line { display: flex; align-items: center; gap: 5px; max-width: 100%; margin-top: 3px; padding: 2px 8px 2px 6px; border: 0; border-radius: 999px;
    background: var(--d-warn-bg); color: var(--d-warn-ink); font: inherit; font-size: 11.5px; cursor: pointer; }
  .note-line svg { flex: 0 0 auto; width: 12px; height: 12px; }
  .note-line span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .note-line small { flex: 0 0 auto; opacity: .75; }
  .row-note { opacity: 0; }
  tbody tr:hover .row-note, .row-note:focus-visible { opacity: 1; }
  @media (max-width: 1080px) { .c-due { display: none; } }
  @media (max-width: 900px) { .c-issued { display: none; } }
`
export const Stat = styled(Card)`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  min-width: 0;
  .v { font-size: 19px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .l { font-size: 11.5px; color: var(--d-muted); }
`
export const Callout = styled.div<{ $tone?: Tone }>`
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: 10px;
  background: ${({ $tone }) => ($tone && $tone !== 'neutral' ? toneBg[$tone] : 'var(--d-panel-strong)')};
  border: 1px solid ${({ $tone }) => ($tone && $tone !== 'neutral' ? 'transparent' : 'var(--d-edge)')};
  color: ${({ $tone }) => ($tone && $tone !== 'neutral' ? toneInk[$tone] : 'var(--d-ink)')};
  font-size: 12.5px;
  b { font-weight: 600; }
  .sp { flex: 1; }
  svg { width: 15px; height: 15px; flex: 0 0 auto; margin-top: 1px; }
`
export const Seg = styled.div`
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: 9px;
  background: var(--d-well);
`
export const SegBtn = styled.button<{ $on?: boolean }>`
  height: 24px;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  background: ${({ $on }) => ($on ? 'var(--d-paper)' : 'transparent')};
  color: ${({ $on }) => ($on ? 'var(--d-ink)' : 'var(--d-soft)')};
  font-size: 12px;
  font-weight: ${({ $on }) => ($on ? 600 : 500)};
  box-shadow: ${({ $on }) => ($on ? '0 1px 2px rgba(16, 22, 40, 0.08)' : 'none')};
  cursor: pointer;
  white-space: nowrap;
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
  border-radius: 50%;
  flex: 0 0 auto;
  background: oklch(0.55 0.12 ${({ $hue }) => $hue});
  color: #fff;
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
  background: var(--d-panel-strong);
  border-radius: 18px;
  box-shadow: 0 24px 60px rgba(30, 40, 70, 0.24);
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
  padding: 6px;
  border-radius: 12px;
  background: var(--d-popover);
  border: 1px solid var(--d-edge);
  backdrop-filter: var(--d-blur);
  -webkit-backdrop-filter: var(--d-blur);
  box-shadow: var(--d-shadow-float);
`
export const MenuItem = styled.button<{ $on?: boolean; $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: ${({ $on }) => ($on ? 'var(--d-acc-soft)' : 'transparent')};
  color: ${({ $danger }) => ($danger ? 'var(--d-bad-ink)' : 'var(--d-ink)')};
  font-size: 13px;
  font-weight: ${({ $on }) => ($on ? 600 : 500)};
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  &:hover:not(:disabled) { background: var(--d-well); }
  &:disabled { opacity: 0.5; cursor: default; }
  small { margin-left: auto; padding-left: 14px; font: 500 10.5px var(--d-mono); color: var(--d-faint); }
`
export const MenuHead = styled.span`
  padding: 6px 10px 4px;
  font: 500 10px var(--d-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--d-faint);
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
  border-radius: 10px;
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
  .k i { display: block; width: 10px; height: 10px; margin-top: 3px; border-radius: 50%; background: var(--d-paper); border: 2px ${({ $pending }) => ($pending ? 'dashed' : 'solid')} ${({ $tone }) => ($tone && $tone !== 'neutral' ? toneInk[$tone] : $tone === 'neutral' ? 'var(--d-edge-strong)' : 'var(--d-acc)')}; }
  .k s { display: ${({ $last }) => ($last ? 'none' : 'block')}; flex: 1; width: 2px; margin-top: 2px; background: var(--d-line); }
  b { font-size: 12.5px; font-weight: 600; }
  .w { font-size: 11.5px; color: var(--d-muted); }
`
export const IconBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--d-muted);
  cursor: pointer;
  &:hover:not(:disabled) { background: var(--d-well); color: var(--d-ink); }
  &:disabled { opacity: 0.4; cursor: default; }
  svg { width: 15px; height: 15px; }
`
export const Slot = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px dashed var(--d-edge-strong);
  border-radius: 10px;
  color: var(--d-muted);
  font-size: 12.5px;
  svg { width: 15px; height: 15px; flex: 0 0 auto; }
`
