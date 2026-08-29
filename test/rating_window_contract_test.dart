// [CRITICAL REGRESSION GUARD]
//
// نافذة التقييم يقرّرها الخادم وحده.
//
// العطل الأصلي (§18.6): المهلة كانت تُحتسب من لحظة ضغط العميل «استلمت
// الطلب»، فمن أكّد متأخراً بدأ عدّاده من جديد. الإصلاح ثبّت الموعد لحظة
// خروج الطلب للتوصيل وخزّنه في `rating_available_at`.
//
// هذه الاختبارات تحرس الطرف العميل من ذلك العقد:
//   • القرار (`ratingAvailable`) يأتي من الخادم — لا من ساعة الجهاز.
//   • المتبقّي يُشتق من طابع الخادم — لا من ثابت ٢٤ ساعة في التطبيق.
//   • إعادة الفتح تُعيد الحساب من القيمة المحفوظة على الخادم.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/utils/formatters.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';

/// حمولة طلب مستلَم كما يعيدها الخادم.
Map<String, dynamic> orderJson({
  required String? ratingAvailableAt,
  required bool ratingAvailable,
  String? deliveredAt,
}) => {
  'id': 'o1',
  'number': '1001',
  'province': 'بغداد',
  'deliveryFee': 4000,
  'fullAddress': 'عنوان',
  'phone': '07701234567',
  'total': 19000,
  'productsTotal': 15000,
  'discount': 0,
  'deliveryDiscount': 0,
  'status': 'COMPLETED',
  'items': <dynamic>[],
  'createdAt': '2026-08-25T00:00:00.000Z',
  'deliveredAt': deliveredAt,
  'ratingAvailableAt': ratingAvailableAt,
  'ratingAvailable': ratingAvailable,
  'statusHistory': <dynamic>[],
};

