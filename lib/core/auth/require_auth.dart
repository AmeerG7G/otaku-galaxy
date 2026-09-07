import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../features/auth/presentation/cubit/auth_cubit.dart';
import '../design_system/design_system.dart';
import '../router/app_router.dart';

/// بوابة المصادقة الموحّدة للتطبيق.
///
/// فحص زائر واحد يخدم كل إجراء يحتاج حساباً (إضافة للسلة، مفضلة، إشعارات،
/// مجموعات، طلبات، إتمام طلب...):
///
/// - مستخدم مسجّل → يعيد `true` فيكمل الإجراء طبيعياً فوراً.
/// - زائر → يعرض ورقة «سجّل دخولك أولاً» ([showLoginGate]) ذاتها المستخدمة
///   في كل مكان، فإن اختار تسجيل الدخول يفتح شاشة الدخول، ثم يعيد `false`
///   فلا يُنفَّذ الإجراء المحمي ولا يُعدَّل أي عنصر خاص بالحساب.
///
/// [onLoginRequested] أُستدعى لحظة اختيار «تسجيل الدخول» (قبل فتح الشاشة) —
/// للمتصل أن يذكّر الوجهة المحمية إن رغب نقل المستخدم إليها بعد نجاح الدخول
/// (غلاف التنقل الرئيسي يخزّن التبويب المطلوب مثلاً). لا يُستدعى لا للزائر
/// الذي ألغى ولا للمسجّل الذي يمرّ فوراً.
///
/// هذا هو السلوك المعياري نفسه المستخدم سابقاً في «أضف للسلة» — أُعيد
/// استخدامه هنا بدل تكرار فحص الزائر في كل شاشة (انظر [requireAuthentication]).
Future<bool> requireAuthentication(
  BuildContext context, {
  String? title,
  String? body,
  VoidCallback? onLoginRequested,
}) async {
  if (context.read<AuthCubit>().isLoggedIn) return true;

  final wantsLogin = await showLoginGate(context, title: title, body: body);
  if (wantsLogin && context.mounted) {
    onLoginRequested?.call();
    context.router.push(const LoginRoute());
  }
  return false;
}
