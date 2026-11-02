import { resolveMediaUrl } from './media'

/** ما يحتاجه المعرض من لون — صفّ النموذج أو لون المنتج المحفوظ. */
export interface GalleryColour {
  colorName?: string | null
  imageUrl?: string | null
  isActive?: boolean | null
}

export type GalleryEntry =
  | { kind: 'colour'; ref: string; colourNames: string[] }
  | { kind: 'general'; ref: string; position: number }

export interface CustomerGallery {
  /** المعرض كما يراه الزبون في التطبيق والمتجر، بترتيبه. */
  entries: GalleryEntry[]
  /** صورٌ عامة هي نفسها صورة لونٍ — تظهر مرةً واحدة في موضع اللون. */
  duplicates: Array<{ position: number; colourNames: string[] }>
  /** ألوانٌ موقوفة — صورها لا تظهر للزبون. */
  inactiveColours: number
}

/**
 * المعرض الموحّد للزبون — القاعدة نفسها في التطبيق (`productGalleryImages`)
 * والمتجر (`galleryImages`):
 *
 * ١. صورة كل لونٍ نشط بترتيب الألوان (ترتيب القائمة = `sortOrder`).
 * ٢. ثم الصور العامة بترتيبها (`sort_order`).
 *
 * الصورة تُعرف بمرجعها محلولاً كما يحلّه العميلان، فصورةٌ عامة هي نفسها صورة
 * لونٍ لا تتكرّر — تُعَدّ في [CustomerGallery.duplicates] ولا تُحذف من المنتج.
 */
export function customerGallery(images: readonly (string | null | undefined)[], colours: readonly GalleryColour[]): CustomerGallery {
  const byKey = new Map<string, GalleryEntry>()
  const entries: GalleryEntry[] = []
  const duplicates: CustomerGallery['duplicates'] = []
  let inactiveColours = 0

  for (const colour of colours) {
    if (colour.isActive === false) {
      inactiveColours += 1
      continue
    }
    const ref = colour.imageUrl?.trim()
    const key = resolveMediaUrl(ref)
    if (!ref || !key) continue
    const name = colour.colorName?.trim() ?? ''
    const existing = byKey.get(key)
    if (existing?.kind === 'colour') {
      if (name) existing.colourNames.push(name)
      continue
    }
    const entry: GalleryEntry = { kind: 'colour', ref, colourNames: name ? [name] : [] }
    byKey.set(key, entry)
    entries.push(entry)
  }

  images.forEach((raw, position) => {
    const ref = raw?.trim()
    const key = resolveMediaUrl(ref)
    if (!ref || !key) return
    const existing = byKey.get(key)
    if (existing) {
      if (existing.kind === 'colour') duplicates.push({ position, colourNames: existing.colourNames })
      return
    }
    const entry: GalleryEntry = { kind: 'general', ref, position }
    byKey.set(key, entry)
    entries.push(entry)
  })

  return { entries, duplicates, inactiveColours }
}

/**
 * صورة المنتج في القوائم والبطاقات: أولى الصور العامة كما كانت، وإلا صورة أول
 * لونٍ نشط — كما في التطبيق والمتجر، فلا تُرفع صورة اللون مرةً ثانية.
 */
export function productCover(images: readonly string[], colours: readonly GalleryColour[] = []): string | null {
  const general = images.find((ref) => ref.trim() !== '')
  if (general) return general
  return colours.find((colour) => colour.isActive !== false && colour.imageUrl?.trim())?.imageUrl?.trim() ?? null
}
