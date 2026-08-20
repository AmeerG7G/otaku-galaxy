import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/errors/app_exception.dart';
import '../../../../core/router/app_router.dart';
import '../cubit/auth_cubit.dart';

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
      context.router.replace(const MainNavigationRoute());
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
    final colors = context.themeColors;

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(gradient: colors.surfaceGradient),
        child: SafeArea(
          child: FadeTransition(
            opacity: _fadeAnimation,
            child: SlideTransition(
              position: _slideAnimation,
              child: SingleChildScrollView(
                padding: EdgeInsets.all(AppDimens.screenHorizontalPadding),
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    minHeight:
                        MediaQuery.sizeOf(context).height -
                        2 * AppDimens.screenHorizontalPadding,
                  ),
                  child: IntrinsicHeight(
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          SizedBox(height: AppDimens.space5),

                          // الشعار
                          Center(
                            child: OtakuStoreLogo(
                              size: AppDimens.iconLogo,
                              animationDuration: const Duration(
                                milliseconds: 2000,
                              ),
                            ),
                          ),

                          SizedBox(height: AppDimens.space9),

                          // عنوان الترحيب
                          Text(
                            'مرحباً بعودتك',
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.headlineSmall
                                ?.copyWith(
                                  fontWeight: AppDimens.weightBold,
                                  letterSpacing: AppDimens.letterSpacingTight,
                                ),
                          ),

                          SizedBox(height: AppDimens.space2),

                          Text(
                            'سجل دخولك لمتابعة التسوق',
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.onSurfaceVariant,
                                ),
                          ),

                          SizedBox(height: AppDimens.space9),

                          // حقل رقم الهاتف
                          AnimeTextField(
                            controller: _phoneController,
                            label: 'رقم الهاتف',
                            hint: 'مثال: 07xxxxxxxx',
                            prefixIcon: Icons.phone_outlined,
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

                          SizedBox(height: AppDimens.space5),

                          // حقل كلمة المرور
                          AnimeTextField(
                            controller: _passwordController,
                            label: 'كلمة المرور',
                            hint: 'أدخل كلمة المرور',
                            prefixIcon: Icons.lock_outline,
                            obscureText: _obscure,
                            textInputAction: TextInputAction.done,
                            onSubmitted: (_) => _login(),
                            suffixIcon: IconButton(
                              icon: Icon(
                                _obscure
                                    ? Icons.visibility_outlined
                                    : Icons.visibility_off_outlined,
                                size: AppDimens.iconMd,
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
                            alignment: Alignment.centerLeft,
                            child: AnimeTextButton(
                              label: 'نسيت كلمة المرور؟',
                              onPressed: () => context.router.push(
                                const ForgotPasswordRoute(),
                              ),
                            ),
                          ),

                          SizedBox(height: AppDimens.space7),

                          // زر تسجيل الدخول
                          AnimePrimaryButton(
                            label: 'تسجيل الدخول',
                            onPressed: _login,
                            loading: _loading,
                            icon: Icons.login,
                            iconPosition: IconPosition.start,
                            height: AppDimens.buttonHeightXl,
                          ),

                          SizedBox(height: AppDimens.space9),

                          // فاصل
                          Row(
                            children: [
                              Expanded(child: AnimeDivider()),
                              Padding(
                                padding: EdgeInsets.symmetric(
                                  horizontal: AppDimens.space4,
                                ),
                                child: Text(
                                  'أو',
                                  style: Theme.of(context).textTheme.bodySmall
                                      ?.copyWith(
                                        color: Theme.of(
                                          context,
                                        ).colorScheme.onSurfaceVariant,
                                      ),
                                ),
                              ),
                              Expanded(child: AnimeDivider()),
                            ],
                          ),

                          SizedBox(height: AppDimens.space5),

                          // زر إنشاء حساب
                          AnimeOutlinedButton(
                            label: 'إنشاء حساب جديد',
                            onPressed: () =>
                                context.router.push(const RegisterRoute()),
                            icon: Icons.person_add_outlined,
                            iconPosition: IconPosition.start,
                            height: AppDimens.buttonHeightLg,
                            borderColor: Theme.of(context).colorScheme.primary,
                          ),

                          SizedBox(height: AppDimens.space7),

                          // ملاحظة
                          Text(
                            'بالتسجيل، أنت توافق على شروط الاستخدام وسياسة الخصوصية',
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .onSurfaceVariant
                                      .withValues(alpha: 0.5),
                                ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
