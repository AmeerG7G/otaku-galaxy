import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/auth/require_auth.dart';
import '../../products/domain/entities/product.dart';
import 'cubit/favorites_cubit.dart';

/// يبدّل حالة المفضلة إن كانت هناك جلسة، أو يعرض دعوة تسجيل الدخول للزائر
/// (المفضلة خاصية حساب — تُخزَّن على الخادم فقط).
Future<void> toggleFavoriteGuarded(
  BuildContext context,
  Product product,
) async {
  final authenticated = await requireAuthentication(
    context,
    title: 'سجّل دخولك أولاً',
    body: 'حفظ المفضلة يحتاج تسجيل الدخول لحسابك في مجرة الأوتاكو.',
  );
  if (!authenticated || !context.mounted) return;
  await context.read<FavoritesCubit>().toggle(product);
}
