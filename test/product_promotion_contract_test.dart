// [CRITICAL REGRESSION GUARD]
//
// نفس المنتج كان يظهر مخفَّضاً في شاشة وبلا خصم في أخرى.
//
// السبب كان في الخادم: خمس دوال مختلفة تبني «منتجاً»، وكلٌّ تُسقط حقولاً
// مختلفة. لكن العطل ظهر **صامتاً** في التطبيق تحديداً بسبب هذا الملف:
// `Product.fromJson` يقرأ الحقل الغائب كـ`null`/`0`، والبطاقة تُخفي سطر
// ترويج التوصيل حين يكون المبلغ صفراً. فالنتيجة شاشةٌ ناقصة بلا استثناء
// ولا رسالة خطأ ولا أي أثر يقود إلى السبب.
//
// هذه الاختبارات تثبّت الطرف العميل من العقد: حمولةٌ كاملة كما يعيدها
// الخادم الآن ← منتجٌ يحمل بيانات العرض ← بطاقةٌ تعرضها.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/components/cards/anime_product_card.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';

/// حمولة منتج كما يعيدها **كل** سطح في الخادم بعد توحيد المُحوِّل.
Map<String, dynamic> promotedProductJson() => {
  'id': 'p1',
  'name': 'منتج مخفَّض',
  'description': 'وصف',
  'price': 15000,
  'stock': 7,
  'images': <String>[],
  'categoryId': 'c1',
  'subcategoryId': 's1',
  'isActive': true,
  'isOffer': true,
  'isSelected': true,
  'rating': 4.5,
  'reviewCount': 12,
  'previousPrice': 20000,
  'discountPercent': 25,
  'hasDeliveryPromo': true,
  'deliveryPromoAmount': 2500,
  'franchiseIds': <String>[],
};

Future<void> _pumpCard(WidgetTester tester, Product product) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          body: Center(
            child: SizedBox(
              width: 200,
              child: AnimeProductCard(product: product),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  group('عقد بيانات العرض في نموذج المنتج', () {
    test('الحمولة الكاملة تُقرأ بكل حقول العرض', () {
      final product = Product.fromJson(promotedProductJson());

      expect(product.price, 15000);
      expect(product.previousPrice, 20000);
      expect(product.discountPercent, 25);
      expect(product.hasDiscount, isTrue);
      expect(product.hasDeliveryPromo, isTrue);
      expect(product.deliveryPromoAmount, 2500);
      expect(product.isOffer, isTrue);
      expect(product.isSelected, isTrue);
      expect(product.stock, 7);
      expect(product.inStock, isTrue);
      expect(product.categoryId, 'c1');
      expect(product.subcategoryId, 's1');
    });

    test('غياب الحقول لا يرمي — يهبط صامتاً، وهو سبب صعوبة اكتشاف العطل', () {
      // هذا ليس سلوكاً مرغوباً بل توثيقٌ له: لهذا يجب أن يُحرس العقد على
      // الخادم، فالعميل لن يشتكي أبداً.
      final stripped = promotedProductJson()
        ..remove('previousPrice')
        ..remove('discountPercent')
        ..remove('deliveryPromoAmount');
      final product = Product.fromJson(stripped);

      expect(product.previousPrice, isNull);
      expect(product.discountPercent, isNull);
      expect(product.hasDiscount, isFalse);
      expect(product.deliveryPromoAmount, 0);
    });
  });

  group('بطاقة المنتج تعرض العرض', () {
    testWidgets('شارة نسبة الخصم وسطر خصم التوصيل يظهران', (tester) async {
      await _pumpCard(tester, Product.fromJson(promotedProductJson()));

      expect(find.text('−25٪'), findsOneWidget);
      expect(
        find.textContaining('خصم 2500 د.ع من التوصيل'),
        findsOneWidget,
      );
    });

    testWidgets(
      'بلا deliveryPromoAmount يختفي سطر التوصيل رغم أن hasDeliveryPromo صحيح',
      (tester) async {
        // هذا بالضبط ما كانت تراه المفضلة و«اكتشف» قبل الإصلاح: الشارة
        // مفعّلة على المنتج، والسطر غائب لأن المبلغ لم يصل.
        final stripped = promotedProductJson()..remove('deliveryPromoAmount');
        await _pumpCard(tester, Product.fromJson(stripped));

        expect(find.textContaining('من التوصيل'), findsNothing);
      },
    );

    testWidgets('بلا سعر سابق لا تظهر شارة خصم', (tester) async {
      final plain = promotedProductJson()
        ..remove('previousPrice')
        ..remove('discountPercent')
        ..['isOffer'] = false
        ..['isSelected'] = false;
      await _pumpCard(tester, Product.fromJson(plain));

      expect(find.textContaining('٪'), findsNothing);
    });
  });
}
