import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/errors/app_exception.dart';
import '../../../../core/router/app_router.dart';
import '../cubit/auth_cubit.dart';
import '../widgets/auth_field.dart';
import '../widgets/auth_scaffold.dart';
import '../../../settings/data/personalize_storage.dart';
import '../../../../core/di/injection_container.dart';

@RoutePage()
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with TickerProviderStateMixin {
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  bool _obscure = true;
  bool _loading = false;

  late final AnimationController _animationController;
  late final Animation<double> _fadeAnimation;
  late final Animation<Offset> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 800),
      vsync: this,
    );

    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeOut),
    );

    _slideAnimation =
        Tween<Offset>(begin: const Offset(0, 0.3), end: Offset.zero).animate(
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
    _passwordController.dispose();
    _animationController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _loading = true);
    try {
      await context.read<AuthCubit>().login(
        _phoneController.text.trim(),
        _passwordController.text,
      );
      if (!mounted) return;
      context.router.replace(
        sl<PersonalizeStorage>().isDone
            ? const MainNavigationRoute()
            : const PersonalizeRoute(),
      );
    } on AppException catch (e) {
      if (!mounted) return;
      // حساب صحيح لكن رقمه غير مُفعَّل: الخادم أرسل رمزاً جديداً بالفعل،
      // فنأخذ المستخدم إلى شاشة الرمز بدل أن نعرض رفضاً يبدو بلا مخرج.
      if (e.code == 'PHONE_NOT_VERIFIED') {
        _showErrorSnackBar(e.message);
        context.router.push(
          OtpVerificationRoute(phone: _phoneController.text.trim()),
        );
        return;
      }
      _showErrorSnackBar(_messageOf(e));
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

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _fadeAnimation,
      child: SlideTransition(
        position: _slideAnimation,
        child: AuthScaffold(
          title: 'تسجيل الدخول',
          subtitle: 'أدخل رقم هاتفك وكلمة المرور للمتابعة إلى حسابك.',
          artwork: 'assets/art/opt/a-i4.png',
          artworkHeight: 196,
          artworkWidth: 138,
          artworkBottom: -14,
          form: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                          // حقل رقم الهاتف — تسمية فوق الحقل بلا أيقونات.
                          AuthField(
                            controller: _phoneController,
                            label: 'رقم الهاتف',
                            hint: '0770 123 4567',
                            textDirection: TextDirection.ltr,
                            keyboardType: TextInputType.phone,
                            textInputAction: TextInputAction.next,
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

                          const SizedBox(height: 15),

                          // حقل كلمة المرور
                          AuthField(
                            controller: _passwordController,
                            label: 'كلمة المرور',
                            hint: '••••••••',
                            obscureText: _obscure,
                            textInputAction: TextInputAction.done,
                            onSubmitted: (_) => _login(),
                            trailing: IconButton(
                              icon: Icon(
                                _obscure
                                    ? Icons.visibility_outlined
                                    : Icons.visibility_off_outlined,
                                size: AppDimens.iconMd,
                                color: Theme.of(context).colorScheme.outline,
                              ),
                              onPressed: () =>
                                  setState(() => _obscure = !_obscure),
                            ),
                            validator: (value) {
                              if (value == null || value.isEmpty) {
                                return 'يرجى إدخال كلمة المرور';
                              }
                              if (value.length < 6) {
                                return 'كلمة المرور قصيرة جداً';
                              }
                              return null;
                            },
                          ),

                          SizedBox(height: AppDimens.space3),

                          // نسيت كلمة المرور
                          Align(
                            alignment: AlignmentDirectional.centerStart,
                            child: AnimeTextButton(
                              label: 'نسيت كلمة المرور؟',
                              onPressed: () => context.router.push(
                                const ForgotPasswordRoute(),
                              ),
                            ),
                          ),

                          SizedBox(height: AppDimens.space5),

                          // زر تسجيل الدخول
                          AnimePrimaryButton(
                            label: 'تسجيل الدخول',
                            onPressed: _login,
                            loading: _loading,
                            height: AppDimens.buttonHeightXl,
                            borderRadius: AppDimens.radiusMd,
                            gradient: AppColors.ctaGradient,
                          ),
                    ],
                  ),
                ),
          footer: Column(
            children: [
              SizedBox(height: AppDimens.space2),
              AnimeTextButton(
                label: 'ما عندك حساب؟ إنشاء حساب جديد',
                onPressed: () => context.router.push(const RegisterRoute()),
              ),
              // متابعة كزائر (بلا حساب) — تصفّح المتجر مباشرة.
              AnimeTextButton(
                label: 'تصفح كزائر',
                onPressed: () =>
                    context.router.replace(
        sl<PersonalizeStorage>().isDone
            ? const MainNavigationRoute()
            : const PersonalizeRoute(),
      ),
                icon: Icons.arrow_back_ios,
                iconPosition: IconPosition.end,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
