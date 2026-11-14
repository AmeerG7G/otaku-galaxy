import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/validation_rules.dart';
import '../../../core/design_system/design_system.dart';
import '../../../core/di/injection_container.dart' show sl;
import '../../../core/errors/app_exception.dart';
import '../../../core/l10n/app_strings.dart';
import '../../../core/l10n/gender.dart' show AppGender;
import '../../../core/router/app_router.dart';
import '../../../core/utils/iraqi_phone.dart';
import '../../auth/presentation/cubit/auth_cubit.dart' show AuthCubit;
import '../../auth/presentation/widgets/auth_field.dart';
import '../../auth/presentation/widgets/auth_scaffold.dart';
import '../../settings/data/personalize_storage.dart';
import '../data/whatsapp_signup_repository.dart';
import '../data/whatsapp_signup_store.dart';
import '../domain/whatsapp_signup_models.dart';
import 'whatsapp_signup_cubit.dart';

/// التسجيل عبر واتساب — يظهر فقط حين يقول الخادم `enabled` (`WHATSAPP_VERIFY_MODE=auto`).
///
/// ١. الرقم ← ٢. «افتح واتساب» برسالةٍ معبّأة تحمل الرمز، والشاشة تنتظر ردّ
/// الخادم ← ٣. الاسم والجنس وكلمة المرور ← حسابٌ مفعَّل وجلسة.
///
/// [SECURITY] كلمة المرور لا تُطلب ولا تُرسل قبل أن يقول الخادم «تحقّق» — هي
/// آخر خطوة، فلا تبقى في الذاكرة أثناء الانتقال إلى واتساب.
/// البديل دائماً ظاهر: «اطلب حساباً بمراجعة الإدارة» يعيد إلى الاستمارة العادية.
@RoutePage()
class WhatsAppSignupScreen extends StatelessWidget {
  const WhatsAppSignupScreen({
    super.key,
    this.initialPhone,
    this.repository,
    this.store,
    this.openLink,
  });

  /// الرقم الذي كتبه الزبون في استمارة التسجيل — إن كان صالحاً.
  final String? initialPhone;
  final WhatsAppSignupRepository? repository;
  final WhatsAppSignupStore? store;

  /// يُستبدل في الاختبارات — لا مكوّن منصّة في `flutter test`.
  final Future<bool> Function(Uri uri)? openLink;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => WhatsAppSignupCubit(
        repository: repository ?? sl<WhatsAppSignupRepository>(),
        store: store ?? const SecureWhatsAppSignupStore(),
        onSession: (session) =>
            sl<AuthCubit>().adoptSession(session.token, session.user),
      )..restore(),
      child: _WhatsAppSignupView(
        initialPhone: initialPhone,
        openLink:
            openLink ??
            (uri) => launchUrl(uri, mode: LaunchMode.externalApplication),
      ),
    );
  }
}

class _WhatsAppSignupView extends StatefulWidget {
  const _WhatsAppSignupView({
    required this.initialPhone,
    required this.openLink,
  });

  final String? initialPhone;
  final Future<bool> Function(Uri uri) openLink;

  @override
  State<_WhatsAppSignupView> createState() => _WhatsAppSignupViewState();
}

