import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:get_it/get_it.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/errors/app_exception.dart';
import '../../../../core/l10n/app_strings.dart';
import '../../../../core/l10n/gender.dart';
import '../../../../core/router/app_router.dart';
import '../../../../core/utils/iraqi_phone.dart';
import '../../../points/domain/entities/otaku_level.dart';
import '../../../points/domain/repositories/points_repository.dart';
import '../../../visuals/domain/visual_slot.dart';
import '../../domain/entities/account_request.dart';
import '../cubit/auth_cubit.dart';
import '../widgets/auth_scaffold.dart';

/// «نسيت كلمة المرور» — طلبٌ للإدارة، لا رمز.
///
/// ═══ القرار ═══ لا SMS ولا بريد. الزبون يُدخل أربع معلومات تعريف —
/// الرقم، الاسم، الجنس، ومستوى حسابه — تراها الإدارة بجانب حسابه المخزَّن
/// وتقرّر إن كان هو صاحبه. **ليست مصادقة**: تطابقُها كاملاً لا يغيّر كلمة
/// المرور. الإدارة تتحقّق عبر واتساب ثم تضع كلمة مرور جديدة دائمة وتبلّغه
/// بها، فيدخل بها من شاشة الدخول العادية ويغيّرها من الإعدادات إن شاء.
///
/// كانت الشاشة تطلب الرقم وحده ثم تنتقل إلى شاشة رمز — ذلك المسار كلّه
/// محفوظ في `legacy/otp/` خارج البناء.
@RoutePage()
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen>
    with TickerProviderStateMixin {
  final _phoneController = TextEditingController();
  final _usernameController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  AppGender? _gender;
  OtakuLevel? _level;
  List<OtakuLevel> _levels = const [];
  bool _levelsLoading = true;
  bool _levelsFailed = false;
  bool _submitted = false;
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
    _loadLevels();
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _usernameController.dispose();
    _animationController.dispose();
    super.dispose();
  }

  /// السلّم من الخادم — القائمة الوحيدة المعتمدة، لا نسخة محلية تتباعد.
  Future<void> _loadLevels() async {
    setState(() {
      _levelsLoading = true;
      _levelsFailed = false;
    });
    try {
      final levels = await GetIt.I<PointsRepository>().fetchLevels();
      if (!mounted) return;
      setState(() {
        _levels = levels;
        _levelsLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _levelsLoading = false;
        _levelsFailed = true;
      });
    }
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

  Future<void> _pickLevel() async {
    if (_levels.isEmpty) return;
    final picked = await showOtakuPicker<OtakuLevel>(
      context: context,
      title: context.strings('chooseAccountLevel'),
      selected: _level,
      options: [
        for (final level in _levels)
          OtakuPickerOption(
            value: level,
            // الزائر بلا جلسة: لا جنس يُعرف، فالصيغة المحايدة — وبلغة الواجهة.
            label: context.strings.p('levelNumberAndName', {
              'number': '${level.number}',
              'name': level.nameFor(AppGender.unknown, context.language),
            }),
          ),
      ],
    );
    if (picked != null && mounted) setState(() => _level = picked);
  }

  Future<void> _submit() async {
    setState(() => _submitted = true);
    final gender = _gender;
    final level = _level;
    if (!_formKey.currentState!.validate() || gender == null || level == null) {
      return;
    }

    setState(() => _loading = true);
    try {
      await context.read<AuthCubit>().forgotPassword(
        phone:
            normalizeIraqiPhone(
              iraqiPhoneFromLocalDigits(_phoneController.text.trim()),
            ) ??
            iraqiPhoneFromLocalDigits(_phoneController.text.trim()),
        username: _usernameController.text.trim(),
        gender: gender.value!,
        levelKey: level.key,
      );
      if (!mounted) return;
      context.router.replace(
        AccountPendingRoute(kind: AccountRequestKind.passwordReset),
      );
    } catch (e) {
      if (!mounted) return;
      _showErrorSnackBar(_messageOf(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _messageOf(Object e) {
    if (e is AppException) {
      final text = e.localizedMessage(context);
      if (text.trim().isNotEmpty) return text;
    }
    return context.strings('unexpectedError');
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _fadeAnimation,
      child: SlideTransition(
        position: _slideAnimation,
        child: AuthScaffold(
          showBack: true,
          title: context.strings('forgotPasswordTitle'),
          subtitle: context.strings('forgotPasswordIntro'),
          artwork: 'assets/art/opt/a-luffy-kid.png',
          artworkSlot: VisualSlots.forgotPasswordHeader,
          ctaSlot: VisualSlots.forgotPasswordCta,
          ctaArtwork: 'assets/art/opt/a-luffy-kid.png',
          artworkHeight: 166,
          artworkBottom: -6,
          subtitleSpacing: AppDimens.space1,
          form: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AnimeTextField(
                  controller: _phoneController,
                  label: context.strings('phoneNumber'),
                  hint: context.strings('phoneHintExample'),
                  prefixIcon: Icons.phone_outlined,
                  keyboardType: TextInputType.phone,
                  // §49.2: البادئة `07` ثابتة في الحقل والمستخدم يكتب التسعة التي تليها؛
                  // المُنسّق يُسقط `+964`/`00964`/`07` مما يُلصق بدل أن يقصّه.
                  prefixText: kIraqiLocalPrefix,
                  inputFormatters: const [IraqiLocalDigitsFormatter()],
                  textDirection: TextDirection.ltr,
                  textInputAction: TextInputAction.next,
                  maxLength: kIraqiLocalDigits,
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return context.strings('phoneRequiredShort');
                    }
                    if (!isValidIraqiPhone(
                      iraqiPhoneFromLocalDigits(value.trim()),
                    )) {
                      return context.strings('phoneInvalid');
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 15),
                AnimeTextField(
                  controller: _usernameController,
                  label: context.strings('username'),
                  prefixIcon: Icons.person_outline,
                  textInputAction: TextInputAction.done,
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return context.strings('usernameRequired');
                    }
                    if (value.trim().length < 2) {
                      return context.strings('usernameTooShort');
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 15),
                GenderSelector(
                  value: _gender,
                  onChanged: (value) => setState(() => _gender = value),
                  errorText: _submitted && _gender == null
                      ? context.strings('genderRequired')
                      : null,
                ),
                const SizedBox(height: 15),
                _LevelField(
                  label: context.strings('accountLevel'),
                  hint: context.strings('accountLevelHint'),
                  value: _level == null
                      ? null
                      : context.strings.p('levelNumberAndName', {
                          'number': '${_level!.number}',
                          'name': _level!.nameFor(
                            AppGender.unknown,
                            context.language,
                          ),
                        }),
                  placeholder: context.strings('chooseAccountLevel'),
                  loading: _levelsLoading,
                  failed: _levelsFailed,
                  onTap: _pickLevel,
                  onRetry: _loadLevels,
                  errorText: _submitted && _level == null && !_levelsFailed
                      ? context.strings('accountLevelRequired')
                      : null,
                ),
                SizedBox(height: AppDimens.space6),
                AnimePrimaryButton(
                  label: context.strings('submitRequest'),
                  onPressed: _submit,
                  loading: _loading,
                  height: AppDimens.buttonHeightXl,
                ),
                // لا جملة عن «رمز التحقق» تحت الزرّ — أُزيلت بطلب المنتج.
              ],
            ),
          ),
          footer: Center(
            child: AnimeTextButton(
              label: context.strings('haveAccountLogin'),
              onPressed: () => context.router.push(const LoginRoute()),
            ),
          ),
        ),
      ),
    );
  }
}

