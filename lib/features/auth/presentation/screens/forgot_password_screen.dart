import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/errors/app_exception.dart';
import '../../../../core/router/app_router.dart';
import '../cubit/auth_cubit.dart';
import '../widgets/auth_scaffold.dart';
import 'otp_verification_screen.dart' show OtpPurpose;

/// «نسيت كلمة المرور» — رقم الهاتف فقط.
///
/// المصدر يقسّم الاستعادة على ثلاث شاشات: هذه، ثم رمز التحقق، ثم إعادة
/// تعيين كلمة المرور. لا يجمع هذا النموذج الرمز وكلمة المرور معاً.
@RoutePage()
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen>
    with TickerProviderStateMixin {
  final _phoneController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  bool _loading = false;

  late final AnimationController _animationController;
  late final Animation<double> _fadeAnimation;
  late final Animation<Offset> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 600),
      vsync: this,
    );

    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeOut),
    );

    _slideAnimation =
        Tween<Offset>(begin: const Offset(0, 0.2), end: Offset.zero).animate(
          CurvedAnimation(
            parent: _animationController,
            curve: Curves.easeOutCubic,
          ),
        );

    _animationController.forward();
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _animationController.dispose();
    super.dispose();
  }

  void _showErrorSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: context.themeColors.error,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDimens.radiusLg),
        ),
        margin: EdgeInsets.all(AppDimens.screenHorizontalPadding),
      ),
    );
  }

  Future<void> _sendCode() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _loading = true);
    final phone = _phoneController.text.trim();
    try {
      // رمز التحقق المخصّص لإعادة تعيين كلمة المرور (password_reset).
      await context.read<AuthCubit>().forgotPassword(phone);
      if (!mounted) return;
      context.router.push(
        OtpVerificationRoute(phone: phone, purpose: OtpPurpose.passwordReset),
      );
    } catch (e) {
      if (!mounted) return;
      _showErrorSnackBar(_messageOf(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// يعرض رسالة الخطأ الواضحة من الخادم عند توفّرها، مع رسالة عامة غير ذلك.
  String _messageOf(Object e) {
    if (e is AppException && e.message.trim().isNotEmpty) return e.message;
    return 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى';
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _fadeAnimation,
      child: SlideTransition(
        position: _slideAnimation,
        child: AuthScaffold(
          showBack: true,
          title: 'نسيت كلمة المرور',
          subtitle: 'أدخل رقم هاتفك وراح نرسل لك رمز تحقق لإعادة التعيين.',
          artwork: 'assets/art/opt/a-luffy-kid.png',
          artworkHeight: 166,
          artworkBottom: -6,
          form: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AnimeTextField(
                  controller: _phoneController,
                  label: 'رقم الهاتف',
                  hint: '0770 123 4567',
                  prefixIcon: Icons.phone_outlined,
                  keyboardType: TextInputType.phone,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _sendCode(),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return 'يرجى إدخال رقم الهاتف';
                    }
                    if (value.trim().length < 10) {
                      return 'رقم الهاتف غير صحيح';
                    }
                    return null;
                  },
                ),
                SizedBox(height: AppDimens.space6),
                AnimePrimaryButton(
                  label: 'إرسال الرمز',
                  onPressed: _sendCode,
                  loading: _loading,
                  height: AppDimens.buttonHeightXl,
                ),
              ],
            ),
          ),
          footer: Center(
            child: AnimeTextButton(
              label: 'عندك حساب؟ تسجيل الدخول',
              onPressed: () => context.router.push(const LoginRoute()),
            ),
          ),
        ),
      ),
    );
  }
}