class _WhatsAppSignupViewState extends State<_WhatsAppSignupView>
    with WidgetsBindingObserver {
  late final _phoneController = TextEditingController(
    text: widget.initialPhone ?? '',
  );
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  final _phoneFormKey = GlobalKey<FormState>();
  final _detailsFormKey = GlobalKey<FormState>();
  AppGender? _gender;
  bool _detailsSubmitted = false;
  bool _obscure = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _phoneController.dispose();
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  /// العودة من واتساب = استعلامٌ فوري؛ الغياب = لا استعلام في الخلفية.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final cubit = context.read<WhatsAppSignupCubit>();
    if (state == AppLifecycleState.resumed) {
      unawaited(cubit.resume());
    } else if (state == AppLifecycleState.paused) {
      cubit.pause();
    }
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
      );
  }

  String _errorText(AppException e) {
    final text = e.localizedMessage(context);
    return text.trim().isEmpty ? context.strings('unexpectedError') : text;
  }

  Future<void> _start() async {
    if (!_phoneFormKey.currentState!.validate()) return;
    final phone =
        normalizeIraqiPhone(_phoneController.text) ??
        _phoneController.text.trim();
    await context.read<WhatsAppSignupCubit>().startSession(phone);
  }

  Future<void> _openWhatsApp(WhatsAppSignupSession session) async {
    final uri = Uri.tryParse(session.waLink);
    final opened = uri != null && await widget.openLink(uri);
    if (!opened && mounted) {
      _snack(
        context.strings.p('waSignupOpenFailed', {
          'number': session.businessNumber,
        }),
      );
    }
  }

  Future<void> _copyMessage(WhatsAppSignupSession session) async {
    final text = Uri.decodeComponent(session.waLink.split('text=').last);
    await Clipboard.setData(ClipboardData(text: text));
    if (mounted) _snack(context.strings('waSignupCopied'));
  }

  Future<void> _complete() async {
    setState(() => _detailsSubmitted = true);
    final gender = _gender;
    if (!_detailsFormKey.currentState!.validate() || gender == null) return;
    await context.read<WhatsAppSignupCubit>().complete(
      username: _usernameController.text.trim(),
      gender: gender.value!,
      password: _passwordController.text,
    );
  }

  void _manualReview() => context.router.maybePop();

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<WhatsAppSignupCubit, WhatsAppSignupState>(
      listenWhen: (a, b) => a.error != b.error || a.step != b.step,
      listener: (context, state) {
        final error = state.error;
        if (error != null && state.step != WhatsAppSignupStep.waiting)
          _snack(_errorText(error));
        if (state.step == WhatsAppSignupStep.done) {
          context.router.replaceAll([
            sl<PersonalizeStorage>().isDone
                ? const MainNavigationRoute()
                : const PersonalizeRoute(),
          ]);
        }
      },
      builder: (context, state) => AuthScaffold(
        title: context.strings('waSignupTitle'),
        subtitle: context.strings('waSignupSubtitle'),
        showBack: true,
        form: switch (state.step) {
          WhatsAppSignupStep.phone => _phoneStep(state),
          WhatsAppSignupStep.waiting => _waitingStep(state),
          WhatsAppSignupStep.details ||
          WhatsAppSignupStep.done => _detailsStep(state),
        },
        footer: Center(
          child: AnimeTextButton(
            key: const Key('waSignupManual'),
            label: context.strings('waSignupManual'),
            onPressed: _manualReview,
          ),
        ),
      ),
    );
  }

  Widget _phoneStep(WhatsAppSignupState state) {
    return Form(
      key: _phoneFormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AnimeTextField(
            key: const Key('waSignupPhone'),
            controller: _phoneController,
            label: context.strings('phoneNumber'),
            hint: context.strings('phoneHintExample'),
            prefixIcon: Icons.phone_outlined,
            textDirection: TextDirection.ltr,
            keyboardType: TextInputType.phone,
            inputFormatters: const [IraqiPhoneInputFormatter()],
            maxLength: kIraqiLocalPhoneLength,
            textInputAction: TextInputAction.done,
            validator: (value) {
              if (value == null || value.trim().isEmpty)
                return context.strings('phoneRequiredShort');
              if (!isValidIraqiLocalPhone(value))
                return context.strings('phoneInvalid');
              return null;
            },
          ),
          SizedBox(height: AppDimens.space5),
          AnimePrimaryButton(
            key: const Key('waSignupStart'),
            label: context.strings('waSignupStart'),
            onPressed: _start,
            loading: state.busy,
            height: AppDimens.buttonHeightXl,
            gradient: AppColors.ctaGradient,
          ),
        ],
      ),
    );
  }

  Widget _waitingStep(WhatsAppSignupState state) {
    final session = state.session!;
    final theme = Theme.of(context);
    final phase = state.phase ?? WhatsAppSignupPhase.pending;
    final terminal = phase.isTerminal && phase != WhatsAppSignupPhase.verified;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!terminal) ...[
          Text(
            context.strings('waSignupSendIntro'),
            style: theme.textTheme.bodyMedium,
            textAlign: TextAlign.center,
          ),
          SizedBox(height: AppDimens.space3),
          Directionality(
            textDirection: TextDirection.ltr,
            child: SelectableText(
              session.code,
              key: const Key('waSignupCode'),
              textAlign: TextAlign.center,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w700,
                letterSpacing: 1.5,
              ),
            ),
          ),
          SizedBox(height: AppDimens.space2),
          Directionality(
            textDirection: TextDirection.ltr,
            child: Text(
              session.businessNumber,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall,
            ),
          ),
          SizedBox(height: AppDimens.space4),
          AnimePrimaryButton(
            key: const Key('waSignupOpen'),
            label: context.strings('waSignupOpenWhatsApp'),
            icon: Icons.chat_outlined,
            onPressed: () => _openWhatsApp(session),
            height: AppDimens.buttonHeightXl,
            gradient: AppColors.ctaGradient,
          ),
          SizedBox(height: AppDimens.space2),
          AnimeOutlinedButton(
            key: const Key('waSignupCopy'),
            label: context.strings('waSignupCopyMessage'),
            onPressed: () => _copyMessage(session),
          ),
          SizedBox(height: AppDimens.space4),
          _StatusLine(state: state, expiresAt: session.expiresAt),
          SizedBox(height: AppDimens.space3),
          Text(
            context.strings('waSignupWarning'),
            key: const Key('waSignupWarning'),
            textAlign: TextAlign.center,
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              height: 1.6,
            ),
          ),
        ] else ...[
          Text(
            context.strings(switch (phase) {
              WhatsAppSignupPhase.expired => 'waSignupExpired',
              WhatsAppSignupPhase.mismatch => 'waSignupMismatchFinal',
              WhatsAppSignupPhase.phoneTaken => 'waSignupPhoneTaken',
              _ => 'waSignupDead',
            }),
            key: const Key('waSignupTerminal'),
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyLarge,
          ),
          SizedBox(height: AppDimens.space4),
          if (phase == WhatsAppSignupPhase.phoneTaken)
            AnimePrimaryButton(
              key: const Key('waSignupGoLogin'),
              label: context.strings('haveAccountLogin'),
              onPressed: () => context.router.replaceAll([const LoginRoute()]),
              height: AppDimens.buttonHeightXl,
              gradient: AppColors.ctaGradient,
            )
          else
            AnimePrimaryButton(
              key: const Key('waSignupRestart'),
              label: context.strings('waSignupStartAgain'),
              onPressed: () => context.read<WhatsAppSignupCubit>().restart(),
              height: AppDimens.buttonHeightXl,
              gradient: AppColors.ctaGradient,
            ),
        ],
      ],
    );
  }

  Widget _detailsStep(WhatsAppSignupState state) {
    return Form(
      key: _detailsFormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            context.strings('waSignupVerified'),
            key: const Key('waSignupVerified'),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleSmall,
          ),
          SizedBox(height: AppDimens.space4),
          AuthField(
            key: const Key('waSignupUsername'),
            controller: _usernameController,
            label: context.strings('username'),
            hint: context.strings('usernameHintExample'),
            textInputAction: TextInputAction.next,
            validator: (value) {
              if (value == null || value.trim().isEmpty)
                return context.strings('usernameRequired');
              if (value.trim().length < kUsernameMinLength)
                return context.strings('usernameTooShort');
              return null;
            },
          ),
          const SizedBox(height: 15),
          AuthField(
            key: const Key('waSignupPassword'),
            controller: _passwordController,
            label: context.strings('password'),
            hint: '••••••••',
            obscureText: _obscure,
            textInputAction: TextInputAction.done,
            trailing: IconButton(
              icon: Icon(
                _obscure
                    ? Icons.visibility_outlined
                    : Icons.visibility_off_outlined,
                size: AppDimens.iconMd,
              ),
              onPressed: () => setState(() => _obscure = !_obscure),
            ),
            validator: (value) {
              if (value == null || value.isEmpty)
                return context.strings('passwordRequired');
              if (value.length < kPasswordMinLength)
                return context.strings('passwordMinLength');
              return null;
            },
          ),
          const SizedBox(height: 15),
          GenderSelector(
            value: _gender,
            onChanged: (value) => setState(() => _gender = value),
            errorText: _detailsSubmitted && _gender == null
                ? context.strings('genderRequired')
                : null,
          ),
          SizedBox(height: AppDimens.space5),
          AnimePrimaryButton(
            key: const Key('waSignupCreate'),
            label: context.strings('waSignupCreate'),
            onPressed: _complete,
            loading: state.busy,
            height: AppDimens.buttonHeightXl,
            gradient: AppColors.ctaGradient,
          ),
        ],
      ),
    );
  }
}

