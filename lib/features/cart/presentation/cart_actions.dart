import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design_system/design_system.dart';
import '../../../core/router/app_router.dart';
import '../../auth/presentation/cubit/auth_cubit.dart';
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
  final auth = context.read<AuthCubit>();
  if (!auth.isLoggedIn) {
    final wantsLogin = await showLoginGate(
      context,
      title: 'سجّل دخولك أولاً',
      body: 'إضافة منتجات للسلة تحتاج تسجيل الدخول لحسابك في مجرة الأوتاكو.',
    );
    if (wantsLogin && context.mounted) {
      context.router.push(const LoginRoute());
    }
    return false;
  }
  try {
    await context.read<CartCubit>().add(
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
/// [SnackBar.persist] يُمرَّر صراحةً بـ`false`. منذ Flutter 3.29 صار
/// `persist` يساوي `action != null` افتراضياً، فأي شريط يحمل زرّ إجراء
/// يبقى ظاهراً إلى الأبد: المؤقّت يعمل، وعند انتهائه يرى `persist == true`
/// فيعود دون إخفاء. هذا الشريط يحمل «عرض السلة»، فكان يعلق على الشاشة رغم
/// تحديد مدّة ثلاث ثوانٍ.
///
/// `hideCurrentSnackBar()` قبل العرض يضمن أن إضافة منتج ثانٍ تستبدل الرسالة
/// الأولى بدل أن تصطفّ خلفها.
void showAddedToCartSnack(BuildContext context) {
  final theme = Theme.of(context);
  final colors = context.themeColors;
  // نُمسك المدير قبل العرض: محتوى الشريط يُبنى بسياق آخر، والإمساك هنا
  // يجعل الإخفاء آمناً حتى لو تفكّكت الشاشة التي أطلقت الرسالة.
  final messenger = ScaffoldMessenger.of(context);

  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: theme.colorScheme.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDimens.radiusMd),
          side: BorderSide(color: theme.colorScheme.outlineVariant),
        ),
        margin: const EdgeInsets.all(18),
        duration: const Duration(milliseconds: 1500),
        persist: false,
        // الضغط على الرسالة نفسها يُخفيها فوراً.
        //
        // `hideCurrentSnackBar` هو الطريق الصحيح: `ScaffoldMessenger` يُلغي
        // مؤقّته الداخلي ضمنها ويشغّل حركة الخروج. لا مؤقّت خاص بنا لنُلغيه،
        // فلا مجال لتسريب أو تحديث حالة بعد التخلص.
        content: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => messenger.hideCurrentSnackBar(
            reason: SnackBarClosedReason.dismiss,
          ),
          child: Row(
            children: [
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: colors.successPale,
                  borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                ),
                child: Icon(Icons.check, size: 16, color: colors.success),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'تمت إضافة المنتج إلى السلة',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: AppDimens.weightSemiBold,
                    color: theme.colorScheme.onSurface,
                  ),
                ),
              ),
            ],
          ),
        ),
        action: SnackBarAction(
          label: 'عرض السلة',
          textColor: AppColors.secondary,
          onPressed: () {
            mainNavIndex.value = MainTab.cart;
            context.router.popUntilRoot();
          },
        ),
      ),
    );
}
