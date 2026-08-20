import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../cubit/auth_cubit.dart';

/// رمز التحقق الثابت في بيئة التطوير فقط (VERIFICATION_PROVIDER=development).
const String _devOtp = '123456';

@RoutePage()
class OtpVerificationScreen extends StatefulWidget {
  const OtpVerificationScreen({super.key, required this.phone});

  final String phone;

  @override
  State<OtpVerificationScreen> createState() => _OtpVerificationScreenState();
}

class _OtpVerificationScreenState extends State<OtpVerificationScreen>
    with TickerProviderStateMixin {
  final _otpController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  bool _loading = false;
  int _resendCountdown = 0;

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
    _startResendCountdown();
  }

  void _startResendCountdown() {
    _resendCountdown = 60;
    Future.doWhile(() async {
      await Future.delayed(const Duration(seconds: 1));
      if (!mounted) return false;
      setState(() => _resendCountdown--);
      return _resendCountdown > 0;
    });
  }

  void _resendOtp() async {
    if (_resendCountdown > 0) return;

    try {
      await context.read<AuthCubit>().sendOtp(widget.phone);
      if (!mounted) return;
      _startResendCountdown();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('تم إعادة إرسال رمز التحقق'),
          backgroundColor: context.themeColors.success,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimens.radiusLg),
          ),
          margin: EdgeInsets.all(AppDimens.screenHorizontalPadding),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString()),
          backgroundColor: context.themeColors.error,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimens.radiusLg),
          ),
          margin: EdgeInsets.all(AppDimens.screenHorizontalPadding),
        ),
      );
    }
  }

  Future<void> _verify() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _loading = true);
    try {
      await context.read<AuthCubit>().verifyOtp(
        widget.phone,
        _otpController.text.trim(),
      );
      if (!mounted) return;
      context.router.replace(const MainNavigationRoute());
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString()),
          backgroundColor: context.themeColors.error,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimens.radiusLg),
          ),
          margin: EdgeInsets.all(AppDimens.screenHorizontalPadding),
        ),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _otpController.dispose();
    _animationController.dispose();
    super.dispose();
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
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SizedBox(height: AppDimens.space5),

                      // زر العودة
                      Align(
                        alignment: Alignment.centerRight,
                        child: IconButton(
                          onPressed: () => Navigator.of(context).pop(),
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

                      // الشعار
                      Center(
                        child: OtakuStoreLogo(
                          size: AppDimens.iconLogo * 0.8,
                          animationDuration: const Duration(milliseconds: 2000),
                        ),
                      ),

                      SizedBox(height: AppDimens.space9),

                      // أيقونة التحقق
                      Container(
                        width: AppDimens.avatar3xl,
                        height: AppDimens.avatar3xl,
                        margin: EdgeInsets.symmetric(
                          horizontal: AppDimens.space5,
                        ),
                        decoration: BoxDecoration(
                          gradient: colors.primaryGradient,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: colors.glowPrimary,
                              blurRadius: 20,
                              spreadRadius: 3,
                            ),
                          ],
                        ),
                        child: Icon(
                          Icons.sms_outlined,
                          size: AppDimens.iconHero,
                          color: Colors.white,
                        ),
                      ),

                      SizedBox(height: AppDimens.space7),

                      // العنوان
                      Text(
                        'تأكيد رقم الهاتف',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(
                              fontWeight: AppDimens.weightBold,
                              letterSpacing: AppDimens.letterSpacingTight,
                            ),
                      ),

                      SizedBox(height: AppDimens.space2),

                      Text(
                        'تم إرسال رمز التحقق إلى',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),

                      SizedBox(height: AppDimens.space1),

                      Text(
                        widget.phone,
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(
                              fontWeight: AppDimens.weightBold,
                              color: Theme.of(context).colorScheme.primary,
                            ),
                      ),

                      SizedBox(height: AppDimens.space9),

                      // حقل رمز التحقق
                      AnimeTextField(
                        controller: _otpController,
                        label: 'رمز التحقق',
                        hint: '000000',
                        prefixIcon: Icons.verified_outlined,
                        keyboardType: TextInputType.number,
                        textAlign: TextAlign.center,
                        textInputAction: TextInputAction.done,
                        onSubmitted: (_) => _verify(),
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

                      SizedBox(height: AppDimens.space7),

                      // زر تأكيد
                      AnimePrimaryButton(
                        label: 'تأكيد',
                        onPressed: _verify,
                        loading: _loading,
                        icon: Icons.check_circle_outlined,
                        iconPosition: IconPosition.start,
                        height: AppDimens.buttonHeightXl,
                      ),

                      SizedBox(height: AppDimens.space5),

                      // إعادة إرسال
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            'لم تستلم الرمز؟ ',
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.onSurfaceVariant,
                                ),
                          ),
                          AnimeTextButton(
                            label: _resendCountdown > 0
                                ? 'إعادة الإرسال ($_resendCountdown ث)'
                                : 'إعادة إرسال الرمز',
                            onPressed: _resendOtp,
                          ),
                        ],
                      ),

                      SizedBox(height: AppDimens.space7),

                      // رمز التجربة (للاختبار)
                      Container(
                        padding: EdgeInsets.all(AppDimens.space4),
                        decoration: BoxDecoration(
                          color: Theme.of(
                            context,
                          ).colorScheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(
                            AppDimens.radiusMd,
                          ),
                          border: Border.all(
                            color: Theme.of(context).colorScheme.outlineVariant,
                            width: AppDimens.cardBorderWidth,
                          ),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.science_outlined,
                              size: AppDimens.iconSm,
                              color: Theme.of(
                                context,
                              ).colorScheme.onSurfaceVariant,
                            ),
                            SizedBox(width: AppDimens.space2),
                            Text(
                              'رمز التجربة: $_devOtp',
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(
                                    color: Theme.of(
                                      context,
                                    ).colorScheme.onSurfaceVariant,
                                    fontFamily: 'monospace',
                                  ),
                            ),
                          ],
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
    );
  }
}
