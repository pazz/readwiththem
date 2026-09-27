// A single choice from a few short options, as a row of joined buttons.
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  labelledBy,
}: {
  value: T
  options: ReadonlyArray<readonly [T, string]>
  onChange: (value: T) => void
  labelledBy?: string
}) {
  return (
    <div className="segmented" role="group" aria-labelledby={labelledBy}>
      {options.map(([option, label]) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          className={value === option ? 'active' : ''}
          onClick={() => onChange(option)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
