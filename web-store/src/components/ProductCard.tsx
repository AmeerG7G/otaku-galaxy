import Link from '@/components/Link';
import { formatIqd, pairOfferLabel, PRICE_COMING_SOON } from '@/lib/format';
import type { Product } from '@/lib/types';

/** Mirrors the app's `AnimeProductCard`: image, name, price, previous price, stock state. */
export function ProductCard({ product, eager = false }: { product: Product; eager?: boolean }) {
  const image = product.images[0];
  const outOfStock = product.stock <= 0;
  const pairOffer = product.price === null ? null : pairOfferLabel(product.pairPrice);
  return (
    <Link href={`/p/${product.id}`} className="product-card">
      <div className="product-card__media">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- product images come from the API's media origin as-is
          <img src={image} alt={product.name} width={300} height={300} loading={eager ? 'eager' : 'lazy'} decoding="async" />
        ) : null}
        {product.discountPercent ? <span className="badge">−{product.discountPercent}٪</span> : null}
      </div>
      <div className="product-card__body">
        <span className="product-card__name">{product.name}</span>
        {product.price === null ? (
          <span className="price-soon">{PRICE_COMING_SOON}</span>
        ) : (
          <span className="price-row">
            <span className="price">{formatIqd(product.price)}</span>
            {product.previousPrice ? <span className="price-previous">{formatIqd(product.previousPrice)}</span> : null}
          </span>
        )}
        {pairOffer ? <span className="pill pill-promo pill-offer">{pairOffer}</span> : null}
        {product.price === null ? null : outOfStock ? (
          <span className="pill pill-out">نفدت الكمية</span>
        ) : product.stock <= 3 ? (
          <span className="pill pill-low">كمية محدودة</span>
        ) : null}
      </div>
    </Link>
  );
}

export function ProductGrid({ products }: { products: Product[] }) {
  return (
    <ul className="product-grid">
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard product={product} eager={index < 4} />
        </li>
      ))}
    </ul>
  );
}
