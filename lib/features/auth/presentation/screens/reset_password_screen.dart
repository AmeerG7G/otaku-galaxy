import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/errors/app_exception.dart';
import '../../../../core/router/app_router.dart';
import '../cubit/auth_cubit.dart';

/// شاشة إعادة تعيين كلمة المرور — الخطوة الأخيرة بعد رمز التحقق.
///
/// تطابق كتلة «RESET PASSWORD» في مصدر التصميم: ترويسة بالشعار والعنوان،
/// ثم حقلا كلمة المرور مع رسائل تحقق تحت كل حقل، وزرّ متدرّج مثبّت أسفل
/// الشاشة. عند النجاح نعود لتسجيل الدخول مع إشعار تأكيد.
///
/// الرمز يصل من شاشة التحقق دون استهلاكه على الخادم، لأن نقطة
/// `reset-password` تتحقق منه وتغيّر كلمة المرور في طلب واحد.
@RoutePage()
class ResetPasswordScreen extends StatefulWidget {
  const ResetPasswordScreen({
    super.key,
    required this.phone,
    required this.code,
  });

  final String phone;
  final String code;

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final _newController = TextEditingController();
  final _confirmController = TextEditingController();

  bool _touched = false;
  bool _loading = false;

  /// خطأ قادم من الخادم — غالباً رمز تحقق غير صحيح أو منتهٍ.
  String? _serverError;

  bool get _tooShort => _touched && _newController.text.length < 6;

  bool get _mismatch =>
      _touched &&
      _newController.text.length >= 6 &&
      _newController.text != _confirmController.text;

  @override
  void dispose() {
    _newController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _touched = true;
      _serverError = null;
    });
    if (_newController.text.length < 6 ||
        _newController.text != _confirmController.text) {
      return;
    }

    setState(() => _loading = true);
    try {
      await context.read<AuthCubit>().resetPassword(
        widget.phone,
        widget.code,
        _newController.text,
      );
      if (!mounted) return;
      // استبدال لا إضافة: لا معنى للعودة لشاشة الاستعادة بعد نجاحها.
      context.router.replace(const LoginRoute());
      _showSavedToast();
    } catch (e) {
      if (!mounted) return;
      setState(() => _serverError = _messageOf(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _showSavedToast() {
    final messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        content: const Text('تم تغيير كلمة المرور بنجاح'),
        backgroundColor: context.themeColors.success,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        ),
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      ),
    );
  }

  String _messageOf(Object e) {
    if (e is AppException && e.message.trim().isNotEmpty) return e.message;
    return 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ── الترويسة ──
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 26, 22, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const OtakuStoreLogoSimple(size: 42),
                  const SizedBox(height: 16),
                  Text(
                    'إعادة تعيين كلمة المرور',
                    style: theme.textTheme.headlineSmall?.copyWith(
                      fontFamily: 'Tajawal',
                      fontSize: 24,
                      letterSpacing: -0.4,
                      fontWeight: AppDimens.weightBlack,
                    ),
                  ),
                ],
              ),
            ),

            // ── الحقول ──
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(22, 16, 22, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _FieldLabel('كلمة المرور الجديدة'),
                    const SizedBox(height: 7),
                    AnimeTextField(
                      controller: _newController,
                      obscureText: true,
                      textInputAction: TextInputAction.next,
                      onChanged: (_) => setState(() {}),
                    ),
                    if (_tooShort) ...[
                      const SizedBox(height: 8),
                      const _FieldError(
                        'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
                      ),
                    ],
                    const SizedBox(height: 14),
                    _FieldLabel('تأكيد كلمة المرور'),
                    const SizedBox(height: 7),
                    AnimeTextField(
                      controller: _confirmController,
                      obscureText: true,
                      textInputAction: TextInputAction.done,
                      onChanged: (_) => setState(() {}),
                      onSubmitted: (_) => _submit(),
                    ),
                    if (_mismatch) ...[
                      const SizedBox(height: 8),
                      const _FieldError('كلمتا المرور غير متطابقتين'),
                    ],
                    if (_serverError != null) ...[
                      const SizedBox(height: 16),
                      _ServerErrorCard(
                        message: _serverError!,
                        onChangeCode: () => Navigator.of(context).pop(),
                      ),
                    ],
                  ],
                ),
              ),
            ),

            // ── الإجراء ──
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 14, 22, 26),
              child: AnimePrimaryButton(
                label: 'إعادة تعيين كلمة المرور',
                onPressed: _submit,
                loading: _loading,
                height: AppDimens.buttonHeightXl,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: Text(
        text,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
          fontSize: 12.5,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }
}

class _FieldError extends StatelessWidget {
  const _FieldError(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: Text(
        text,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          fontSize: 11.5,
          color: context.themeColors.error,
        ),
      ),
    );
  }
}

/// خطأ الخادم — يوضّح أن المشكلة غالباً في رمز التحقق ويتيح الرجوع لتعديله
/// دون فقدان السياق.
class _ServerErrorCard extends StatelessWidget {
  const _ServerErrorCard({required this.message, required this.onChangeCode});

  final String message;
  final VoidCallback onChangeCode;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
      decoration: BoxDecoration(
        color: colors.error.withValues(alpha: 0.10),
        border: Border.all(color: colors.error.withValues(alpha: 0.26)),
        borderRadius: BorderRadius.circular(AppDimens.radiusSm),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 20,
            height: 20,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: colors.error,
              shape: BoxShape.circle,
            ),
            child: const Text(
              '!',
              style: TextStyle(
                color: Colors.white,
                fontSize: 12,
                height: 1,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  message,
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    fontSize: 12.5,
                    fontWeight: AppDimens.weightBold,
                    color: colors.error,
                  ),
                ),
                const SizedBox(height: 6),
                GestureDetector(
                  onTap: onChangeCode,
                  child: Text(
                    'تعديل رمز التحقق',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      fontSize: 11.5,
                      fontWeight: AppDimens.weightBold,
                      color: AppColors.secondary,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
