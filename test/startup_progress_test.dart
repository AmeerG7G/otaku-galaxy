// عقد الإقلاع: شرط انتقال واحد لا شرطان متسابقان.
//
// [CRITICAL] العطب المُصلَح: كان الشريط حركةً زمنية (`AnimationController`
// مدته ٢٫٣ث) والانتقال مؤقّتاً مستقلاً (`Future.delayed` بالمدة نفسها). لا
// يعرف أحدهما الآخر:
//
//   • المؤقّت يبدأ عند `initState`؛ الحركة لا تبدأ إلا مع أول إطار. أيّ
//     تأخّرٍ في أول إطار — وهو الحال في إقلاعٍ يحقن الاعتماديات ويفكّ ترميز
//     صور — يجعل الحركة تنتهي **بعد** المؤقّت، فينتقل التطبيق والشريط لم
//     يبلغ نهايته. هذا ما رآه المستخدم بالضبط.
//   • وفي الاتجاه الآخر: استعادة جلسة بطيئة تترك الشريط عند ١٠٠٪ ينتظر
//     عملاً لا يمثّله.
//
// النموذج هنا يزيل الاحتمالين: `progress` تبلغ ١ إذا وفقط إذا تمّت كل
// الخطوات، وهي وحدها شرط الانتقال.

import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/features/splash/domain/startup_progress.dart';

void main() {
  group('التقدّم يمثّل عملاً حقيقياً', () {
    test('يبدأ من صفر ولا يكتمل', () {
      final startup = StartupProgress();
      addTearDown(startup.dispose);
      expect(startup.progress, 0);
      expect(startup.isComplete, isFalse);
    });

    test('كل خطوة تُقدّم النسبة بمقدارٍ متساوٍ', () {
      final startup = StartupProgress();
      addTearDown(startup.dispose);
      final total = StartupStep.values.length;

      var seen = 0;
      for (final step in StartupStep.values) {
        startup.complete(step);
        seen++;
        expect(startup.progress, closeTo(seen / total, 1e-9));
      }
    });

    test('[CRITICAL] النسبة تبلغ ١ إذا وفقط إذا تمّت كل الخطوات', () {
      for (final omitted in StartupStep.values) {
        final startup = StartupProgress();
        addTearDown(startup.dispose);
        for (final step in StartupStep.values) {
          if (step != omitted) startup.complete(step);
        }
        expect(
          startup.progress,
          lessThan(1),
          reason: 'ناقصة $omitted فلا يجوز بلوغ ١',
        );
        expect(startup.isComplete, isFalse, reason: 'ناقصة $omitted');
      }

      final full = StartupProgress();
      addTearDown(full.dispose);
      for (final step in StartupStep.values) {
        full.complete(step);
      }
      expect(full.progress, 1);
      expect(full.isComplete, isTrue);
    });

    test('[CRITICAL] تكرار الخطوة ليس تقدّماً', () {
      final startup = StartupProgress();
      addTearDown(startup.dispose);
      var notifications = 0;
      startup.addListener(() => notifications++);

      startup.complete(StartupStep.session);
      startup.complete(StartupStep.session);
      startup.complete(StartupStep.session);

      expect(notifications, 1);
      expect(startup.progress, closeTo(1 / StartupStep.values.length, 1e-9));
      expect(startup.isComplete, isFalse);
    });

    test('تمام الخطوات بأي ترتيب يعطي النتيجة نفسها', () {
      final forward = StartupProgress();
      final reverse = StartupProgress();
      addTearDown(forward.dispose);
      addTearDown(reverse.dispose);

      for (final s in StartupStep.values) {
        forward.complete(s);
      }
      for (final s in StartupStep.values.reversed) {
        reverse.complete(s);
      }
      expect(forward.progress, reverse.progress);
      expect(forward.isComplete, reverse.isComplete);
    });

    test('كل خطوة تُخطر المستمعين مرة', () {
      final startup = StartupProgress();
      addTearDown(startup.dispose);
      var n = 0;
      startup.addListener(() => n++);
      for (final s in StartupStep.values) {
        startup.complete(s);
      }
      expect(n, StartupStep.values.length);
    });
  });

  group('[CRITICAL] العطب لا يُكمَل عليه', () {
    test('العطب يمنع الاكتمال مهما تمّ قبله', () {
      final startup = StartupProgress();
      addTearDown(startup.dispose);
      for (final s in StartupStep.values) {
        startup.complete(s);
      }
      expect(startup.isComplete, isTrue);

      startup.fail(Exception('انقطعت الشبكة'));
      expect(startup.hasFailed, isTrue);
      // لا انتقال إلى تطبيقٍ نصفِ مُهيَّأ رغم تمام الخطوات قبل العطب.
      expect(startup.isComplete, isFalse);
    });

    test('لا خطوة تُسجَّل بعد العطب — ولا ١٠٠٪ كاذبة', () {
      final startup = StartupProgress();
      addTearDown(startup.dispose);
      startup.complete(StartupStep.preferences);
      startup.fail(Exception('تعذّرت استعادة الجلسة'));

      final before = startup.progress;
      for (final s in StartupStep.values) {
        startup.complete(s);
      }
      expect(startup.progress, before);
      expect(startup.isComplete, isFalse);
    });

    test('العطب الأول يبقى — لا يُستبدل بعطبٍ لاحق', () {
      final startup = StartupProgress();
      addTearDown(startup.dispose);
      final first = Exception('الأول');
      startup.fail(first);
      startup.fail(Exception('الثاني'));
      expect(startup.failure, same(first));
    });

    test('إعادة المحاولة تُعيد الحالة إلى الصفر', () {
      final startup = StartupProgress();
      addTearDown(startup.dispose);
      startup.complete(StartupStep.preferences);
      startup.fail(Exception('عطب'));

      startup.reset();
      expect(startup.hasFailed, isFalse);
      expect(startup.failure, isNull);
      expect(startup.progress, 0);

      for (final s in StartupStep.values) {
        startup.complete(s);
      }
      expect(startup.isComplete, isTrue);
    });
  });

  group('الخطوات المطلوبة معرَّفة صراحةً', () {
    test('استعادة الجلسة والتفضيلات من الخطوات المطلوبة', () {
      // التوجيه يقرؤهما، فلا يجوز أن يقعا خارج شرط الاكتمال.
      expect(StartupStep.values, contains(StartupStep.session));
      expect(StartupStep.values, contains(StartupStep.preferences));
    });

    test('[CRITICAL] العمل الشبكي غير الحرج ليس خطوة مطلوبة', () {
      // إعدادات المتجر والكتالوج وجلبُ إعداد الرسوم تعمل في الخلفية: إدراجُها
      // هنا كان سيجعل الإقلاع يفشل مع الشبكة. خطوة `visuals` **ليست** ذلك
      // الجلب: هي قراءة الصور المحفوظة من القرص وحده بميزانيةٍ محدودة (انظر
      // `VisualsRepository.warmRestored`) — تتمّ بلا شبكة وبلا محفوظ على حدٍّ
      // سواء، ويحرسها `splash_screen_test` بمستودعٍ يفشل جلبُه.
      final names = StartupStep.values.map((s) => s.name).toList();
      expect(names, isNot(contains('storeSettings')));
      expect(names, isNot(contains('catalog')));
      expect(names, isNot(contains('visualsFetch')));
      expect(names, contains('visuals'));
    });
  });
}
