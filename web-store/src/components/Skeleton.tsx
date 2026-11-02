/**
 * Placeholders shown while the next page renders on the server. Prefetching
 * is off (`Link.tsx`), so every navigation waits for one server render; this
 * shows that something is happening. Pure markup — no API call.
 */
function Busy({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">جارٍ التحميل…</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

export function GridSkeleton() {
  return (
    <Busy>
      <span className="skeleton skeleton--title" />
      <span className="skeleton skeleton--chips" />
      <ul className="product-grid">
        {Array.from({ length: 8 }, (_, index) => (
          <li key={index} className="product-card">
            <span className="skeleton skeleton--media" />
            <div className="product-card__body">
              <span className="skeleton skeleton--line" />
              <span className="skeleton skeleton--line skeleton--short" />
            </div>
          </li>
        ))}
      </ul>
    </Busy>
  );
}

export function ProductSkeleton() {
  return (
    <Busy>
      <div className="product-layout">
        <span className="skeleton skeleton--gallery" />
        <div>
          <span className="skeleton skeleton--title" />
          <span className="skeleton skeleton--line skeleton--short" />
          <span className="skeleton skeleton--line" />
          <span className="skeleton skeleton--line" />
          <span className="skeleton skeleton--block" />
        </div>
      </div>
    </Busy>
  );
}

export function ListSkeleton() {
  return (
    <Busy>
      <span className="skeleton skeleton--title" />
      <div className="stack">
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} className="skeleton skeleton--block" />
        ))}
      </div>
    </Busy>
  );
}
