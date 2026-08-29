import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/errors/app_exception.dart';
import '../../../../core/router/app_router.dart';
import '../cubit/auth_cubit.dart';
import '../widgets/auth_field.dart';
import '../widgets/auth_scaffold.dart';

@RoutePage()
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen>
    with TickerProviderStateMixin {
  final _usernameController = TextEditingController();
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
    _usernameController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
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

  Future<void> _register() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _loading = true);
    try {
      await context.read<AuthCubit>().register(
        username: _usernameController.text.trim(),
        phone: _phoneController.text.trim(),
        password: _passwordController.text,
      );
      if (!mounted) return;
      context.router.push(
        OtpVerificationRoute(phone: _phoneController.text.trim()),
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
          title: 'إنشاء حساب',
          subtitle: 'خطوة وحدة وتصير من سكّان مجرة الأوتاكو.',
          artwork: 'assets/art/opt/a-i0.png',
          artworkHeight: 178,
          artworkWidth: 150,
          artworkBottom: -8,
          form: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // حقل اسم المستخدم
                      AuthField(
                        controller: _usernameController,
                        label: 'اسم المستخدم',
                        hint: 'عمر الطيار',
                        textInputAction: TextInputAction.next,
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'يرجى إدخال اسم المستخدم';
                          }
                          if (value.trim().length < 3) {
                            return 'اسم المستخدم قصير جداً';
                          }
                          return null;
                        },
                      ),

                      const SizedBox(height: 15),

                      // حقل رقم الهاتف
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
                        onSubmitted: (_) => _register(),
                        trailing: IconButton(
                          icon: Icon(
                            _obscure
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                            size: AppDimens.iconMd,
                            color: Theme.of(context).colorScheme.outline,
                          ),
                          onPressed: () => setState(() => _obscure = !_obscure),
                        ),
                        validator: (value) {
                          if (value == null || value.isEmpty) {
                            return 'يرجى إدخال كلمة المرور';
                          }
                          if (value.length < 6) {
                            return 'كلمة المرور قصيرة جداً (6 أحرف على الأقل)';
                          }
                          return null;
                        },
                      ),

                      SizedBox(height: AppDimens.space5),

                      // زر إنشاء الحساب
                      AnimePrimaryButton(
                        label: 'إرسال رمز التحقق',
                        onPressed: _register,
                        loading: _loading,
                        height: AppDimens.buttonHeightXl,
                        borderRadius: AppDimens.radiusMd,
                        gradient: AppColors.ctaGradient,
                      ),

                      SizedBox(height: AppDimens.space3),

                      Text(
                        'بإنشائك حساباً فأنت توافق على شروط الاستخدام وسياسة الخصوصية.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          height: 1.7,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
          footer: Center(
            child: AnimeTextButton(
              label: 'عندك حساب؟ تسجيل الدخول',
              onPressed: () => Navigator.of(context).pop(),
            ),
          ),
        ),
      ),
    );
  }
}
