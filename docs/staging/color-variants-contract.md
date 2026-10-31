# Product colour variants — API contract (STEP 74)

Status: implemented on branch `feat/product-color-variants` (base origin/dev 1572255).
Owner request 2026-10-27: a product can have several colours; each colour has its own
image and its own stock, tracked independently. This file is the single contract the
backend, dashboard, Flutter app and web store implement.

## 1. Data model (migration 087)

`product_variants` — one row per colour of a product.

| column | type | rule |
|---|---|---|
| `id` | UUID PK | stable identity; never an array index |
| `product_id` | UUID → products ON DELETE CASCADE | |
| `color_name` | TEXT | Arabic, trimmed, 1–40 chars, unique per product (case-insensitive) |
| `color_name_ckb` | TEXT NULL | Sorani, optional; `NULL` → Arabic shown (STEP 73 rule) |
| `color_hex` | TEXT NULL | `#RRGGBB` upper-case, optional swatch colour |
| `image_url` | TEXT | required; same rule as product images (`/uploads/…` or http(s)) |
| `stock` | INTEGER ≥ 0 | this colour's stock |
| `is_active` | BOOLEAN | inactive = not for sale, hidden from customers |
| `sort_order` | INTEGER | display order |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

- A product is a **variant product** iff it has at least one `product_variants` row
  (active or not). Otherwise it is a **legacy product** and behaves exactly as before.
- `products.stock` of a variant product is **derived**: the database keeps it equal to
  `SUM(stock)` of its *active* variants (trigger). Every existing reader of
  `products.stock` (catalog, stats, restock, inventory snapshot, old clients) stays correct.
  A direct write of `products.stock` on a variant product is refused by the database.
- No variant is created by the migration: existing products stay legacy with their stock.
- `cart_items.variant_id` (FK, cascade) — cart line identity is
  `(cart, product, variant, option_value)` (NULLS NOT DISTINCT).
- `order_items` snapshot: `variant_id` (no FK, like `product_id`), `variant_color_name`,
  `variant_color_name_ckb`, `variant_color_hex`; `image_url` holds the variant image.

## 2. Product representation (every product the API returns)

```ts
variants: Array<{
  id: string;
  colorName: string;           // resolved for the request language (ckb → Kurdish ?? Arabic)
  colorNameAr: string;
  colorNameCkb: string | null; // null = no Kurdish
  colorHex: string | null;     // '#RRGGBB'
  imageUrl: string;
  stock: number;
  isActive: boolean;
  sortOrder: number;
}>                             // ordered by sortOrder; [] = legacy product
```

Customer clients: hide `isActive: false` variants; a variant with `stock: 0` is shown
as unavailable and cannot be chosen; the product `stock` is the sum of active colours.
If every variant is inactive the product is unavailable.

## 3. Cart

`POST /api/cart` body adds `variantId?: string | null`.

| condition | status | code | Arabic message |
|---|---|---|---|
| product has variants, no `variantId` | 400 | `VARIANT_REQUIRED` | `اختر لون المنتج` |
| `variantId` not a colour of this product (or product has none) | 400 | `INVALID_VARIANT` | `اللون المختار غير موجود لهذا المنتج` |
| variant inactive | 409 | `VARIANT_UNAVAILABLE` | `هذا اللون غير متاح حالياً` |
| variant stock 0 | 409 | `VARIANT_OUT_OF_STOCK` | `هذا اللون نفد من المخزون` |
| quantity over the colour's stock (all cart lines of that colour) | 409 | — | `الكمية المطلوبة تتجاوز المخزون المتاح (N)` (existing) |

