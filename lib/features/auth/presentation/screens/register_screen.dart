import 'package:auto_route/auto_route.dart';
import '../../../../core/l10n/app_strings.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/constants/validation_rules.dart';
import '../../../../core/design_system/design_system.dart';
import '../../../../core/errors/app_exception.dart';
import '../../../../core/l10n/gender.dart' show AppGender, GenderedStrings;
import '../../../../core/router/app_router.dart';
import '../../../../core/utils/iraqi_phone.dart';
import '../../domain/entities/account_request.dart';
import '../cubit/auth_cubit.dart' show AuthCubit;
import '../widgets/auth_field.dart';
import '../widgets/auth_scaffold.dart';
import '../../../visuals/domain/visual_slot.dart';

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

  /// اختيار الجنس — لا قيمة افتراضية.
  ///
  /// [CRITICAL] البدء بـ`null` لا بـ`male`. قيمةٌ مختارة سلفاً تجعل نصف
  /// الحسابات تُنشأ باختيارٍ لم يقصده أصحابها لأنهم لم ينتبهوا لحقلٍ يبدو
  /// مملوءاً.
  AppGender? _gender;

  /// تظهر رسالة «اختر الجنس» بعد أول محاولة إرسال لا قبلها.
  bool _submitted = false;

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
    setState(() => _submitted = true);
    // `Form` لا يعرف البطاقتين، فيُفحص الاختيار صراحةً. والخادم يرفض التسجيل
    // بلا جنس على أي حال — هذا الفحص للتجربة لا للأمان.
    final gender = _gender;
    if (!_formKey.currentState!.validate() || gender == null) return;

    setState(() => _loading = true);
    try {
      await context.read<AuthCubit>().register(
        username: _usernameController.text.trim(),
        phone:
            normalizeIraqiPhone(
              iraqiPhoneFromLocalDigits(_phoneController.text.trim()),
            ) ??
            iraqiPhoneFromLocalDigits(_phoneController.text.trim()),
        password: _passwordController.text,
        gender: gender.value!,
      );
      if (!mounted) return;
      // لا شاشة رمز: الطلب قيد مراجعة الإدارة. `replace` لا `push` حتى لا
      // يعود الزبون بالسهم إلى استمارةٍ أُرسلت فعلاً.
      context.router.replace(
        AccountPendingRoute(kind: AccountRequestKind.registration),
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
          title: context.strings('register'),
          // المخاطَب مجهول بالضرورة في هذه الشاشة: لم يُنشأ الحساب بعد ولم
          // يُسأل عن جنسه، فالصيغة المحايدة هي الصحيحة هنا لا المذكّرة.
          // `ofLocale` لا `of`: الثانية تعرف الجنس ولا تعرف اللغة فتُرجع
          // العربية دائماً — فكانت هذه الجملة عربيةً في واجهةٍ كردية.
          subtitle: GenderedStrings.galaxyResident.ofLocale(
            AppGender.unknown,
            context.language,
          ),
          artwork: 'assets/art/opt/a-i0.png',
          artworkSlot: VisualSlots.registerHeader,
          ctaSlot: VisualSlots.registerCta,
          ctaArtwork: 'assets/art/opt/a-i0.png',
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
                  label: context.strings('username'),
                  hint: context.strings('usernameHintExample'),
                  textInputAction: TextInputAction.next,
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return context.strings('usernameRequired');
                    }
                    if (value.trim().length < kUsernameMinLength) {
                      return context.strings('usernameTooShort');
                    }
                    return null;
                  },
                ),

                const SizedBox(height: 15),

                // حقل رقم الهاتف
                AnimeTextField(
                  controller: _phoneController,
                  label: context.strings('phoneNumber'),
                  hint: context.strings('phoneHintExample'),
                  prefixIcon: Icons.phone_outlined,
                  textDirection: TextDirection.ltr,
                  keyboardType: TextInputType.phone,
                  // §49.2: البادئة `07` ثابتة في الحقل والمستخدم يكتب التسعة التي تليها؛
                  // المُنسّق يُسقط `+964`/`00964`/`07` مما يُلصق بدل أن يقصّه.
                  prefixText: kIraqiLocalPrefix,
                  inputFormatters: const [IraqiLocalDigitsFormatter()],
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

                // حقل كلمة المرور
                AuthField(
                  controller: _passwordController,
                  label: context.strings('password'),
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
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return context.strings('passwordRequired');
                    }
                    // الحدّ نفسه الذي يفرضه الخادم — لا ٦ التي كان يقبلها
                    // التطبيق ويرفضها الخادم بعد الإرسال.
                    if (value.length < kPasswordMinLength) {
                      return context.strings('passwordMinLength');
                    }
                    return null;
                  },
                ),

                const SizedBox(height: 15),

                // اختيار الجنس — بطاقتان بأيقونتين، بلا حقل نصّي.
                GenderSelector(
                  value: _gender,
                  onChanged: (value) => setState(() => _gender = value),
                  errorText: _submitted && _gender == null
                      ? context.strings('genderRequired')
                      : null,
                ),

                SizedBox(height: AppDimens.space5),

                // زر إنشاء الحساب
                AnimePrimaryButton(
                  // لا رمز يُرسل: الزرّ يسمّي ما يحدث فعلاً — طلب إنشاء حساب.
                  label: context.strings('submitRequest'),
                  onPressed: _register,
                  loading: _loading,
                  height: AppDimens.buttonHeightXl,
                  borderRadius: AppDimens.radiusMd,
                  gradient: AppColors.ctaGradient,
                ),

                SizedBox(height: AppDimens.space3),

                Text(
                  // بلغة الواجهة — لا `of` التي تُرجع العربية دائماً.
                  GenderedStrings.termsNotice.ofLocale(
                    _gender ?? AppGender.unknown,
                    context.language,
                  ),
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
              label: context.strings('haveAccountLogin'),
              onPressed: () => Navigator.of(context).pop(),
            ),
          ),
        ),
      ),
    );
  }
}
