import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/auth/require_auth.dart';
import '../../../core/design_system/design_system.dart';
import '../../main_navigation/presentation/screens/main_navigation_screen.dart';
import '../../products/domain/entities/product.dart';
import 'cubit/cart_cubit.dart';

/// يضيف منتجاً إلى السلة إن كانت هناك جلسة، أو يعرض دعوة تسجيل الدخول
/// للزائر (السلة خاصية حساب — لا سلة زائر محلية). يعيد `true` عند نجاح
/// الإضافة الفعلية، و`false` غير ذلك (زائر أو فشل الطلب).
Future<bool> addToCartGuarded(
  BuildContext context, {
  required Product product,
  int quantity = 1,
  String? selectedOption,
}) async {
  final authenticated = await requireAuthentication(
    context,
    title: 'سجّل دخولك أولاً',
    body: 'إضافة منتجات للسلة تحتاج تسجيل الدخول لحسابك في مجرة الأوتاكو.',
  );
  if (!authenticated || !context.mounted) return false;
  try {
    final cart = context.read<CartCubit>();
    await cart.add(
      product,
      quantity: quantity,
      selectedOption: selectedOption,
    );
    return true;
  } catch (_) {
    return false;
  }
}

/// تأكيد «تمت إضافة المنتج إلى السلة».
///
/// كل ما يخصّ الشكل والسلوك يقع في [showOtakuSnack]؛ هنا النصّ والإجراء
/// وحدهما. كان هذا الملف يحمل تعريف الشريط كاملاً، فنسخته شاشاتٌ أخرى
/// نسخاً ناقصاً واختلفت مددها وسلوك اختفائها.
void showAddedToCartSnack(BuildContext context) {
  showOtakuSnack(
    context,
    message: 'تمت إضافة المنتج إلى السلة',
    action: SnackBarAction(
      label: 'عرض السلة',
      textColor: AppColors.secondary,
      onPressed: () {
        mainNavIndex.value = MainTab.cart;
        context.router.popUntilRoot();
      },
    ),
  );
}
