import 'package:auto_route/auto_route.dart';
import '../../../../core/l10n/app_strings.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/l10n/gender.dart';
import '../../../../core/errors/app_exception.dart';
import '../../../../core/router/app_router.dart';
import '../../../../core/utils/iraqi_phone.dart';
import '../../domain/entities/account_request.dart';
import '../cubit/auth_cubit.dart';
import '../widgets/auth_field.dart';
import '../widgets/auth_scaffold.dart';
import '../../../settings/data/personalize_storage.dart';
import '../../../../core/di/injection_container.dart' show sl;
import '../../../visuals/domain/visual_slot.dart';

/// مقياس رسم الدخول (الصورة 1) — طلب المالك: أكبر بـ٢٠٪ (STEP 64).
const double _loginArtScale = 1.2;

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
      // بصيغة E.164 المطبَّعة (تشمل تحويل الأرقام الشرقية) — ما يخزّنه الخادم.
      await context.read<AuthCubit>().login(
        normalizeIraqiPhone(_phoneController.text) ?? _phoneController.text.trim(),
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
      // كلمة مرور صحيحة لحساب لم توافق عليه الإدارة بعد: لا رمز يُرسل ولا
      // شاشة رمز — نعرض شاشة «قيد المراجعة» نفسها التي رآها عند التسجيل،
      // فيعرف أن الطلب قائم وأن الإدارة ستتواصل معه عبر واتساب.
      if (e.code == 'ACCOUNT_PENDING_APPROVAL') {
        context.router.push(
          AccountPendingRoute(kind: AccountRequestKind.registration),
        );
        return;
      }
      // مرفوض: الرسالة من الخادم تكفي — لا مسار آلي بعدها؛ التواصل مع الإدارة.
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
    if (e is AppException) {
      final text = e.localizedMessage(context);
      if (text.trim().isNotEmpty) return text;
    }
    return context.strings('unexpectedError');
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
          title: context.strings('login'),
          subtitle: context.g(GenderedStrings.enterPhoneAndPassword),
          artworkSlot: VisualSlots.login,
          // [STEP 64 §20] أكبر بـ٢٠٪: الصندوق ١٣٨×١٩٦ ← ١٦٥٫٦×٢٣٥٫٢ (المقياس لا
          // الصورة — 1.png لا تُمسّ). الصورة مربّعة تُرسم `contain` موسَّطة
          // فتطفو (٢٣٥٫٢ − ١٦٥٫٦) ÷ ٢ = ٣٤٫٨ فوق قاع الصندوق؛ `artworkBottom`
          // يُنزلها بالقدر نفسه فيبقى صدرها على حافة الرأس كما كان (2026-09-28).
          artworkHeight: 196 * _loginArtScale,
          artworkWidth: 138 * _loginArtScale,
          artworkBottom: -29 * _loginArtScale,
          form: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // حقل رقم الهاتف — تسمية فوق الحقل بلا أيقونات.
                AnimeTextField(
                  controller: _phoneController,
                  label: context.strings('phoneNumber'),
                  hint: context.strings('phoneHintExample'),
                  prefixIcon: Icons.phone_outlined,
                  keyboardType: TextInputType.phone,
                  // الرقم كاملاً كما يكتبه الزبون (`07701234567`) — لا بادئة `07` ثابتة ولا مُدرَجة؛
                  // المُنسّق يُبقي الأرقام وحدها، والحكم لقاعدة الموبايل العراقي ثم للخادم.
                  inputFormatters: const [IraqiPhoneInputFormatter()],
                  textDirection: TextDirection.ltr,
                  textInputAction: TextInputAction.next,
                  maxLength: kIraqiLocalPhoneLength,
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return context.strings('phoneRequiredShort');
                    }
                    if (!isValidIraqiLocalPhone(value)) {
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
                  onSubmitted: (_) => _login(),
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
                    // الدخول لا يفرض طولاً (الخادم: `min(1)`): كلمةٌ وضعتها
                    // الإدارة أو حسابٌ قديم قد تكون أقصر مما يفرضه التسجيل،
                    // وحجبُها هنا يمنع صاحبها من الدخول أصلاً.
                    if (value == null || value.isEmpty) {
                      return context.strings('passwordRequired');
                    }
                    return null;
                  },
                ),

                SizedBox(height: AppDimens.space3),

                // نسيت كلمة المرور
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: AnimeTextButton(
                    label: context.strings('forgotPassword'),
                    onPressed: () =>
                        context.router.push(const ForgotPasswordRoute()),
                  ),
                ),

                SizedBox(height: AppDimens.space5),

                // زر تسجيل الدخول
                AnimePrimaryButton(
                  label: context.strings('login'),
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
                label: context.strings('noAccountRegister'),
                onPressed: () => context.router.push(const RegisterRoute()),
              ),
              // متابعة كزائر (بلا حساب) — تصفّح المتجر مباشرة.
              AnimeTextButton(
                label: context.strings('browseAsGuest'),
                onPressed: () => context.router.replace(
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