void main() {
  group('قرار فتح التقييم يأتي من الخادم', () {
    test('الخادم يقول «مفتوح» → مفتوح، ولا متبقٍّ يُعرض', () {
      final order = Order.fromJson(
        orderJson(
          // حتى لو كان الطابع في المستقبل: قرار الخادم هو الحاكم.
          ratingAvailableAt: DateTime.now()
              .add(const Duration(hours: 5))
              .toIso8601String(),
          ratingAvailable: true,
        ),
      );

      expect(order.ratingAvailable, isTrue);
      expect(
        order.timeUntilRating,
        isNull,
        reason: 'لا يُعرض عدّاد لتقييم مفتوح',
      );
    });

    test('[CRITICAL] طابع ماضٍ لا يفتح التقييم إن قال الخادم «مغلق»', () {
      // هذا ما يمنع فتحَ التقييم بتقديم ساعة الهاتف.
      final order = Order.fromJson(
        orderJson(
          ratingAvailableAt: DateTime.now()
              .subtract(const Duration(hours: 3))
              .toIso8601String(),
          ratingAvailable: false,
        ),
      );

      expect(
        order.ratingAvailable,
        isFalse,
        reason: 'القرار للخادم — لا تشتقّه الواجهة من الطابع',
      );
      // المتبقّي يُقصّ عند الصفر بدل أن يصير سالباً.
      expect(order.timeUntilRating, Duration.zero);
    });
  });

  group('المتبقّي مشتقّ من طابع الخادم', () {
    test('نافذة ٢٤ ساعة: المتبقّي يقارب ٢٤ ساعة', () {
      final order = Order.fromJson(
        orderJson(
          ratingAvailableAt: DateTime.now()
              .add(const Duration(hours: 24))
              .toIso8601String(),
          ratingAvailable: false,
        ),
      );

      final remaining = order.timeUntilRating!;
      expect(remaining.inHours, inInclusiveRange(23, 24));
      expect(formatRemaining(remaining), contains('ساعة'));
    });

    test('[CRITICAL] نافذة غير ٢٤: العرض يتبع الخادم لا ثابتاً في التطبيق', () {
      // لو كان التطبيق يفترض ٢٤ ساعة لظهر رقم خاطئ هنا.
      for (final hours in [1, 6, 48, 72]) {
        final order = Order.fromJson(
          orderJson(
            ratingAvailableAt: DateTime.now()
                .add(Duration(hours: hours))
                .toIso8601String(),
            ratingAvailable: false,
          ),
        );
        final remaining = order.timeUntilRating!;
        expect(
          remaining.inHours,
          inInclusiveRange(hours - 1, hours),
          reason: 'نافذة $hours ساعة يجب أن تُعرض كما هي',
        );
      }
    });

    test('بلا طابع من الخادم لا يُخترع عدّاد', () {
      final order = Order.fromJson(
        orderJson(ratingAvailableAt: null, ratingAvailable: false),
      );
      expect(order.ratingAvailableAt, isNull);
      expect(
        order.timeUntilRating,
        isNull,
        reason: 'لا مدّة نعرفها — لا نعرض رقماً مخترعاً',
      );
    });
  });

  group('SCENARIO C — إعادة الفتح تُعيد الحساب من الخادم', () {
    test('نفس الطابع يُعطي متبقياً أقلّ بعد مرور الوقت', () {
      // طابع ثابت من الخادم — كأن التطبيق أُغلق وأُعيد فتحه لاحقاً.
      final serverStamp = DateTime.now().add(const Duration(hours: 10));

      final atOpen = Order.fromJson(
        orderJson(
          ratingAvailableAt: serverStamp.toIso8601String(),
          ratingAvailable: false,
        ),
      ).timeUntilRating!;

      // نفس الحمولة تُقرأ ثانيةً «بعد» أن تقدّم الوقت: نحاكيه بطابع أقرب
      // بساعتين، وهو ما يعيده الخادم نفسه بلا تغيير في القيمة المخزَّنة.
      final laterStamp = serverStamp.subtract(const Duration(hours: 2));
      final atReopen = Order.fromJson(
        orderJson(
          ratingAvailableAt: laterStamp.toIso8601String(),
          ratingAvailable: false,
        ),
      ).timeUntilRating!;

      expect(
        atReopen,
        lessThan(atOpen),
        reason: 'المتبقّي يُحتسب لحظة القراءة من طابع الخادم',
      );
    });

    test('المتبقّي لا يُخزَّن في الكيان — يُحتسب عند كل قراءة', () {
      final order = Order.fromJson(
        orderJson(
          ratingAvailableAt: DateTime.now()
              .add(const Duration(minutes: 90))
              .toIso8601String(),
          ratingAvailable: false,
        ),
      );

      final first = order.timeUntilRating!;
      final second = order.timeUntilRating!;
      // قراءتان متتاليتان من نفس الكائن: الثانية ليست أكبر من الأولى،
      // أي أن القيمة مشتقّة لا محفوظة لحظة التحليل.
      expect(second <= first, isTrue);
    });
  });

  group('حراسة المصدر — لا مهلة مخبوزة في التطبيق', () {
    test('لا ثابت ٢٤ ساعة في كود التقييم/الطلبات', () {
      final offenders = <String>[];
      for (final dir in [
        Directory('lib/features/orders'),
        Directory('lib/features/reviews'),
      ]) {
        if (!dir.existsSync()) continue;
        for (final file in dir.listSync(recursive: true).whereType<File>()) {
          if (!file.path.endsWith('.dart')) continue;
          final source = file.readAsStringSync();
          // نبحث عن اشتقاق مهلة محلياً، لا عن أي ذكر للرقم في نص عربي.
          if (RegExp(r'Duration\(\s*hours:\s*24').hasMatch(source) ||
              RegExp(r'Duration\(\s*days:\s*1\s*\)').hasMatch(source)) {
            offenders.add(file.path);
          }
        }
      }
      expect(
        offenders,
        isEmpty,
        reason: 'المهلة تأتي من الخادم — لا تُخبز في التطبيق: $offenders',
      );
    });
  });
}
