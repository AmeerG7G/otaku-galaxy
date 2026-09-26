# قفل أسلوب الترجمة السورانية · Sorani Translation Style Lock

**Locale:** `ckb` (Central Kurdish / Sorani, ISO 639-3). **Never `ku`.**
**Status of every string produced under this lock:** `NEEDS_NATIVE_REVIEW`.
No string reaches `NATIVE_APPROVED` without a human native Sorani reviewer.

**Project-level status (2026-09-08):** `PROVISIONALLY ACCEPTED FOR PRODUCTION`
— a product decision taken because the Kurdish user base is currently small.
It is not linguistic approval and does not change any string's review state.
See [`README.md`](README.md).

This lock was derived from the **17 pre-existing Kurdish translations** and from
`lib/core/l10n/glossary.dart`. It was not invented freely: where the shipped 17
already established a pattern, that pattern won.

---

## 1. Register

Second person singular, informal-polite (`تۆ`) — the register Iraqi Kurdish apps
use with customers. Not the literary/formal register, not the plural-of-respect.

| Surface | Style | Example |
|---|---|---|
| Utility button (save/cancel/logout/retry) | **verbal noun** (نازناوی کردار) | `پاشەکەوتکردن` not `پاشەکەوتی بکە` |
| Marketing CTA / discovery prompt | **imperative** — matches the Arabic's own voice | `ئێستا بکڕە`, `بەرهەمەکان بدۆزەوە` |
| Section title | bare noun phrase | `ڕێکخستنەکان` |
| Empty state | full sentence, warm, not literary | `هێشتا هیچ داواکارییەکت نییە` |
| Error | what happened + what to do | `... . دووبارە هەوڵ بدەوە` |
| Notification | short, event-first | `داواکارییەکەت وەرگیرا` |
| Marketing | warmer, may use exclamation | |

**Why verbal nouns for utility buttons:** the shipped 17 already do this —
`save → پاشەکەوتکردن`, `logout → چوونەدەرەوە`, `cancel → پاشگەزبوونەوە`.
Switching to imperatives now would split the UI into two styles. The exception is
deliberate and narrow: `تسوّق الآن` / `اكتشف المنتجات` are imperatives in the
Arabic too, and a marketing CTA phrased as a verbal noun (`کڕین ئێستا`) reads as
a label, not an invitation.

## 2. Punctuation

Arabic-script punctuation, matching the Arabic source's own conventions:

- Comma `،` · semicolon `؛` · question mark `؟`
- Em dash `—` for the "statement — consequence" pattern the Arabic uses
- Ellipsis `…` as one character, never `...`
- Guillemets `«»` for quoting a product/collection name
- Emoji: **kept identically** where the Arabic has them, same position

## 3. Numerals

**Western digits (0-9) in Kurdish, always** — including in the ten keys where the
Arabic legacy uses Arabic-Indic (`الخطوة ١ من ٢`). The product rule is Western
digits; Arabic carries a pre-existing exception (`kPreexistingArabicIndicKeys`),
Kurdish starts clean and does not inherit it.

Dynamic values are never typed into a translation — they arrive through
`{placeholder}` from the app's own formatter.

## 4. Currency

`د.ع` in Arabic → `د.ع` in Kurdish. The unit is not translated or transliterated,
and the price itself always comes from `priceIqd` / the formatter. No exchange
rates, delivery prices, discount percentages or point values are ever typed into
a Kurdish string.

## 5. Gender

Sorani does **not** conjugate the imperative by the addressee's gender. Every
gendered Arabic concept therefore collapses to **one** Kurdish form, supplied via
`Gendered.ckb` in `lib/core/l10n/gender.dart`.

- Do not invent Kurdish male/female variants.
- Do not add a second gender system inside screens.
- Arabic keeps its three forms untouched.

## 6. Locked terminology

From `glossary.dart` — these are not re-decided per screen:

| Concept | Kurdish | Never |
|---|---|---|
| Galaxy Points | `خاڵەکانی گەلاکسی` | `خاڵی گەلاکسی`, `خاڵەکان`, `خاڵەکانی ستۆر` |
| points (generic) | `خاڵ` | |
| discount | `داشکاندن` | |
| birthday discount | `داشکاندنی ڕۆژی لەدایکبوون` | |
| delivery discount | `داشکاندنی گەیاندن` | |
| reward | `خەڵات` | `دیاری` (that is *gift*) |
| gift | `دیاری` | |
| **coming soon** (stock 0 **with** a date) | `بەم زووانە دێتەوە` | |
| **unavailable** (stock 0, no date) | `بەردەست نییە` | |
| available | `بەردەستە` | |
| order | `داواکاری` | `فەرمان` |
| cart | `سەبەتە` | |
| delivery | `گەیاندن` | |
| governorate | `پارێزگا` | |
| review | `هەڵسەنگاندن` | |
| rating (stars) | `پلەدان` | |
| collection | `کۆمەڵە` | |

`بەم زووانە دێتەوە` and `بەردەست نییە` **must never collapse into one string** —
one says "wait, it is coming back", the other says "this is not sold". A test
enforces the distinction.

## 7. Consistency with the backend

`backend/src/domain/notificationTemplates.ts` already ships Kurdish notification
text. Flutter must not contradict it. Shared terms (`داواکاری`, `گەیاندن`,
`خاڵەکانی گەلاکسی`, `هەڵسەنگاندن`, `دیاری`) are identical in both, and
`glossary_test` guards the pair.

The **recipient's locale is the backend's source of truth** for notification
language; Flutter never re-translates a notification body it receives.

## 8. What is never translated

Route names · enum values · API/DB values · Dart identifiers · localization keys ·
server status codes · product/category/collection names (server-owned) · user
content · language endonyms (`العربية`, `کوردی`) · the `د.ع` unit.

## 9. Placeholders

`{name}`, `{count}`, `{percent}`, `{amount}`, `{date}`, … are copied verbatim.
Word order may move freely around them; the set must match Arabic exactly.
A parity test runs over every translated key.

## 10. Length

Kurdish runs longer than Arabic in places. Overflow is fixed by **re-wording the
Kurdish**, never by shrinking fonts, adding `ellipsis`, clipping, or introducing
Kurdish-only widths. The responsive matrix (320/393/430/834/1194 px × text scale
1.0/1.3/2.0) is the arbiter.

---

## Audit of the pre-existing 17 (Rule 35)

All 17 were checked against this lock and the glossary. **None were rewritten.**

| Key | Kurdish | Verdict |
|---|---|---|
| navHome … navAccount (6) | `سەرەکی` `بەشەکان` `کۆمەڵگا` `دڵخوازەکان` `سەبەتە` `هەژمار` | consistent with glossary |
| settings / language / theme | `ڕێکخستنەکان` `زمان` `ڕووکار` | consistent |
| themeLight / themeDark | `ڕووناک` `تاریک` | consistent |
| notifications | `ئاگادارکردنەوەکان` | matches backend glossary |
| galaxyPoints | `خاڵەکانی گەلاکسی` | **locked identity term** |
| myOrders | `داواکارییەکانم` | consistent |
| logout / save | `چوونەدەرەوە` `پاشەکەوتکردن` | establishes the verbal-noun button rule |
| cancel | `پاشگەزبوونەوە` | glossary term, but **13 chars — flagged for width review**, see queue |

One open item, not changed: `cancel = پاشگەزبوونەوە` is the glossary term and is
correct, but it is long for a dialog button beside `حذف`/`إزالة`. Recorded in the
review queue as a width question for the native reviewer, not silently swapped.
