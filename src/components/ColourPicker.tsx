import { useEffect, useRef, useState } from 'react'
import { PRESET_COLOURS } from '../theme'
import { Panel } from './Panel'

// The native colour input, committed on the "change" event (picker closed)
// rather than React's onChange, which fires on every drag step and would write
// each intermediate colour to storage and the change log.
function ColourInput({ value, label, className, onCommit }: { value: string; label: string; className: string; onCommit: (colour: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const commit = useRef(onCommit)
  commit.current = onCommit
  useEffect(() => {
    const input = ref.current
    if (!input) return
    const handle = () => commit.current(input.value)
    input.addEventListener('change', handle)
    return () => input.removeEventListener('change', handle)
  }, [])
  // Keyed on value so an outside change (e.g. a restore) resets the uncontrolled input.
  return <input key={value} ref={ref} type="color" className={className} defaultValue={value} aria-label={label} title={label} />
}

// A swatch button that opens a panel with the curated presets and one native
// picker for anything else.
export function ColourPicker({ value, childName, onChange }: { value: string; childName: string; onChange: (colour: string) => void }) {
  const [open, setOpen] = useState(false)
  const choose = (colour: string) => {
    onChange(colour)
    setOpen(false)
  }
  return (
    <>
      <button
        type="button"
        className="child-colour"
        style={{ background: value }}
        aria-label={`Colour for ${childName}`}
        title={`Colour for ${childName}`}
        onClick={() => setOpen(true)}
      />
      <Panel open={open} onClose={() => setOpen(false)} variant="sheet" title={`Colour for ${childName}`}>
        {/* One row: the current colour leads (it's the live native picker, for
            anything not in the presets), the fixed presets follow. */}
        <div className="colour-presets">
          <ColourInput value={value} label="Current colour — tap to choose a custom one" className="colour-swatch colour-swatch-custom" onCommit={choose} />
          {PRESET_COLOURS.map((p) => (
            <button
              key={p.hex}
              type="button"
              className={`colour-swatch${value.toLowerCase() === p.hex.toLowerCase() ? ' active' : ''}`}
              style={{ background: p.hex }}
              aria-label={p.name}
              title={p.name}
              onClick={() => choose(p.hex)}
            />
          ))}
        </div>
      </Panel>
    </>
  )
}
