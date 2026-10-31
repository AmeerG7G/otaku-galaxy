/** A star rating shown as text for screen readers and five stars for the eye. */
export function Stars({ value, label }: { value: number; label?: string }) {
  const rounded = Math.round(Math.min(5, Math.max(0, value)));
  return (
    <span className="stars" role="img" aria-label={label ?? `${value.toLocaleString('ar-IQ', { maximumFractionDigits: 1 })} من ٥`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden="true" className={n <= rounded ? 'stars__on' : 'stars__off'}>
          ★
        </span>
      ))}
    </span>
  );
}
