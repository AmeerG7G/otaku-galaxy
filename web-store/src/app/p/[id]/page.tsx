import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AddToCart } from '@/components/AddToCart';
import { FavoriteButton } from '@/components/FavoriteButton';
import { ProductGallery } from '@/components/ProductGallery';
import { ProductReviews } from '@/components/ProductReviews';
import { ColorRestockList, ProductRestockButton, RestockLoginPrompt } from '@/components/RestockAlerts';
import { VariantSelectionProvider } from '@/components/VariantSelection';
import { ApiError } from '@/lib/api';
import { getProduct, isUuid, listProductReviews } from '@/lib/catalog';
import { coverImage } from '@/lib/gallery';
import { COMING_SOON, displayRestockAt, formatIqd, formatShortStoreDate, pairOfferLabel, PRICE_COMING_SOON } from '@/lib/format';
import { readSession } from '@/lib/server-session';
import type { Product } from '@/lib/types';
import { customerVariants, variantAvailable } from '@/lib/variants';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ reviews?: string }> };

const REVIEWS_PER_PAGE = 10;

/** The product as this visitor sees it: with a customer's session the API adds their own state (`viewer`). */
async function load(id: string): Promise<Product | null> {
  if (!isUuid(id)) return null;
  const session = await readSession();
  try {
    return await getProduct(id, session?.token);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await load((await params).id);
  if (!product) return { title: 'المنتج غير موجود' };
  const cover = coverImage(product);
  return {
    title: product.name,
    description: product.description.slice(0, 160) || undefined,
    openGraph: cover ? { images: [{ url: cover }] } : undefined,
  };
}

/** `?reviews=N` — a positive page number, else the first page. */
function reviewsPage(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1;
}

export default async function ProductPage({ params, searchParams }: Props) {
  const product = await load((await params).id);
  if (!product) notFound();
  const session = await readSession();
  const page = reviewsPage((await searchParams).reviews);
  // One more than shown tells whether a next page exists, without a count query.
  const fetched = await listProductReviews(product.id, page, REVIEWS_PER_PAGE + 1).catch((error: Error) => {
    // The product still renders; the reviews section says it could not load.
    console.error('[page] product reviews failed:', error?.message);
    return null;
  });
  // Favourite and alert state come only with the product read (D5); an older API without `viewer` shows neither.
  const viewer = session ? product.viewer : undefined;
  // The app's `displayRestockAt` rule — see `lib/format.ts`.
  const restockOn = displayRestockAt(product);
  // Colours (STEP 74): inactive ones are never shown; every shown colour's image
  // is in the gallery (the chosen one is focused) and its stock bounds the cart.
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
            {product.stock <= 0 ? (
              viewer ? (
                <ProductRestockButton productId={product.id} initial={viewer.restockSubscribed} />
              ) : !session ? (
                <RestockLoginPrompt productId={product.id} />
              ) : null
            ) : null}
            {viewer && hasColors ? (
              <ColorRestockList
                productId={product.id}
                colors={variants.filter((variant) => !variantAvailable(variant)).map((variant) => ({ id: variant.id, name: variant.colorName, hex: variant.colorHex }))}
                subscribedIds={viewer.restockVariantIds}
              />
            ) : null}
            <p className="hint">الدفع عند الاستلام — تتواصل معك الإدارة لتأكيد الطلب.</p>
          </>
        )}
        {viewer ? <FavoriteButton productId={product.id} initial={viewer.isFavorite} /> : null}
      </div>
    </article>
  );
  const reviews = fetched ? (
    <ProductReviews
      productId={product.id}
      reviews={fetched.slice(0, REVIEWS_PER_PAGE)}
      rating={product.rating ?? null}
      reviewCount={product.reviewCount ?? 0}
      page={page}
      hasMore={fetched.length > REVIEWS_PER_PAGE}
    />
  ) : (
    <p className="hint">تعذّر تحميل التقييمات الآن.</p>
  );
  const content = (
    <>
      {article}
      {reviews}
    </>
  );
  return hasColors ? <VariantSelectionProvider variants={variants}>{content}</VariantSelectionProvider> : content;
}
