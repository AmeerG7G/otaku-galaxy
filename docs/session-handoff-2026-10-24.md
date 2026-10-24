# Session handoff — 2026-10-24 (integration/step-68)

Worktree `/home/ameer/otaku_galaxy/.claude/worktrees/step-68-integration`, branch `integration/step-68` (local only, **not pushed**). It starts from local `dev` @ `e3def17`, which has 56 unpushed commits that exist only on this machine.

## Recovery
- The cloud branches `origin/claude/clever-brown-b00tod` (4bfaefb) and `origin/claude/compassionate-mayer-61v1pc` (25d1fb0) are both merged here.
- Renumbered: the cloud `071_order_idempotency` is now `083`, and the cloud spec's «STEP 67» is now STEP 68.
- Not recoverable anywhere: the cloud's `744767a`, its STEP 68, `session-handoff.md`, and the old deploy §12.

## Done (committed here)
- Both merges, plus fixes:
  - `withIdempotencyKey` keeps `loyaltyGiftActivated`.
  - The admin antd test was already red on the cloud branch.
- R-17:
  - The web store fails closed without `API_INTERNAL_URL`, and `PORT` sets the port.
  - Compose `ENV_FILE`, `HOST_PORT` and `IMAGE_TAG` are required.
  - Each environment has its own PM2 `cwd`.
  - nginx: certificate first, with rollback on failure.
  - `env -i`, and `build api migrate`.
  - A static guard catches 20 of 20 mutations.
  - An independent review ran; round-two findings are fixed.
  - §13 stays «لا تُشغَّل».
- Feature A, backend only:
  - Migration 084; a NULL price is never 0.
  - Hidden from installed apps unless `X-OG-Unpriced: 1` is sent.
  - `PRODUCT_NOT_PRICED` is returned at cart add, quote and order.
  - 9 tests; a targeted run of 37 files / 627 tests passed.

## Baseline
- Backend: 2000 of 2005 passed. The 5 failures are `performance-audit` [POOL]; they pass alone (2/2). They are suspected to come from CPU load, and a final unloaded full run is still needed.
- Admin: all green when the machine is idle.
- Web store: 46 of 46.

## Not done — next session, in order
1. **Feature B backend.** Only `backend/tests/pair-price.test.ts` is written; it is **uncommitted and red**. To do:
   - Migration 085: `products.pair_price` with CHECK `pair_price >= price AND < 2 * price`, plus `order_items.pair_price`, plus a rollback script.
   - `pairPricedLineTotals` in `domain/orderPricing.ts`: pairs cross options of the same product; the saving goes on the line that completes the pair; lines are ordered by `createdAt`, then `id`.
   - Use it in the cart (`listItems` / `lineTotal` / `pairPrice`), `checkoutQuote`, `create`, and the order-item insert and JSON.
   - Admin create/update `pairPrice`, plus `INVALID_PAIR_PRICE` in both constraint mappers.
2. The dashboard form and list, for both features (an unpriced toggle and pair price).
3. The web store:
   - Send `X-OG-Unpriced: 1`.
   - Show «قريباً — السعر يُعلن لاحقاً» with no add-to-cart.
   - Show the pair-price label, and server line totals in the cart.
   - Handle `PRODUCT_NOT_PRICED` in quote issues.
4. Flutter: `CartItem.lineTotal` must follow `pairPrice` (`cart_item.dart:18`, `cart_screen.dart:326`).
5. Browser checks at 320–1440 px against the real local API, then an independent review, then a full backend run with no other load.
6. Spec STEP 69 and the deploy notes for 083–085.

## Environment
- A throwaway database container `og-step68` runs on 127.0.0.1:55468 (`docker stop og-step68` to remove it).
- Scratch worktree `wt-cm` is in the session scratchpad.