/// العدّاد (تجميليّ — الخادم هو الحَكَم) وسطر الحالة.
class _StatusLine extends StatefulWidget {
  const _StatusLine({required this.state, required this.expiresAt});

  final WhatsAppSignupState state;
  final DateTime expiresAt;

  @override
  State<_StatusLine> createState() => _StatusLineState();
}

class _StatusLineState extends State<_StatusLine> {
  late final Timer _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
    if (mounted) setState(() {});
  });

  @override
  void dispose() {
    _ticker.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final _ = _ticker;
    final theme = Theme.of(context);
    final left = widget.expiresAt.difference(DateTime.now());
    final seconds = left.isNegative ? 0 : left.inSeconds;
    final time =
        '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';
    final state = widget.state;
    final key = state.offline
        ? 'waSignupOffline'
        : state.phase == WhatsAppSignupPhase.awaitingContact
        ? 'waSignupShareContact'
        : state.mismatched
        ? 'waSignupMismatch'
        : 'waSignupWaiting';
    return Column(
      children: [
        Text(
          context.strings(key),
          key: const Key('waSignupStatus'),
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: key == 'waSignupMismatch' ? theme.colorScheme.error : null,
          ),
        ),
        SizedBox(height: AppDimens.space1),
        Text(
          context.strings.p('waSignupExpiresIn', {'time': time}),
          textAlign: TextAlign.center,
          style: theme.textTheme.labelSmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}
