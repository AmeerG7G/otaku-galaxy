import { config } from '../config/index.js';
import { db } from '../database/pool.js';
import { mediaRepo } from '../repositories/mediaRepo.js';
import { visualsRepo, type VisualSlotDto } from '../repositories/visualsRepo.js';
import { Errors } from '../utils/errors.js';

/**
 * فتحة كما يقرؤها التطبيق: المفتاح والصورة الفعّالة.
 *
 * `currentUrl` اسمٌ على السلك بقي كما كان (إصداراتُ التطبيق المنشورة تقرؤه)؛
 * معناه اليوم: الصورة الواحدة التي يراها الزبون الآن — المؤقّتة السارية أو
 * الدائمة. التطبيق لا يعرف أيّهما ولا يحتاج: الخادم وحده يحكم.
 */
export interface ResolvedSlot {
  slotKey: string;
  currentUrl: string;
}

/** أطول مدّةٍ لصورةٍ مؤقّتة — أطول منها «دائمةٌ» تحت اسمٍ آخر. */
export const TEMPORARY_MAX_DAYS = 366;

export const visualsService = {
  // ── واجهة العميل ──

  /**
   * الإعداد المنشور. الفتحات بلا صورة لا تُذكر إطلاقاً — غيابُها هو إشارة
   * «استعمل الأصل المضمَّن»، وهي الحالة الافتراضية بعد الترقية.
   *
   * `now` و`nextChangeAt` بساعة الخادم: يجدولُ التطبيق بهما إعادةَ جلبٍ
   * واحدة لحظةَ انتهاء أقرب مؤقّتة، فتعود الدائمة عنده في وقتها ولو بقي
   * مفتوحاً — بلا استطلاعٍ دوري ولا اعتمادٍ على ساعة الهاتف.
   *
   * [CRITICAL] القيم الأربع من **لقطةٍ واحدة** للقاعدة (عبارة واحدة في
   * [visualsRepo.published]) — لا تُجمَع من استعلامات مستقلة، وإلا خرج ردٌّ
   * تحمل فتحاتُه مؤقّتةً وبصمتُه وساعتُه حالةً بعد انتهائها.
   */
  async published(): Promise<{
    slots: ResolvedSlot[];
    version: string;
    now: string;
    nextChangeAt: string | null;
  }> {
    const snapshot = await visualsRepo.published(db);
    return {
      version: snapshot.version,
      now: snapshot.now.toISOString(),
      nextChangeAt: snapshot.nextChangeAt?.toISOString() ?? null,
      slots: snapshot.slots.map((slot) => ({ slotKey: slot.slotKey, currentUrl: slot.activeImageUrl })),
    };
  },

  // ── لوحة التحكم ──

  /**
   * الفتحات للوحة التحكم — `activeImageUrl` هي ما يراه الزبون الآن.
   *
   * `timezone` منطقة المتجر (`config.storeTimezone`): «مؤقّتة حتى يوم» سؤالٌ
   * تقويمي، واللوحة تحوّل اليوم المختار إلى نهايته بهذه المنطقة — لا بمنطقة
   * متصفح المسؤول — كما تُحسب أعياد الميلاد. الخادم يعلنها ولا يفترضها أحد.
   */
  async listForAdmin(): Promise<{ items: VisualSlotDto[]; timezone: string }> {
    return { items: await visualsRepo.listAll(db), timezone: config.storeTimezone };
  },

  /**
   * يضع الصورة الدائمة للفتحة (استبدالٌ كامل — لا قائمة).
   *
   * لا يلمس المؤقّتة: إن كانت مؤقّتةٌ سارية بقيت هي المعروضة حتى تنتهي،
   * ثم تظهر هذه.
   */
  async setImage(slotId: string, url: string) {
    await requireSlot(slotId);
    const media = await resolveSlotUpload(url);
    await visualsRepo.setImage(db, slotId, { url: media.url, mediaId: media.id });
    return (await visualsRepo.findById(db, slotId))!;
  },

  /** يزيل الصورة الدائمة — التطبيق يعود إلى الرسم المضمَّن (ما لم تكن مؤقّتةٌ سارية). */
  async clearImage(slotId: string) {
    const cleared = await visualsRepo.clearImage(db, slotId);
    if (!cleared) throw Errors.notFound('الفتحة غير موجودة');
    return (await visualsRepo.findById(db, slotId))!;
  },

  /**
   * يضع صورةً مؤقّتة إلى لحظةٍ محدّدة. تحلّ محلّ أي مؤقّتةٍ سابقة (واحدة
   * في كل وقت)، ولا تلمس الدائمة أبداً.
   *
   * [CRITICAL] اللحظة تُقاس بساعة **القاعدة** لا بساعة المتصفح ولا بساعة
   * Node — الساعة نفسها التي تقيس سريان المؤقّتة عند كل قراءة، وفي العبارة
   * التي تكتبها. انتهاءٌ في الماضي يُرفض (كان سيضع صورةً لا تظهر لأحد ثم
   * يقول إنها «سارية»)، وأبعد من عامٍ يُرفض (دائمةٌ باسمٍ آخر — الدائمة لها
   * مسارها).
   */
  async setTemporaryImage(slotId: string, url: string, until: string) {
    await requireSlot(slotId);
    const media = await resolveSlotUpload(url);
    const expiresAt = new Date(until);
    if (Number.isNaN(expiresAt.getTime())) {
      throw Errors.badRequest('لحظة الانتهاء غير صالحة', 'TEMPORARY_UNTIL_INVALID');
    }
    const verdict = await visualsRepo.setTemporaryImage(db, slotId, {
      url: media.url,
      mediaId: media.id,
      until: expiresAt,
      maxDays: TEMPORARY_MAX_DAYS,
    });
    if (verdict === 'past') {
      throw Errors.badRequest('لحظة الانتهاء يجب أن تكون في المستقبل', 'TEMPORARY_UNTIL_PAST');
    }
    if (verdict === 'too_far') {
      throw Errors.badRequest(
        `الصورة المؤقّتة لا تتجاوز ${TEMPORARY_MAX_DAYS} يوماً — للصورة الدائمة مسارها`,
        'TEMPORARY_UNTIL_TOO_FAR',
      );
    }
    if (verdict === 'missing') throw Errors.notFound('الفتحة غير موجودة');
    return (await visualsRepo.findById(db, slotId))!;
  },

  /** ينهي المؤقّتة الآن — الدائمة (أو المضمَّن) تظهر فوراً. الملف يبقى. */
  async clearTemporaryImage(slotId: string) {
    const cleared = await visualsRepo.clearTemporaryImage(db, slotId);
    if (!cleared) throw Errors.notFound('الفتحة غير موجودة');
    return (await visualsRepo.findById(db, slotId))!;
  },
};

