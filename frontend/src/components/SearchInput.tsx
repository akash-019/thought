/**
 * File: src/components/SearchInput.tsx
 *
 * A search box with a magnifier icon and a clear (×) button. Pressing Escape clears it.
 * Used to filter lists (professionals, sessions); the matching itself is in lib/search.ts.
 */
interface Props {
  value: string;
  onChange: (value: string) => void;
  label: string; // read by screen readers, e.g. "Search professionals"
  placeholder?: string;
}

export function SearchInput({ value, onChange, label, placeholder }: Props) {
  return (
    <div className="search">
      <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder ?? label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onChange('');
        }}
      />
      {value && (
        <button type="button" className="icon-button search-clear" aria-label="Clear search" onClick={() => onChange('')}>
          ×
        </button>
      )}
    </div>
  );
}
