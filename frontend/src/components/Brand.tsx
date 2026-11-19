/**
 * File: src/components/Brand.tsx
 *
 * The product name, "Thought", with "Session booking" in small type under it.
 * Used in the header and on the log-in and sign-up pages.
 */
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-name">Thought</span>
      <span className="brand-tagline">Session booking</span>
    </span>
  );
}
