// تكامل «إعادة التوفر» و«تفضيلات الإشعارات» مع الخادم.
//
// الضمانتان اللتان تحرسهما هذه الاختبارات هما بالضبط ما كان مكسوراً:
// حالة النفاد التي لا تقدّم للزبون أي إجراء، ومفاتيح تفضيلات لا يعرفها
// الخادم فتُرفض كل محاولة حفظ.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/components/feedback/product_stock_pill.dart';
import 'package:otaku_galaxy/features/settings/data/notification_prefs_storage.dart';

Widget _wrap(Widget child) => MaterialApp(
  home: Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(body: Center(child: child)),
  ),
);

void main() {
  group('حالة المخزون كما يراها الزبون', () {
    // [NOTE] «نفد» لا «نفذ»: الأولى من نَفِدَ أي انتهى، والثانية من نَفَذَ
    // أي مضى واخترق — والمقصود الأولى. القصد الأصلي للاختبار لم يتغيّر:
    // النفاد حالةٌ مؤقّتة تُقال صراحةً، لا «غير متوفر» التي توحي بأن
    // المنتج لم يعد يُباع.
    testWidgets('[CRITICAL] النفاد يُقال «نفد المخزون» لا «غير متوفر»', (
      tester,
    ) async {
      // «غير متوفر» توحي بأن المنتج لم يعد يُباع فيغادر الزبون؛ «نفذ المخزون»
      // تصف حالةً مؤقّتة يمكن انتظارها — وهي المقدّمة المنطقية لزرّ
      // «أعلمني عند توفر المنتج».
      await tester.pumpWidget(_wrap(const ProductStockPill(stock: 0)));
      expect(find.text('نفد المخزون'), findsOneWidget);
      expect(find.text('غير متوفر حالياً'), findsNothing);
    });

    testWidgets('المخزون المنخفض يبقى كما هو — لم تتغيّر بقية الحالات', (
      tester,
    ) async {
      await tester.pumpWidget(_wrap(const ProductStockPill(stock: 2)));
      expect(find.text('آخر 2 قطع'), findsOneWidget);
    });
  });

  group('عقد مفاتيح تفضيلات الإشعارات', () {
    test('[CRITICAL] المفاتيح تطابق ما يقبله الخادم حرفاً بحرف', () {
      // القيد في القاعدة (`user_notification_prefs.key`) والمدقق على الخادم
      // يقبلان هذه الستة لا غير. كان مفتاح عيد الميلاد محلياً `bday` بينما
      // الخادم يسمّيه `birthday`، فكان كل حفظ له سيرتدّ بخطأ تحقّق — عطلٌ
      // ظلّ مستتراً ما دام التطبيق لا يخاطب الخادم أصلاً.
      const serverKeys = {'orders', 'reviews', 'stock', 'offers', 'points', 'birthday'};
      final appKeys = NotificationPref.values.map((p) => p.key).toSet();
      expect(appKeys, serverKeys);
    });

    test('لكل مفتاح افتراضٌ صريح، والعروض وحدها مطفأة', () {
      // الإشعارات الترويجية لا تُرسل إلا بطلب صريح — نفس افتراض الخادم.
      for (final pref in NotificationPref.values) {
        expect(
          pref.defaultValue,
          pref == NotificationPref.offers ? isFalse : isTrue,
          reason: 'الافتراض الخاطئ يجعل الزرّ يخالف ما يفعله الخادم فعلاً',
        );
      }
    });

    test('لا مفتاح مكرَّر ولا فارغ', () {
      final keys = NotificationPref.values.map((p) => p.key).toList();
      expect(keys.toSet().length, keys.length);
      expect(keys.every((k) => k.trim().isNotEmpty), isTrue);
    });
  });
}
