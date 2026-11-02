import 'package:flutter/widgets.dart';
import '../../../l10n/app_strings.dart';
import '../../../../features/products/domain/entities/product.dart';

/// سطر «خصم {amount} د.ع من التوصيل» لمنتجٍ ضمن عرض التوصيل المميّز.
///
/// المصدر الوحيد لنصّ المبلغ: بطاقة المنتج وصفحة التفاصيل تقرآن من هنا فلا
/// يختلف ما يراه الزبون بين الموضعين.
///
/// [CRITICAL] الأهلية والمبلغ كلاهما من الخادم (`hasDeliveryPromo` و
/// `deliveryPromoAmount`، يضبطهما المسؤول لكل منتج) — لا يُكتب هنا ١٠٠٠
/// ولا غيره. لا يُعرض ما لم يوجد مبلغ فعلي: الشارة يجب أن تُترجم دائماً إلى
/// خصم حقيقي يطبّقه الخادم عند إنشاء الطلب.
String? deliveryPromoDiscountLabel(BuildContext context, Product product) {
  if (!product.hasDeliveryPromo) return null;
  final amount = product.deliveryPromoAmount;
  if (amount <= 0) return null;
  return context.strings.p('deliveryDiscountAmount', {
    'amount': amount.toStringAsFixed(0),
  });
}