Cart line (GET/POST/PATCH responses, sync, checkout quote) adds:
`variantId`, `variantColorName` (Arabic — like the line's legacy `productName`),
`variantColorNameAr`, `variantColorNameCkb` (`null` = no Kurdish), `variantColorHex` — all
`null` for a legacy line. Clients pick the name for the UI language from Ar/Ckb (Kurdish
present, else Arabic), exactly as they do for `productNameAr`/`productNameCkb`. For a variant line `productImage` is the
variant image and `stock` is the variant's stock. Same product in two colours = two lines.

`GET /api/cart` sync: a line whose colour became inactive or 0 → removed (`unavailable`);
over the colour's stock → `reduced`. Adjustments carry the same `variant*` fields.
A legacy line (no variant) of a product that later got colours → removed (`unavailable`).

## 4. Checkout and orders

- Stock pool = the variant for variant lines, the product for legacy lines. The order
  gate, the approval-time deduction (`consumeStockOnApproval`) and the post-approval
  rejection restore all work per pool, under the existing locks (product rows
  `ORDER BY id FOR UPDATE`, then variant rows `ORDER BY id FOR UPDATE`).
- Buying red deducts only red; blue is untouched. Price, pair price and delivery promo
  stay product-level and server-computed.
- `INSUFFICIENT_STOCK`, `VARIANT_UNAVAILABLE` (409) at create; names read «المنتج — اللون».
- `GET /api/orders/checkout-quote` `issues` may contain
  `{ code: 'VARIANT_UNAVAILABLE', productId, variantId }` (`variantId` null = a colourless line
  of a product that now has colours), and `INSUFFICIENT_STOCK` carries `variantId` for a colour
  line (absent for a legacy line). Quote `lines[]` carry `variantId` only for colour lines.
- `/api/catalog/products/:id` and every catalog list return inactive colours with
  `isActive: false`; clients filter them.
- The quote fingerprint includes `variantId` for variant lines only (legacy fingerprints
  are byte-identical).
- Order items (customer and admin) add `variantId`, `variantColorName` (Arabic, like `productName`),
  `variantColorNameAr`, `variantColorNameCkb`, `variantColorHex`; `imageUrl` is the
  colour image **as snapshotted at order time** — editing or deleting the colour later
  never changes an order. Admin order items' `currentStock` is the colour's stock.

## 5. Dashboard

`POST /api/admin/products`: `variants?: VariantInput[]` (default `[]`, max 20).
`VariantInput = { colorName, colorNameCkb?: string|null, colorHex?: string|null, imageUrl, stock, isActive?: boolean }`.
With a non-empty `variants`, `stock` must be omitted (`400 STOCK_PER_VARIANT`).

`PATCH /api/admin/products/:id`: `variants` absent → colours untouched. Present → the
complete ordered list (array order = `sortOrder`):
`{ id?: uuid, colorName, colorNameCkb?, colorHex?, imageUrl, stock, expectedStock?: int, isActive?: boolean }`.

| rule | status | code |
|---|---|---|
| `id` not a colour of this product | 400 | `INVALID_VARIANT` |
| duplicate colour name in the list (trim, case-insensitive) | 400 | `DUPLICATE_VARIANT_COLOR` |
| `expectedStock` ≠ current stock of that colour (under lock) | 409 | `STOCK_CHANGED` |
| `stock` sent while the product has colours after the save | 400 | `STOCK_PER_VARIANT` |
| first colours added while an open order (pending/confirmed/preparing/out for delivery) holds the product | 409 | `PRODUCT_HAS_OPEN_ORDERS` |

An existing colour left out of the list is **deleted** if no order ever referenced it,
otherwise **deactivated** (kept for order history). Removing every colour of a product
that never sold a colour turns it back into a legacy product with stock 0.
A colour's stock going 0 → n while the product total was 0 triggers the existing
«back in stock» notifications (product-level, as before).

## 5a. Customer gallery (decision 2026-10-31, supersedes "the chosen colour's image leads")

The API is unchanged: the product already carries both image sources, and the gallery is derived
from them in each client by the same rule (`productGalleryImages` in the app, `galleryImages` in
the web store, `customerGallery` in the dashboard preview). Nothing is merged or copied in the
database.

| Rule | |
|---|---|
| Sources | `variants[].imageUrl` — each colour's one primary image; `images[]` — general product images (back, side, close-up, packaging), not tied to a colour |
| Order | 1. the image of every **customer-visible** colour (active, by `sortOrder`), 2. then the general images by `sort_order` |
| Identity | the stored media reference, resolved by the client's own `resolveMediaUrl` (the same function for both sources). A general image equal to a colour's image is shown once, in the colour's place; two colours sharing one image show it once. Empty refs are skipped. Nothing is deleted: the duplicate general image stays stored and is only skipped in the gallery (the dashboard preview says so) |
| Inactive colours | never in the gallery. Out-of-stock active colours stay in it (they are shown, disabled, in the picker) |
| Browsing ≠ choosing | swiping, previous/next, dots and thumbnails never change the chosen colour. Choosing a colour (the picker) moves the gallery to that colour's image; the cart receives the chosen `variantId` only |
| First image | the app opens on gallery image 1 with no colour chosen (no default choice, as before). The web store keeps its existing pre-selection of the first in-stock colour and opens on that colour's image |
| Cover (cards, lists, link previews) | the first general image, as before; a coloured product with **no** general image shows its first visible colour's image — so an admin never has to upload a colour's image twice |
| Loading (app) | the shown image and its two neighbours are loaded (`precacheImage`, the same `ImageCache` key as `Image.network`, so one request per URL); a far jump (chosen colour, far dot) jumps instead of animating so the pages in between are never fetched; the slot shows its neutral placeholder until the first decoded frame. Not every image: uploads are stored at full size (up to 2400×2400 ≈ 23 MB decoded) and the 100 MB image cache holds ~4 of them — precaching all was measured to evict and re-download (28 extra downloads for 30 images, ~930 MB peak) |

## 5b. Option kind (STEP 77, migration 090)

`products.variant_kind` (`color` default, `design`, `size`) says what the variants are; the API
returns `variantKind` on products, cart lines and order items (an order item keeps the kind it had
when ordered; NULL in the database reads as `color`). It only names the picker and the line label;
stock, images, cart identity and the gallery rule (§5a) are unchanged. Dashboard: «ماذا تمثّل هذه
الخيارات للزبون؟» on the variants card.

## 6. Known limits (documented, not silent)

- Restock subscriptions stay product-level: they fire when the product total goes
  0 → n, not when one colour returns while another is in stock.
- Colour and option (`product_options`) are independent: a product may have colours
  and, e.g., a size option.
- Old app builds (no colour support) get `400 VARIANT_REQUIRED` when they try to add a
  coloured product; they are never sold a colour they did not choose.
- Kurdish texts added for this feature are drafts awaiting a native speaker.
