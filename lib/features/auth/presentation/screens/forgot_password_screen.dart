import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/errors/app_exception.dart';
import '../../../../core/router/app_router.dart';
import '../cubit/auth_cubit.dart';

@RoutePage()
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen>
    with TickerProviderStateMixin {
  final _phoneController = TextEditingController();
  final _otpController = TextEditingController();
  final _passwordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  int _step = 0;
  bool _loading = false;
  bool _obscure = true;

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
    _otpController.dispose();
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

  Future<void> _next() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _loading = true);
    final auth = context.read<AuthCubit>();
    try {
      if (_step == 0) {
        // إرسال رمز التحقق المخصّص لإعادة تعيين كلمة المرور
        // (Purpose: password_reset) — وليس رمز التسجيل.
        await auth.forgotPassword(_phoneController.text.trim());
      } else if (_step == 1) {
        // لا تُتحقق رموز «إعادة التعيين» عبر /auth/verify-otp
        // (فهي تتبع Purpose مختلفاً)؛ تتم المصادقة الفعلية للرمز عند
        // حفظ كلمة المرور الجديدة في /auth/reset-password.
      } else {
        await auth.resetPassword(
          _phoneController.text.trim(),
          _otpController.text.trim(),
          _passwordController.text,
        );
        if (!mounted) return;
        context.router.push(const LoginRoute());
        return;
      }
      if (!mounted) return;
      setState(() {
        if (_step < 2) _step++;
        _animationController.reset();
        _animationController.forward();
      });
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
    final colors = context.themeColors;
    final titles = ['رقم الهاتف', 'رمز التحقق', 'كلمة المرور الجديدة'];
    final subtitles = [
      'أدخل رقم هاتفك لإرسال رمز التحقق',
      'أدخل الرمز المرسل إلى هاتفك',
      'أدخل كلمة المرور الجديدة',
    ];

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
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SizedBox(height: AppDimens.space3),

                      // زر العودة
                      Align(
                        alignment: Alignment.centerRight,
                        child: IconButton(
                          onPressed: () {
                            if (_step > 0) {
                              setState(() {
                                _step--;
                                _animationController.reset();
                                _animationController.forward();
                              });
                            } else {
                              Navigator.of(context).pop();
                            }
                          },
                          icon: Icon(
                            Icons.arrow_forward_ios,
                            size: AppDimens.iconMd,
                          ),
                          style: IconButton.styleFrom(
                            backgroundColor: Theme.of(
                              context,
                            ).colorScheme.surfaceContainerHighest,
                            foregroundColor: Theme.of(
                              context,
                            ).colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ),

                      SizedBox(height: AppDimens.space2),

                      // مؤشر الخطوات
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: List.generate(3, (index) {
                          return Expanded(
                            child: Row(
                              children: [
                                Expanded(
                                  child: AnimatedContainer(
                                    duration: AppDimens.durationNormal,
                                    height: 4,
                                    decoration: BoxDecoration(
                                      gradient: index <= _step
                                          ? colors.primaryGradient
                                          : null,
                                      color: index <= _step
                                          ? null
                                          : Theme.of(
                                              context,
                                            ).colorScheme.outlineVariant,
                                      borderRadius: BorderRadius.circular(
                                        AppDimens.radiusFull,
                                      ),
                                    ),
                                  ),
                                ),
                                if (index < 2)
                                  SizedBox(width: AppDimens.space3),
                              ],
                            ),
                          );
                        }),
                      ),

                      SizedBox(height: AppDimens.space7),

                      // الشعار
                      Center(
                        child: OtakuStoreLogo(
                          size: AppDimens.iconLogo * 0.7,
                          animationDuration: const Duration(milliseconds: 2000),
                        ),
                      ),

                      SizedBox(height: AppDimens.space7),

                      // العنوان
                      Text(
                        titles[_step],
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(
                              fontWeight: AppDimens.weightBold,
                              letterSpacing: AppDimens.letterSpacingTight,
                            ),
                      ),

                      SizedBox(height: AppDimens.space2),

                      Text(
                        subtitles[_step],
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),

                      SizedBox(height: AppDimens.space9),

                      // الحقول حسب الخطوة
                      if (_step == 0) ...[
                        AnimeTextField(
                          controller: _phoneController,
                          label: 'رقم الهاتف',
                          hint: 'مثال: 07xxxxxxxx',
                          prefixIcon: Icons.phone_outlined,
                          keyboardType: TextInputType.phone,
                          textInputAction: TextInputAction.next,
                          onSubmitted: (_) => _next(),
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
                      ] else if (_step == 1) ...[
                        AnimeTextField(
                          controller: _otpController,
                          label: 'رمز التحقق',
                          hint: '000000',
                          prefixIcon: Icons.verified_outlined,
                          keyboardType: TextInputType.number,
                          textAlign: TextAlign.center,
                          textInputAction: TextInputAction.next,
                          onSubmitted: (_) => _next(),
                          validator: (value) {
                            if (value == null || value.trim().isEmpty) {
                              return 'يرجى إدخال رمز التحقق';
                            }
                            if (value.trim().length != 6) {
                              return 'رمز التحقق يجب أن يكون 6 أرقام';
                            }
                            return null;
                          },
                        ),
                      ] else ...[
                        AnimeTextField(
                          controller: _passwordController,
                          label: 'كلمة المرور الجديدة',
                          hint: 'أدخل كلمة المرور الجديدة (6 أحرف على الأقل)',
                          prefixIcon: Icons.lock_outline,
                          obscureText: _obscure,
                          textInputAction: TextInputAction.done,
                          onSubmitted: (_) => _next(),
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
                              return 'يرجى إدخال كلمة المرور الجديدة';
                            }
                            if (value.length < 6) {
                              return 'كلمة المرور قصيرة جداً (6 أحرف على الأقل)';
                            }
                            return null;
                          },
                        ),
                      ],

                      SizedBox(height: AppDimens.space7),

                      // زر التالي/حفظ
                      AnimePrimaryButton(
                        label: _step == 2 ? 'حفظ كلمة المرور' : 'التالي',
                        onPressed: _next,
                        loading: _loading,
                        icon: _step == 2
                            ? Icons.save_outlined
                            : Icons.arrow_back_ios,
                        iconPosition: _step == 2
                            ? IconPosition.start
                            : IconPosition.end,
                        height: AppDimens.buttonHeightXl,
                      ),

                      if (_step == 0) ...[
                        SizedBox(height: AppDimens.space5),
                        AnimeTextButton(
                          label: 'تذكرت كلمة المرور؟ تسجيل الدخول',
                          onPressed: () =>
                              context.router.push(const LoginRoute()),
                        ),
                      ],
                    ],
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
