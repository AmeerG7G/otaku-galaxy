import 'package:flutter/material.dart';
import '../../../core/l10n/gender.dart';
import '../../../core/l10n/app_strings.dart';
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
    title: context.gNow(GenderedStrings.loginFirst),
    body: context.strings('loginRequiredForFavorites'),
  );
  if (!authenticated || !context.mounted) return;
  await context.read<FavoritesCubit>().toggle(product);
}
