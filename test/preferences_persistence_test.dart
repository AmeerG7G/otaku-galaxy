// §11 — المظهر واللغة يجب أن يبقيا بعد إغلاق التطبيق وإعادة فتحه.
//
// «إعادة التشغيل» تُحاكى ببناء Cubit جديد فوق نفس التخزين: هذا بالضبط ما
// يحدث عند الإقلاع، حيث تُنشأ الـCubits من SharedPreferences نفسها.

import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/theme_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late SharedPreferences prefs;

  setUp(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  test('theme choice survives a restart', () async {
    final first = ThemeCubit(prefs);
    final chose = !first.isDark; // نختار عكس الافتراضي ليكون التغيير حقيقياً
    first.setDark(chose);
    expect(first.isDark, chose);
    await first.close();

    // إقلاع جديد فوق نفس التخزين.
    final second = ThemeCubit(prefs)..loadPreference();
    expect(
      second.isDark,
      chose,
      reason: 'المظهر المختار يجب أن يُستعاد بعد إعادة التشغيل',
    );
    await second.close();
  });

  test('theme choice survives repeated restarts', () async {
    final a = ThemeCubit(prefs)..setDark(false);
    await a.close();

    for (var i = 0; i < 3; i++) {
      final next = ThemeCubit(prefs)..loadPreference();
      expect(next.isDark, isFalse);
      await next.close();
    }
  });

  test('language choice survives a restart', () async {
    final first = LocaleCubit(prefs);
    final other = AppLanguage.values.firstWhere((l) => l != first.state);
    await first.setLanguage(other);
    expect(first.state, other);
    await first.close();

    final second = LocaleCubit(prefs)..loadPreference();
    expect(
      second.state,
      other,
      reason: 'اللغة المختارة يجب أن تُستعاد بعد إعادة التشغيل',
    );
    await second.close();
  });

  test('an untouched install keeps the defaults', () async {
    final theme = ThemeCubit(prefs)..loadPreference();
    final locale = LocaleCubit(prefs)..loadPreference();

    expect(theme.isDark, isFalse, reason: 'الافتراضي للمستخدم الجديد فاتح');
    expect(locale.state, AppLanguage.arabic);

    await theme.close();
    await locale.close();
  });

  // ── انحدار: الإقلاع الأول يجب أن يكون فاتحاً دائماً ──
  //
  // «الإقلاع الأول» = لا قيمة محفوظة، لا «كل مرة يُفتح فيها التطبيق».
  // مظهر النظام لا يدخل في القرار إطلاقاً: الـCubit لا يقرأه، وجذر التطبيق
  // يشتقّ `themeMode` من هذه الحالة وحدها.
  group('theme startup default', () {
    test('no saved preference → light', () async {
      final cubit = ThemeCubit(prefs);
      expect(cubit.isDark, isFalse, reason: 'قبل أي قراءة، الحالة المبدئية فاتحة');

      cubit.loadPreference();
      expect(cubit.isDark, isFalse, reason: 'غياب الاختيار يعني فاتح لا داكن');
      await cubit.close();
    });

    test('reading an empty store does not write a default over it', () async {
      final cubit = ThemeCubit(prefs)..loadPreference();
      await cubit.close();

      expect(
        prefs.getBool('theme_mode_dark'),
        isNull,
        reason: 'الإقلاع لا يخترع اختياراً للمستخدم',
      );
    });

    test('saved dark → dark', () async {
      await prefs.setBool('theme_mode_dark', true);

      final cubit = ThemeCubit(prefs)..loadPreference();
      expect(cubit.isDark, isTrue);
      await cubit.close();
    });

    test('saved light → light', () async {
      await prefs.setBool('theme_mode_dark', false);

      final cubit = ThemeCubit(prefs)..loadPreference();
      expect(cubit.isDark, isFalse);
      await cubit.close();
    });

    test('an explicit choice matching the default is still persisted', () async {
      // الفاتح هو الافتراضي؛ اختياره صراحةً يجب أن يُكتب لا أن يُبتلع.
      final cubit = ThemeCubit(prefs)..setDark(false);
      await cubit.close();

      expect(prefs.getBool('theme_mode_dark'), isFalse);
    });

    test('restarting never overwrites the saved choice', () async {
      // تثبيت جديد → فاتح.
      final fresh = ThemeCubit(prefs)..loadPreference();
      expect(fresh.isDark, isFalse);

      // المستخدم يختار الداكن.
      fresh.setDark(true);
      await fresh.close();

      // ثلاث إعادات تشغيل متتالية تبقي الداكن.
      for (var i = 0; i < 3; i++) {
        final next = ThemeCubit(prefs)..loadPreference();
        expect(next.isDark, isTrue, reason: 'إعادة التشغيل رقم $i غيّرت الاختيار');
        await next.close();
      }

      // المستخدم يعود للفاتح.
      final back = ThemeCubit(prefs)..loadPreference();
      back.setDark(false);
      await back.close();

      // وثلاث إعادات تشغيل أخرى تبقي الفاتح.
      for (var i = 0; i < 3; i++) {
        final next = ThemeCubit(prefs)..loadPreference();
        expect(next.isDark, isFalse, reason: 'إعادة التشغيل رقم $i غيّرت الاختيار');
        await next.close();
      }
    });
  });
}
