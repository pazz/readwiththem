import './StarRating.css'

// Five stars; tapping the current rating clears it. The value is a string
// ('' for none) so it binds like any other form field.
export function StarRating({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const current = Number(value) || 0
  return (
    <div className="star-rating" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={current === n}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          className={`star${n <= current ? ' filled' : ''}`}
          onClick={() => onChange(current === n ? '' : String(n))}
        >
          ★
        </button>
      ))}
    </div>
  )
}
