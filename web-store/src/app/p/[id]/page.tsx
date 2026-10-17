import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AddToCart } from '@/components/AddToCart';
import { ApiError } from '@/lib/api';
import { getProduct, isUuid } from '@/lib/catalog';
import { formatIqd } from '@/lib/format';
import { readSession } from '@/lib/server-session';
import type { Product } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

async function load(id: string): Promise<Product | null> {
  if (!isUuid(id)) return null;
  try {
    return await getProduct(id);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await load((await params).id);
  if (!product) return { title: 'المنتج غير موجود' };
  return {
    title: product.name,
    description: product.description.slice(0, 160) || undefined,
    openGraph: product.images[0] ? { images: [{ url: product.images[0] }] } : undefined,
  };
}

export default async function ProductPage({ params }: Props) {
  const product = await load((await params).id);
  if (!product) notFound();
  const session = await readSession();
  const [main, ...rest] = product.images;

  return (
    <article className="product-layout">
      <div className="gallery">
        <div className="gallery__main">
          {main ? (
            // eslint-disable-next-line @next/next/no-img-element -- media origin is the API's, served as-is
            <img src={main} alt={product.name} width={600} height={600} fetchPriority="high" />
          ) : null}
        </div>
        {rest.length > 0 ? (
          <div className="gallery__thumbs">
            {rest.map((url, index) => (
              // eslint-disable-next-line @next/next/no-img-element -- see above
              <img key={url} src={url} alt={`${product.name} — صورة ${index + 2}`} width={64} height={64} loading="lazy" />
            ))}
          </div>
        ) : null}
      </div>

      <div>
        <h1>{product.name}</h1>
        <p className="price-row">
          <span className="price">{formatIqd(product.price)}</span>
          {product.previousPrice ? <span className="price-previous">{formatIqd(product.previousPrice)}</span> : null}
          {product.discountPercent ? <span className="pill pill-promo">خصم {product.discountPercent}٪</span> : null}
        </p>
        {product.hasDeliveryPromo && product.deliveryPromoAmount > 0 ? (
          <p className="pill pill-promo">خصم {formatIqd(product.deliveryPromoAmount)} من التوصيل</p>
        ) : null}
        {product.stock > 0 && product.stock <= 3 ? <p className="pill pill-low">متبقٍّ {product.stock} فقط</p> : null}
        {product.description ? <p>{product.description}</p> : null}
        <AddToCart productId={product.id} stock={product.stock} options={product.options ?? []} signedIn={Boolean(session)} />
        <p className="hint">الدفع عند الاستلام — تتواصل معك الإدارة لتأكيد الطلب.</p>
      </div>
    </article>
  );
}
