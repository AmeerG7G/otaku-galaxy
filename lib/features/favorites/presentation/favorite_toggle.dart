import 'package:flutter/material.dart';
import 'package:auto_route/auto_route.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design_system/design_system.dart';
import '../../../core/router/app_router.dart';
import '../../auth/presentation/cubit/auth_cubit.dart';
import '../../products/domain/entities/product.dart';
import 'cubit/favorites_cubit.dart';

/// يبدّل حالة المفضلة إن كانت هناك جلسة، أو يعرض دعوة تسجيل الدخول للزائر
/// (المفضلة خاصية حساب — تُخزَّن على الخادم فقط).
Future<void> toggleFavoriteGuarded(BuildContext context, Product product) async {
  final auth = context.read<AuthCubit>();
  if (!auth.isLoggedIn) {
    final wantsLogin = await showLoginGate(
      context,
      title: 'سجّل دخولك أولاً',
      body: 'حفظ المفضلة يحتاج تسجيل الدخول لحسابك في مجرة الأوتاكو.',
    );
    if (wantsLogin && context.mounted) {
      context.router.push(const LoginRoute());
    }
    return;
  }
  await context.read<FavoritesCubit>().toggle(product);
}
