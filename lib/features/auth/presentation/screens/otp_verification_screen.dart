import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../cubit/auth_cubit.dart';
import '../widgets/auth_scaffold.dart';
import '../widgets/otp_code_field.dart';
import '../../../settings/data/personalize_storage.dart';
import '../../../../core/config/app_config.dart';
import '../../../../core/di/injection_container.dart';

/// رمز التطوير الثابت — يُعرض فقط حين تسمح الإعدادات (انظر
/// [AppConfig.showDevOtpHint]). الخادم يقرّر فعلياً هل الرمز الثابت مفعَّل
/// عبر `DEV_OTP_ENABLED`، وهو مستحيل في الإنتاج.
const String _devOtp = '123456';

/// سبب طلب رمز التحقق — يحدّد وجهة الشاشة بعد إدخال الرمز.
enum OtpPurpose {
  /// تأكيد حساب جديد: الرمز يُستهلك هنا ثم ننتقل للتخصيص/الرئيسية.
  registration,

  /// استعادة كلمة المرور: الرمز يُمرَّر لشاشة إعادة التعيين، لأن نقطة
  /// `reset-password` تتحقق منه وتغيّر كلمة المرور في طلب واحد.
  passwordReset,
}

@RoutePage()
class OtpVerificationScreen extends StatefulWidget {
  const OtpVerificationScreen({
    super.key,
    required this.phone,
    this.purpose = OtpPurpose.registration,
  });

  final String phone;
  final OtpPurpose purpose;

  @override
  State<OtpVerificationScreen> createState() => _OtpVerificationScreenState();
}

class _OtpVerificationScreenState extends State<OtpVerificationScreen>
    with TickerProviderStateMixin {
  final _otpController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  bool _loading = false;
  int _resendCountdown = 0;

  /// الحالة البصرية لخانات الرمز (فارغ/جارٍ التحقق/خطأ/نجاح).
  OtpFieldStatus _otpStatus = OtpFieldStatus.idle;

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
    final code = _otpController.text.trim();
    if (code.length != 6) {
      setState(() => _otpStatus = OtpFieldStatus.invalid);
      return;
    }

    // استعادة كلمة المرور: لا نتحقق من الرمز هنا لأن التحقق يستهلكه على
    // الخادم، وشاشة إعادة التعيين تحتاجه في نفس الطلب. نمرّره كما هو.
    if (widget.purpose == OtpPurpose.passwordReset) {
      setState(() => _otpStatus = OtpFieldStatus.valid);
      context.router.push(
        ResetPasswordRoute(phone: widget.phone, code: code),
      );
      return;
    }

    setState(() {
      _loading = true;
      _otpStatus = OtpFieldStatus.verifying;
    });
    try {
      await context.read<AuthCubit>().verifyOtp(widget.phone, code);
      if (!mounted) return;
      setState(() => _otpStatus = OtpFieldStatus.valid);
      // مهلة قصيرة ليرى المستخدم حالة النجاح قبل الانتقال.
      await Future.delayed(const Duration(milliseconds: 700));
      if (!mounted) return;
      context.router.replace(
        sl<PersonalizeStorage>().isDone
            ? const MainNavigationRoute()
            : const PersonalizeRoute(),
      );
    } catch (_) {
      if (!mounted) return;
      setState(() => _otpStatus = OtpFieldStatus.invalid);
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
    return FadeTransition(
      opacity: _fadeAnimation,
      child: SlideTransition(
        position: _slideAnimation,
        child: AuthScaffold(
          title: 'رمز التحقق',
          subtitle:
              'أرسلنا رمزاً من ستة أرقام إلى رقم هاتفك عبر رسالة نصية.',
          artwork: 'assets/art/opt/a-i1.png',
          artworkHeight: 190,
          artworkWidth: 142,
          artworkBottom: -10,
          ctaArtWidth: 96,
          form: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Text(
                    widget.phone,
                    textDirection: TextDirection.ltr,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: AppDimens.weightBold,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                ),
                SizedBox(height: AppDimens.space6),

                // خانات الرمز الستّ بحالاتها البصرية.
                OtpCodeField(
                  controller: _otpController,
                  status: _otpStatus,
                  onCompleted: (_) => _verify(),
                ),

                SizedBox(height: AppDimens.space5),
                OtpStatusBanner(status: _otpStatus),

                SizedBox(height: AppDimens.space5),
                AnimePrimaryButton(
                  label: 'تأكيد الرمز',
                  onPressed: _verify,
                  loading: _loading,
                  height: AppDimens.buttonHeightXl,
                  borderRadius: AppDimens.radiusMd,
                  gradient: AppColors.ctaGradient,
                ),

                SizedBox(height: AppDimens.space4),
                Center(
                  child: AnimeTextButton(
                    label: _resendCountdown > 0
                        ? 'إعادة إرسال الرمز بعد $_resendCountdown ث'
                        : 'إعادة إرسال الرمز',
                    onPressed: _resendOtp,
                  ),
                ),
              ],
            ),
          ),
          // ملاحظة رمز التجربة لا تُعرض إلا في بناء تطوير تصحيحي — نسخة
          // الإصدار لا تلمّح إطلاقاً إلى وجود رمز ثابت.
          footer: sl<AppConfig>().showDevOtpHint
              ? Container(
                  padding: EdgeInsets.all(AppDimens.space4),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                    border: Border.all(
                      color: Theme.of(context).colorScheme.outlineVariant,
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.science_outlined,
                        size: AppDimens.iconSm,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                      SizedBox(width: AppDimens.space2),
                      Text(
                        'رمز التجربة: $_devOtp',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ],
                  ),
                )
              : null,
        ),
      ),
    );
  }
}
