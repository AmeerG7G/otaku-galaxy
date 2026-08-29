import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';
import type { MediaPurpose } from '../types/index.js';

/**
 * واجهة سائق التخزين. التنفيذ الحالي يكتب على القرص المحلي ويُقدَّم عبر
 * express.static؛ استبداله بخدمة كائنات (S3/R2) لاحقاً لا يحتاج أي تغيير
 * في الجداول أو المتحكّمات — يكفي تنفيذ آخر لهذه الواجهة.
 */
export interface StorageDriver {
  save(input: {
    buffer: Buffer;
    mimeType: string;
    purpose: MediaPurpose;
  }): Promise<{ storageKey: string; url: string }>;
  remove(storageKey: string): Promise<void>;
}

/** امتدادات مسموح بها فقط — لا نثق بامتداد اسم الملف القادم من العميل. */
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const ALLOWED_IMAGE_MIMES = Object.keys(MIME_EXTENSIONS);

export function extensionFor(mimeType: string) {
  return MIME_EXTENSIONS[mimeType] ?? '';
}

/**
 * التحقق من محتوى الملف نفسه لا من نوعه المعلن.
 *
 * `Content-Type` يتحكّم به العميل بالكامل، فيمكنه إرسال أي بايتات تحت
 * `image/png`. نفحص التوقيع الثنائي (magic bytes) حتى لا يُخزَّن محتوى
 * غير صوري تحت امتداد صورة.
 */
export function sniffImageMime(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length >= 8 && PNG.every((byte, i) => buffer[i] === byte)) {
    return 'image/png';
  }
  // WebP: "RIFF" ثم أربعة بايتات حجم ثم "WEBP".
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

class LocalDiskStorage implements StorageDriver {
  constructor(
    private readonly rootDir: string,
    /** البادئة العامة النسبية (مثل `/uploads`) — بلا أصل. */
    private readonly publicPath: string,
  ) {}

  async save({ buffer, mimeType, purpose }: {
    buffer: Buffer;
    mimeType: string;
    purpose: MediaPurpose;
  }) {
    const extension = extensionFor(mimeType);
    // تقسيم بالسنة/الشهر يمنع تضخّم مجلد واحد بملايين الملفات.
    const now = new Date();
    const folder = `${purpose}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const fileName = `${randomUUID()}${extension}`;
    const storageKey = `${folder}/${fileName}`;

    const absoluteDir = path.join(this.rootDir, folder);
    await mkdir(absoluteDir, { recursive: true });
    await writeFile(path.join(absoluteDir, fileName), buffer);

    // مرجع نسبي عمداً: انظر التعليق على `storage` أدناه.
    return { storageKey, url: `${this.publicPath}/${storageKey}` };
  }

  async remove(storageKey: string) {
    // المفتاح يأتي من قاعدة البيانات؛ نمنع الخروج من جذر التخزين احتياطاً.
    const absolute = path.resolve(this.rootDir, storageKey);
    if (!absolute.startsWith(path.resolve(this.rootDir))) return;
    await unlink(absolute).catch(() => undefined);
  }
}

export const uploadsRoot = path.resolve(process.cwd(), config.uploads.directory);

/**
 * الروابط تُخزَّن **نسبية** (`/uploads/...`) لا مطلقة.
 *
 * الأصل المطلق لا يصلح أن يُخبز وقت الرفع: الخادم نفسه يُرى بعناوين مختلفة
 * حسب العميل — `localhost:4000` من المتصفح وسطح المكتب، و`10.0.2.2:4000` من
 * محاكي أندرويد، وعنوان الشبكة المحلية من هاتف حقيقي، ونطاق آخر في الإنتاج.
 * تخزين `http://localhost:4000/uploads/...` كان يجعل كل صورة يرفعها المسؤول
 * غير قابلة للتحميل على الهاتف، لأن `localhost` هناك هو الهاتف نفسه.
 *
 * التمثيل الآن واحد في كل مكان (مرجع نسبي)، وكل مستهلك يحوّله إلى مطلق
 * مقابل الأصل الذي يعرفه هو: فلاتر عبر `resolveMediaUrl`، ولوحة الإدارة عبر
 * `resolveMediaUrl` في `utils/media.ts`. الروابط الخارجية الكاملة تمرّ كما هي.
 */
export const storage: StorageDriver = new LocalDiskStorage(
  uploadsRoot,
  config.uploads.publicPath,
);
