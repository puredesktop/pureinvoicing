import { useEffect, useState } from 'react'
import { styled } from 'styled-components'
import { suggestPeople, type PersonSuggestion } from '../../bridge/platformBridge'

/** Addresses kept as one comma-separated string, the form the invoice prints and the directory stores. */
export const splitEmails = (value: string | undefined): string[] => (value ?? '').split(/[,;\s]+/).map(part => part.trim()).filter(Boolean)
const looksLikeEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)

/**
 * One or more email addresses. Each finished address becomes a chip; Enter,
 * comma, space, Tab or leaving the field finishes the one being typed, and
 * Backspace on an empty field takes the last one back to edit. Typing a
 * name or part of an address offers matching people from PurePeople.
 */
export function EmailsInput({ value, onChange, onPickPerson, placeholder = 'Name or email', id }: {
  value: string | undefined
  onChange: (value: string) => void
  /** Called when a PurePeople contact is chosen, e.g. to fill an empty Attention line. */
  onPickPerson?: (person: PersonSuggestion) => void
  placeholder?: string
  id?: string
}): React.ReactElement {
  const emails = splitEmails(value)
  const [typing, setTyping] = useState('')
  const [people, setPeople] = useState<PersonSuggestion[]>([])
  const [active, setActive] = useState(0)
  useEffect(() => {
    let live = true
    const query = typing.trim()
    if (query.length < 2) { setPeople([]); return }
    const timer = setTimeout(() => { void suggestPeople(query).then(found => { if (live) { setPeople(found.filter(person => !emails.includes(person.email!))); setActive(0) } }) }, 140)
    return () => { live = false; clearTimeout(timer) }
  }, [typing, value])
  const commit = (list: string[]) => onChange([...new Set(list)].join(', '))
  const finish = () => { const added = splitEmails(typing); if (added.length) commit([...emails, ...added]); setTyping(''); setPeople([]) }
  const pick = (person: PersonSuggestion) => { commit([...emails, person.email!]); setTyping(''); setPeople([]); onPickPerson?.(person) }
  return (
    <Box onClick={event => (event.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}>
      {emails.map(email => (
        <span key={email} className={looksLikeEmail(email) ? 'chip' : 'chip bad'} title={looksLikeEmail(email) ? email : `${email} does not look like an email address`}>
          {email}
          <button type="button" aria-label={`Remove ${email}`} onClick={event => { event.stopPropagation(); commit(emails.filter(e => e !== email)) }}>×</button>
        </span>
      ))}
      <input id={id} value={typing} placeholder={emails.length ? 'Add another' : placeholder} aria-label="Email addresses"
        onChange={event => { const text = event.target.value; if (/[,;\s]$/.test(text)) { const added = splitEmails(text); if (added.length) commit([...emails, ...added]); setTyping('') } else setTyping(text) }}
        onKeyDown={event => {
          if (people.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); setActive(i => (i + (event.key === 'ArrowDown' ? 1 : people.length - 1)) % people.length); return }
          if (people.length && event.key === 'Escape') { event.stopPropagation(); setPeople([]); return }
          if (people.length && (event.key === 'Enter' || event.key === 'Tab') && !looksLikeEmail(typing.trim())) { event.preventDefault(); pick(people[active]!); return }
          if ((event.key === 'Enter' || event.key === 'Tab') && typing.trim()) { if (event.key === 'Enter') event.preventDefault(); finish() }
          else if (event.key === 'Backspace' && !typing && emails.length) { event.preventDefault(); setTyping(emails[emails.length - 1]); commit(emails.slice(0, -1)) }
        }}
        onPaste={event => { const text = event.clipboardData.getData('text'); if (/[,;\s]/.test(text.trim())) { event.preventDefault(); commit([...emails, ...splitEmails(typing + text)]); setTyping('') } }}
        onBlur={() => { if (!people.length) finish() }} role="combobox" aria-expanded={people.length > 0} aria-autocomplete="list" />
      {people.length ? (
        <ul className="people" role="listbox" aria-label="People">
          {people.map((person, index) => (
            <li key={`${person.name}-${person.email}`} role="option" aria-selected={index === active} onMouseEnter={() => setActive(index)} onMouseDown={event => { event.preventDefault(); pick(person) }}>
              <b>{person.name}</b><span>{person.email}</span>
            </li>
          ))}
          <li className="from" aria-hidden="true">From {people[0]!.sourceLabel || 'PurePeople'} · Enter to add</li>
        </ul>
      ) : null}
    </Box>
  )
}

const Box = styled.div`
  position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-height: 32px; box-sizing: border-box; padding: 3px 6px;
  border: 1px solid var(--d-line); border-radius: 8px; background: var(--d-paper); color: var(--d-ink); cursor: text;
  &:focus-within { border-color: var(--d-acc); box-shadow: 0 0 0 3px var(--d-acc-soft); }
  .chip { display: inline-flex; align-items: center; gap: 2px; max-width: 100%; padding: 2px 4px 2px 8px; border-radius: 999px; font-size: 12.5px; background: var(--d-acc-soft); color: var(--d-ink); overflow-wrap: anywhere; }
  .chip.bad { background: var(--d-warn-bg); color: var(--d-warn-ink); }
  .chip button { border: 0; background: none; color: inherit; opacity: .6; cursor: pointer; font: inherit; font-size: 14px; line-height: 1; padding: 0 4px; border-radius: 999px; }
  .chip button:hover { opacity: 1; }
  .people { position: absolute; z-index: 30; left: -1px; right: -1px; top: calc(100% + 4px); margin: 0; padding: 4px; list-style: none;
    background: var(--d-paper); color: var(--d-ink); border: 1px solid var(--d-line); border-radius: 10px; box-shadow: 0 10px 28px rgba(0, 0, 0, .14); }
  .people li[role='option'] { display: flex; flex-direction: column; gap: 1px; padding: 6px 9px; border-radius: 7px; cursor: pointer; }
  .people li[role='option'] b { font-size: 13px; font-weight: 600; }
  .people li[role='option'] span { font-size: 12px; color: var(--d-muted); overflow-wrap: anywhere; }
  .people li[aria-selected='true'] { background: var(--d-acc-soft); }
  .people .from { padding: 5px 9px 3px; font-size: 11px; color: var(--d-faint); }
  && input, && input:focus, && input:focus-visible { border: 0; outline: 0; box-shadow: none; }
  input { flex: 1; min-width: 120px; border: 0; outline: 0; background: none; color: inherit; font: inherit; font-size: 13px; padding: 4px 2px; }
`
