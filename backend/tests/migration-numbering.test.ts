import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * ترقيم الهجرات — حارسُ المستقبل لا مُصحّحُ الماضي.
 *
 * [CRITICAL] الحقيقة التي يقوم عليها هذا الملف: **هوية الهجرة اسمُ ملفّها
 * كاملاً، لا رقمُها**. `schema_migrations.name` يحمل الاسم كاملاً وعليه قيد
 * `UNIQUE`، والمُهاجِر يتخطّى المطبَّق بـ`applied.has(file)` على الاسم
 * الكامل. لذلك رقمان متكرّران (`046_bilingual…` و`046_cart…`) **لا يتصادمان
 * فعلياً**: كلٌّ منهما صفٌّ مستقل، وكلاهما مطبَّق.
 *
 * ومن هنا القاعدة: لا يُعاد تسمية هجرةٍ مطبَّقة أبداً. إعادةُ التسمية تغيّر
 * الهوية، فيرى المُهاجِر ملفاً «جديداً» ويعيد تنفيذ SQL نُفِّذ سلفاً —
 * وهو أخطر بكثير من قبح الترقيم.
 *
 * ما يحرسه هذا الاختبار إذن ليس الماضي بل ما يُضاف غداً: تكرارُ رقمٍ جديد
 * يجعل ترتيب التنفيذ معتمداً على بقية الاسم وحدها، وهو ترتيبٌ يسهل أن
 * يخالف نيّة الكاتب. الملفّان التاريخيّان مستثنيان صراحةً بالاسم.
 */

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/database/migrations',
);

/**
 * ازدواجٌ تاريخيّ مطبَّق — يُستثنى بالاسم لا بالرقم.
 *
 * إدراجُهما هنا توثيقٌ لا تهاون: أي رقمٍ مكرّر آخر يسقط الاختبار، وحذفُ
 * أحد هذين الاسمين من القائمة يسقطه أيضاً (فلا يُوسَّع الاستثناء صامتاً).
 */
const GRANDFATHERED_DUPLICATE = {
  prefix: '046',
  files: [
    '046_bilingual_content_and_user_language.sql',
    '046_cart_unique_null_option.sql',
  ],
} as const;

async function migrationFiles(): Promise<string[]> {
  return (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
}

describe('ترقيم الهجرات', () => {
  it('[CRITICAL] لا رقم مكرّر جديد — التاريخيّ وحده مستثنى', async () => {
    const files = await migrationFiles();
    const byPrefix = new Map<string, string[]>();
    for (const file of files) {
      const prefix = file.slice(0, file.indexOf('_'));
      byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), file]);
    }

    const offenders: string[] = [];
    for (const [prefix, group] of byPrefix) {
      if (group.length === 1) continue;
      if (prefix === GRANDFATHERED_DUPLICATE.prefix) {
        // الاستثناء يشمل هذين الملفّين بعينهما، فإن انضمّ إليهما ثالثٌ سقط.
        const unexpected = group.filter(
          (f) => !GRANDFATHERED_DUPLICATE.files.includes(f as never),
        );
        if (unexpected.length > 0) {
          offenders.push(`046 اكتسب ملفاً جديداً: ${unexpected.join(', ')}`);
        }
        continue;
      }
      offenders.push(`${prefix}: ${group.join(', ')}`);
    }

    expect(
      offenders,
      'رقمٌ مكرّر جديد. الهوية اسمُ الملفّ كاملاً فلن يتصادما في '
        + '`schema_migrations`، لكن ترتيب التنفيذ يصير رهنَ بقيّة الاسم. '
        + 'اختر رقماً غير مستعمَل — ولا تُعِد تسمية هجرةٍ مطبَّقة لتصحيح '
        + `الترقيم.\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('الملفّان التاريخيّان ما يزالان موجودين بأسمائهما', async () => {
    // إعادةُ تسمية أحدهما تجعل المُهاجِر يعدّه هجرةً جديدة فيعيد تنفيذ
    // SQL مطبَّق. وجودُهما بالاسم شرطٌ لصحّة الاستثناء أعلاه.
    const files = await migrationFiles();
    for (const name of GRANDFATHERED_DUPLICATE.files) {
      expect(files, `اختفت أو أُعيدت تسمية ${name}`).toContain(name);
    }
  });

  it('كل هجرة تبدأ برقمٍ من ثلاث خانات ثم شرطة سفلية', async () => {
    const files = await migrationFiles();
    const malformed = files.filter((f) => !/^\d{3}_[a-z0-9_]+\.sql$/.test(f));
    expect(malformed, `أسماء لا تتبع النمط: ${malformed.join(', ')}`).toEqual([]);
  });

  it('الترتيب المعجميّ حتميّ ولا يتأثّر بترتيب القراءة من القرص', async () => {
    // المُهاجِر يرتّب بـ`.sort()` بعد `readdir`، وترتيبُ `readdir` غير
    // مضمون على كل نظام ملفات. الحتمية هنا شرطُ أن يُنفَّذ 047 بعد كلا 046.
    const files = await migrationFiles();
    const shuffled = [...files].reverse().sort();
    expect(shuffled).toEqual(files);

    const idxBilingual = files.indexOf(GRANDFATHERED_DUPLICATE.files[0]);
    const idxCart = files.indexOf(GRANDFATHERED_DUPLICATE.files[1]);
    expect(idxBilingual).toBeLessThan(idxCart);

    const after = files.filter((f) => Number(f.slice(0, 3)) > 46);
    for (const later of after) {
      expect(files.indexOf(later)).toBeGreaterThan(idxCart);
    }
  });
});
