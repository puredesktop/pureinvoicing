import { useEffect, useState } from 'react'
import { styled } from 'styled-components'
import {
  suggestOrganizations,
  suggestPeople,
  type OrganizationSuggestion,
  type PersonSuggestion,
} from '../../bridge/platformBridge'

type LookupProps = {
  kind: 'person' | 'org'
  value: string
  onChange: (value: string) => void
  onPick: (suggestion: PersonSuggestion | OrganizationSuggestion) => void
  placeholder?: string
  invalid?: boolean
}

/** A normal editable field with optional matches from the PurePeople directory. */
export function PeopleLookupInput({ kind, value, onChange, onPick, placeholder, invalid }: LookupProps): React.ReactElement {
  const [suggestions, setSuggestions] = useState<(PersonSuggestion | OrganizationSuggestion)[]>([])
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let live = true
    const query = value.trim()
    if (!open || query.length < 2) { setSuggestions([]); return }
    const timer = setTimeout(() => {
      const request = kind === 'org' ? suggestOrganizations(query) : suggestPeople(query)
      void request.then(found => { if (live) { setSuggestions(found); setActive(0) } })
    }, 140)
    return () => { live = false; clearTimeout(timer) }
  }, [kind, value, open])

  const pick = (suggestion: PersonSuggestion | OrganizationSuggestion) => {
    onChange(suggestion.name)
    onPick(suggestion)
    setOpen(false)
    setSuggestions([])
  }

  return (
    <Box>
      <input
        value={value}
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-label={kind === 'org' ? 'Client organisation' : 'Contact person'}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={suggestions.length > 0}
        onFocus={() => setOpen(true)}
        onChange={event => { setOpen(true); onChange(event.target.value) }}
        onKeyDown={event => {
          if (suggestions.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault()
            setActive(index => (index + (event.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length)
          } else if (suggestions.length && (event.key === 'Enter' || event.key === 'Tab')) {
            event.preventDefault()
            pick(suggestions[active]!)
          } else if (event.key === 'Escape') {
            setOpen(false)
            setSuggestions([])
          }
        }}
        onBlur={() => { setOpen(false); setSuggestions([]) }}
      />
      {suggestions.length ? (
        <ul role="listbox" aria-label={kind === 'org' ? 'Organisations from PurePeople' : 'People from PurePeople'}>
          {suggestions.map((suggestion, index) => {
            const detail = suggestion.kind === 'org'
              ? [suggestion.domains?.[0], suggestion.city, suggestion.country].filter(Boolean).join(' · ')
              : [suggestion.title, suggestion.organization, suggestion.email].filter(Boolean).join(' · ')
            return (
              <li key={`${suggestion.kind}-${suggestion.recordId}`} role="option" aria-selected={index === active}
                onMouseEnter={() => setActive(index)} onMouseDown={event => { event.preventDefault(); pick(suggestion) }}>
                <b>{suggestion.name}</b>{detail ? <span>{detail}</span> : null}
              </li>
            )
          })}
          <li className="from" aria-hidden="true">From PurePeople · Enter to use</li>
        </ul>
      ) : null}
    </Box>
  )
}

const Box = styled.div`
  position: relative;
  input { width: 100%; min-height: 32px; border: 1px solid var(--d-line); border-radius: 8px; padding: 6px 9px; background: var(--d-paper); color: var(--d-ink); outline: none; }
  input:focus { border-color: var(--d-acc); box-shadow: 0 0 0 3px var(--d-acc-soft); }
  input[aria-invalid='true'] { border-color: var(--d-bad-ink); }
  ul { position: absolute; z-index: 30; left: 0; right: 0; top: calc(100% + 4px); margin: 0; padding: 4px; list-style: none; background: var(--d-popover); color: var(--d-ink); border: 1px solid var(--d-edge-strong); border-radius: 10px; box-shadow: var(--d-shadow-float); backdrop-filter: var(--d-blur); -webkit-backdrop-filter: var(--d-blur); }
  li[role='option'] { display: flex; flex-direction: column; gap: 1px; padding: 6px 9px; border-radius: 7px; cursor: pointer; }
  li[role='option'] b { font-size: 13px; font-weight: 600; }
  li[role='option'] span { font-size: 12px; color: var(--d-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li[aria-selected='true'] { background: var(--d-acc-soft); }
  .from { padding: 5px 9px 3px; font-size: 11px; color: var(--d-faint); }
`