async function requireSlot(slotId: string): Promise<void> {
  if (!(await visualsRepo.findById(db, slotId))) throw Errors.notFound('الفتحة غير موجودة');
}

/**
 * [SECURITY] الصورة يجب أن تكون **مرفوعةً من اللوحة لهذا الغرض**: مرجع
 * `/uploads/` يقابله صفّ في `media_files` غرضُه `slot`. لا روابط خارجية
 * (تُحمَّل عند كل زبون من خادمٍ لا نملكه ويمكن أن يبدّل محتواها)، ولا صور
 * زبائن (تقييم أو صورة شخصية) تُنقل إلى واجهة المتجر بمعرّفها.
 *
 * القاعدة نفسها للدائمة والمؤقّتة — مسارٌ واحد فلا تُرخى إحداهما سهواً.
 */
async function resolveSlotUpload(url: string) {
  const trimmed = url.trim();
  if (!trimmed.startsWith(`${config.uploads.publicPath}/`)) {
    throw Errors.badRequest('الصورة يجب أن تكون مرفوعة على الخادم', 'MEDIA_NOT_FOUND');
  }
  const media = await mediaRepo.findByUrl(db, trimmed);
  if (!media) {
    throw Errors.badRequest('هذه الصورة غير مرفوعة على الخادم', 'MEDIA_NOT_FOUND');
  }
  if (media.purpose !== 'slot') {
    throw Errors.badRequest('هذه الصورة لم تُرفع لرسوم الشخصيات', 'MEDIA_NOT_SLOT_UPLOAD');
  }
  return { url: trimmed, id: media.id };
}
