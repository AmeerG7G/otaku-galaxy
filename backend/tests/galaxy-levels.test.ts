import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { GALAXY_LEVELS, placeOnLadder } from '../src/domain/galaxyPoints.js';
import { api, registerAndLogin } from './helpers.js';

/**
 * سلّم نقاط المجرّة الثابت.
 *
 * حلّت هذه السويت محل `loyalty-levels.test.ts` التي كانت تثبّت المسار
 * «تعديل من اللوحة ← قاعدة ← واجهة العميل». ذلك المسار أُزيل عمداً: السلّم
 * قرار تجاري ثابت لا إعداد. ما يُحرَس الآن نقيضُه — أن السلّم لا يتغيّر، وأن
 * الخادم وحده يضع الزبون عليه، وأن الدفتر لا يُعاد كتابته.
 */
describe('سلّم نقاط المجرّة الثابت', () => {
  let customer: { token: string; userId: string };

  beforeAll(async () => {
    customer = await registerAndLogin();
  });

  /** يضبط رصيد الزبون بحركة دفتر واحدة. */
  async function setBalance(target: number) {
    const { rows } = await db.query<{ balance: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS balance
         FROM points_ledger WHERE user_id = $1`,
      [customer.userId],
    );
    const delta = target - Number(rows[0]!.balance);
    if (delta === 0) return;
    await db.query(
      `INSERT INTO points_ledger (user_id, label, amount, reason)
       VALUES ($1, 'تعديل اختبار', $2, 'manual')`,
      [customer.userId, delta],
    );
  }

  async function summary() {
    const res = await api
      .get('/api/points')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    return res.body.data;
  }

  it('سبعة مستويات بعتبات ثابتة — لا أكثر ولا أقل', async () => {
    const res = await api.get('/api/catalog/loyalty-levels').expect(200);
    const levels = res.body.data.items as { key: string; requiredPoints: number }[];

    expect(levels).toHaveLength(7);
    expect(levels.map((l) => l.requiredPoints)).toEqual([
      0, 100, 250, 400, 600, 800, 1000,
    ]);
    expect(levels.map((l) => l.key)).toEqual([
      'beginner',
      'explorer',
      'voyager',
      'warrior',
      'champion',
      'star',
      'legend',
    ]);
  });

  it('كل مستوى يحمل صيغه العربية الثلاث', async () => {
    const res = await api.get('/api/catalog/loyalty-levels').expect(200);
    const byKey = Object.fromEntries(
      (res.body.data.items as { key: string }[]).map((l) => [l.key, l]),
    ) as Record<string, { nameMale: string; nameFemale: string; nameNeutral: string }>;

    expect(byKey.beginner!.nameMale).toBe('مبتدئ المجرة');
    expect(byKey.beginner!.nameFemale).toBe('مبتدئة المجرة');
    expect(byKey.explorer!.nameMale).toBe('مستكشف المجرة');
    expect(byKey.explorer!.nameFemale).toBe('مستكشفة المجرة');
    expect(byKey.warrior!.nameMale).toBe('محارب المجرة');
    expect(byKey.warrior!.nameFemale).toBe('محاربة المجرة');
    expect(byKey.champion!.nameMale).toBe('بطل المجرة');
    expect(byKey.champion!.nameFemale).toBe('بطلة المجرة');
    expect(byKey.star!.nameMale).toBe('نجم المجرة');
    expect(byKey.star!.nameFemale).toBe('نجمة المجرة');

    // [CRITICAL] «رحّالة» و«أسطورة» لا تتغيّران بالجنس في الفصحى. اشتقاقٌ آلي
    // بإضافة تاء كان سينتج «أسطورةة» — الصيغتان متطابقتان عمداً.
    expect(byKey.voyager!.nameFemale).toBe(byKey.voyager!.nameMale);
    expect(byKey.legend!.nameFemale).toBe(byKey.legend!.nameMale);

    // وللمجهول صيغة محايدة لا المذكّرة.
    expect(byKey.beginner!.nameNeutral).toBe('المستوى المبتدئ');
    expect(byKey.champion!.nameNeutral).not.toBe(byKey.champion!.nameMale);
  });

  /**
   * المبلغ في وصف المزيّة: يُذكر للهدية ولا يُذكر للخصم.
   *
   * الفرق مقصود. قيمة الهدية **هي** المزيّة، فحذفها يترك «هدية من المتجر»
   * بلا معنى ويجعل المستويات الثلاث للهدايا نصّاً واحداً. أما سقف الخصم
   * فقيدٌ على المزيّة لا المزيّة نفسها، وقد طُلب إخفاؤه.
   *
   * [CRITICAL] المبالغ تبقى **بيانات** (`capAmount` / `giftAmount`) في
   * الحالتين لأن الخصم والهدية يُحسبان منها. المحذوف ظهور السقف في النصّ
   * وحده. اختبارٌ يكتفي بفحص النصّ كان سيسمح بحذف البيانات معه فيصمت بينما
   * ينكسر الحساب — لذلك يُفحص الرقم في النصّ **مشتقّاً من البيانات** لا مكتوباً.
   */
  it('وصف الخصم بلا سقف · وصف الهدية بقيمتها · والبيانات سليمة', () => {
    const currency = /دينار|IQD|د\.ع/;
    /** ١٠٬٠٠٠ ← 10_000، بالأرقام العربية-الهندية وفاصل الآلاف نفسه. */
    const arabicAmount = (n: number) =>
      n.toLocaleString('en-US').replace(/,/g, '٬').replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]!);

    for (const level of GALAXY_LEVELS) {
      const where = `المستوى ${level.key}`;

      if (level.reward.kind === 'discount') {
        // لا عملة ولا سقف في النصّ…
        expect(level.rewardLabel, where).not.toMatch(currency);
        expect(level.rewardLabel, where).not.toContain(arabicAmount(level.reward.capAmount));
        // …والنسبة باقية، فالمزيّة ما تزال مفهومة.
        expect(level.rewardLabel, where).toContain(`${arabicAmount(level.reward.percent)}٪`);
      }

      if (level.reward.kind === 'gift') {
        // القيمة مذكورة، ومشتقّة من البيانات لا مكتوبة في الاختبار.
        expect(level.rewardLabel, where).toMatch(currency);
        expect(level.rewardLabel, where).toContain(arabicAmount(level.reward.giftAmount));
      }

      if (level.reward.kind === 'none') {
        expect(level.rewardLabel, where).not.toMatch(currency);
      }
    }

    // البيانات المالية لم تُمسّ — لا للخصم ولا للهدية.
    const byKey = Object.fromEntries(GALAXY_LEVELS.map((l) => [l.key, l.reward]));
    expect(byKey.explorer).toMatchObject({ kind: 'discount', percent: 3, capAmount: 5_000 });
    expect(byKey.voyager).toMatchObject({ kind: 'gift', giftAmount: 5_000 });
    expect(byKey.warrior).toMatchObject({ kind: 'discount', percent: 5, capAmount: 10_000 });
    expect(byKey.champion).toMatchObject({ kind: 'gift', giftAmount: 10_000 });
    expect(byKey.star).toMatchObject({ kind: 'discount', percent: 10, capAmount: 20_000 });
    expect(byKey.legend).toMatchObject({ kind: 'gift', giftAmount: 25_000 });
  });

  it('السلّم يُقرأ بلا مصادقة — الشاشة تعرضه قبل التسجيل', async () => {
    const res = await api.get('/api/catalog/loyalty-levels').expect(200);
    expect((res.body.data.items as unknown[]).length).toBe(7);
  });

  /**
   * كل عتبة، والقيمة التي تسبقها بواحدة، والتي تليها بواحدة.
   *
   * الحدود هي ما ينكسر: خطأ «أكبر من» بدل «أكبر أو يساوي» يظهر عند القيمة
   * المساوية للعتبة بالضبط لا عند غيرها.
   */
  it('الخادم يضع الزبون على السلّم عند كل عتبة وحولها', async () => {
    for (const level of GALAXY_LEVELS) {
      const threshold = level.requiredPoints;

      if (threshold > 0) {
        await setBalance(threshold - 1);
        const below = await summary();
        expect(below.level.requiredPoints, `${threshold}-1`).toBeLessThan(threshold);
      }

      await setBalance(threshold);
      const at = await summary();
      expect(at.level.key, `عند ${threshold}`).toBe(level.key);

      await setBalance(threshold + 1);
      const above = await summary();
      expect(above.level.key, `${threshold}+1`).toBe(level.key);
    }
  });

  it('عند القمة لا مستوى تالٍ ولا نقاط متبقية', async () => {
    await setBalance(1000);
    const top = await summary();
    expect(top.level.key).toBe('legend');
    expect(top.nextLevel).toBeNull();
    expect(top.pointsToNextLevel).toBe(0);
    expect(top.levelProgress).toBe(1);
  });

  it('الزبون الجديد (صفر) يقف على أول مستوى لا خارج السلّم', async () => {
    const fresh = await registerAndLogin();
    const res = await api
      .get('/api/points')
      .set('Authorization', `Bearer ${fresh.token}`)
      .expect(200);
    expect(res.body.data.balance).toBe(0);
    expect(res.body.data.level.key).toBe('beginner');
    expect(res.body.data.nextLevel.requiredPoints).toBe(100);
    expect(res.body.data.pointsToNextLevel).toBe(100);
  });

  /**
   * رصيدٌ كُسب تحت النظام القديم يُقرأ بالسلّم الجديد بلا إعادة كتابة.
   *
   * ١٦٠ نقطة كانت أعلى مستوى قديم؛ تحت السلّم الجديد تقف عند «مستكشف»
   * (١٠٠) وتفتح مزيّته. الدفتر نفسه لم يُمسّ.
   */
  it('[CRITICAL] الأرصدة القديمة تُفسَّر بالسلّم الجديد ولا تُعاد كتابتها', async () => {
    await setBalance(160);
    const before = await db.query<{ n: string }>(
      'SELECT COUNT(*)::text AS n FROM points_ledger WHERE user_id = $1',
      [customer.userId],
    );

    const res = await summary();
    expect(res.balance).toBe(160);
    expect(res.level.key).toBe('explorer');

    const after = await db.query<{ n: string }>(
      'SELECT COUNT(*)::text AS n FROM points_ledger WHERE user_id = $1',
      [customer.userId],
    );
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });

  it('السلّم في الملخّص هو نفسه السلّم العام', async () => {
    const [publicLadder, mine] = await Promise.all([
      api.get('/api/catalog/loyalty-levels').expect(200),
      summary(),
    ]);
    expect(mine.levels).toEqual(publicLadder.body.data.items);
  });

  it('`placeOnLadder` صرفة ومطابقة لما يعيده الخادم', () => {
    expect(placeOnLadder(0).current.key).toBe('beginner');
    expect(placeOnLadder(99).current.key).toBe('beginner');
    expect(placeOnLadder(100).current.key).toBe('explorer');
    expect(placeOnLadder(249).current.key).toBe('explorer');
    expect(placeOnLadder(250).current.key).toBe('voyager');
    expect(placeOnLadder(399).current.key).toBe('voyager');
    expect(placeOnLadder(400).current.key).toBe('warrior');
    expect(placeOnLadder(599).current.key).toBe('warrior');
    expect(placeOnLadder(600).current.key).toBe('champion');
    expect(placeOnLadder(799).current.key).toBe('champion');
    expect(placeOnLadder(800).current.key).toBe('star');
    expect(placeOnLadder(999).current.key).toBe('star');
    expect(placeOnLadder(1000).current.key).toBe('legend');
    expect(placeOnLadder(10_000).current.key).toBe('legend');
  });

  /** الملخّص لم يعد يرسل قيم كسب قابلة للضبط — الشرح ثابت في التطبيق. */
  it('لا `earnRates` في الملخّص بعد تثبيت القواعد', async () => {
    const res = await summary();
    expect(res.earnRates).toBeUndefined();
  });
});