/// حقل اختيار المستوى — بمظهر حقول النموذج، يفتح ورقة اختيار عند الضغط.
class _LevelField extends StatelessWidget {
  const _LevelField({
    required this.label,
    required this.hint,
    required this.value,
    required this.placeholder,
    required this.loading,
    required this.failed,
    required this.onTap,
    required this.onRetry,
    this.errorText,
  });

  final String label;
  final String hint;
  final String? value;
  final String placeholder;
  final bool loading;
  final bool failed;
  final VoidCallback onTap;
  final VoidCallback onRetry;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: theme.textTheme.labelMedium?.copyWith(
            fontWeight: AppDimens.weightBold,
          ),
        ),
        SizedBox(height: AppDimens.space2),
        InkWell(
          onTap: loading || failed ? null : onTap,
          borderRadius: BorderRadius.circular(AppDimens.radiusMd),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(AppDimens.radiusMd),
              border: Border.all(
                color: errorText != null
                    ? colors.error
                    : theme.colorScheme.outlineVariant,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.military_tech_outlined,
                  size: 20,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: loading
                      ? Text(
                          context.strings('loading'),
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        )
                      : failed
                      ? Text(
                          context.strings('levelsLoadFailed'),
                          // `errorText` لا `error`: الأول رمز نصّ بتباينٍ مقيس،
                          // والثاني رمز مؤشِّر (حدود/أيقونات) — يحرسه
                          // `semantic_text_colors_test.dart`.
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: colors.errorText,
                          ),
                        )
                      : Text(
                          value ?? placeholder,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: value == null
                                ? theme.colorScheme.onSurfaceVariant
                                : theme.colorScheme.onSurface,
                          ),
                        ),
                ),
                if (failed)
                  AnimeTextButton(
                    label: context.strings('retry'),
                    onPressed: onRetry,
                  )
                else if (loading)
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else
                  Icon(
                    Icons.expand_more_rounded,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
              ],
            ),
          ),
        ),
        SizedBox(height: AppDimens.space1),
        Text(
          errorText ?? hint,
          style: theme.textTheme.labelSmall?.copyWith(
            color: errorText != null
                ? colors.errorText
                : theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}
