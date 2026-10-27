import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AddToCart } from '@/components/AddToCart';
import { ProductGallery } from '@/components/ProductGallery';
import { VariantSelectionProvider } from '@/components/VariantSelection';
import { ApiError } from '@/lib/api';
import { getProduct, isUuid } from '@/lib/catalog';
import { COMING_SOON, displayRestockAt, formatIqd, formatShortStoreDate, pairOfferLabel, PRICE_COMING_SOON } from '@/lib/format';
import { readSession } from '@/lib/server-session';
import type { Product } from '@/lib/types';
import { customerVariants } from '@/lib/variants';

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
  // The app's `displayRestockAt` rule — see `lib/format.ts`.
  const restockOn = displayRestockAt(product);
  // Colours (STEP 74): inactive ones are never shown; the chosen colour's image
  // leads the gallery and its stock bounds the cart.
  const variants = customerVariants(product);
  const hasColors = variants.length > 0;

  const article = (
    <article className="product-layout">
      <ProductGallery images={product.images} alt={product.name} />

      <div>
        <h1>{product.name}</h1>
        {product.price === null ? (
          // Announced before its price (084): shown, never sold — no add-to-cart,
          // no stock state. The API refuses it at cart, quote and order anyway.
          <>
            <p className="price-soon price-soon--detail">{PRICE_COMING_SOON}</p>
            {restockOn ? <p className="pill pill-low">متوقع التوفر: {formatShortStoreDate(restockOn)}</p> : null}
            {product.description ? <p>{product.description}</p> : null}
            <p className="hint">يُتاح الطلب حين يُعلن السعر.</p>
          </>
        ) : (
          <>
            <p className="price-row">
              <span className="price">{formatIqd(product.price)}</span>
              {product.previousPrice ? <span className="price-previous">{formatIqd(product.previousPrice)}</span> : null}
              {product.discountPercent ? <span className="pill pill-promo">خصم {product.discountPercent}٪</span> : null}
            </p>
            {product.pairPrice != null ? (
              <p className="pill pill-promo pill-offer">
                {pairOfferLabel(product.pairPrice)} بدل {formatIqd(product.price * 2)} — ولو اختلف الخيار
              </p>
            ) : null}
            {product.hasDeliveryPromo && product.deliveryPromoAmount > 0 ? (
              <p className="pill pill-promo">خصم {formatIqd(product.deliveryPromoAmount)} من التوصيل</p>
            ) : null}
            {!hasColors && product.stock > 0 && product.stock <= 3 ? <p className="pill pill-low">متبقٍّ {product.stock} فقط</p> : null}
            {restockOn ? (
              <p className="pill pill-low">
                {COMING_SOON} — متوقع التوفر: {formatShortStoreDate(restockOn)}
              </p>
            ) : null}
            {product.description ? <p>{product.description}</p> : null}
            <AddToCart productId={product.id} stock={product.stock} options={product.options ?? []} signedIn={Boolean(session)} />
            <p className="hint">الدفع عند الاستلام — تتواصل معك الإدارة لتأكيد الطلب.</p>
          </>
        )}
      </div>
    </article>
  );
  return hasColors ? <VariantSelectionProvider variants={variants}>{article}</VariantSelectionProvider> : article;
}
