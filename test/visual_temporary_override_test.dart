// الصورة المؤقّتة (الهجرة ٠٥٥) كما يراها التطبيق: صورةٌ فعّالة واحدة يحسمها
// الخادم، وجلبٌ واحد مجدول للحظة انتهائها.
//
// [CRITICAL] التطبيق لا يعرف «دائمة» و«مؤقّتة» ولا يحكم بينهما — يقرأ
// `currentUrl` كما وصل. ما يضيفه الردّ هو ساعة الخادم `now` وأقرب انتهاء
// `nextChangeAt`، فيُجدول `VisualsRepository` جلباً واحداً لتلك اللحظة على
// **ساعة الخادم وحدها**: لا انتظارٌ اعتباطي، ولا استطلاع، ولا اعتماد على
// ساعة الهاتف. وحين يصل الردّ تعود الدائمة في الموضع نفسه بمفتاحه نفسه.


import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/core/network/media_url.dart';
import 'package:otaku_galaxy/features/visuals/data/visuals_repository.dart';
import 'package:otaku_galaxy/features/visuals/domain/visual_slot.dart';
import 'package:otaku_galaxy/features/visuals/presentation/managed_artwork.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _slot = VisualSlots.emptySearch;
const _fallback = 'assets/art/opt/a-i1.png';
const _permanent = '/uploads/slot/permanent.png';
const _temporary = '/uploads/slot/temporary.png';

/// ردٌّ واحد من `GET /visuals` كما يبنيه الخادم.
Map<String, dynamic> _payload({
  required String url,
  required String version,
  required DateTime now,
  DateTime? nextChangeAt,
}) => {
  'version': version,
  'now': now.toUtc().toIso8601String(),
  'nextChangeAt': nextChangeAt?.toUtc().toIso8601String(),
  'slots': [
    {'slotKey': _slot, 'currentUrl': url},
  ],
};

/// خادمٌ مسجَّل: يعيد الردود بالترتيب ويكرّر الأخير.
///
/// يتجاوز `Dio` عمداً: تحت الزمن الوهمي لا تكتمل مؤقّتاته الداخلية، بينما
/// المطلوب هنا هو مؤقّت `VisualsRepository` وحده — فيُحقن الردّ مباشرةً.
class _ScriptedApi extends ApiClient {
  _ScriptedApi(this.responses)
      : super(
          config: AppConfig.development,
          dio: Dio(BaseOptions(baseUrl: 'http://stub.invalid/api')),
          tokenProvider: () => null,
        );

  final List<Map<String, dynamic>> responses;
  int calls = 0;

  @override
  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async {
    final index = calls.clamp(0, responses.length - 1);
    calls++;
    return responses[index];
  }
}

Future<(VisualsRepository, _ScriptedApi, SharedPreferences)> _repository(
  List<Map<String, dynamic>> responses,
) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  final server = _ScriptedApi(responses);
  final repo = VisualsRepository(api: server, prefs: prefs);
  addTearDown(repo.dispose);
  return (repo, server, prefs);
}

/// ساعة خادمٍ بعيدة عن ساعة الجهاز عمداً: لو حُسبت المهلة على ساعة الجهاز
/// لكانت سنواتٍ لا دقائق — فنجاح الجلب في وقته يثبت أن الحكم للخادم.
final DateTime _serverNow = DateTime.utc(2031, 3, 1, 12, 0, 0);

void main() {
  tearDown(() {
    if (sl.isRegistered<VisualsRepository>()) sl.unregister<VisualsRepository>();
  });

  group('الجدولة لحظة الانتهاء — بساعة الخادم', () {
    testWidgets('[CRITICAL] مؤقّتةٌ تنتهي بعد ساعة: جلبٌ واحد في تلك اللحظة يعيد الدائمة في الموضع نفسه', (
      tester,
    ) async {
      final (repo, server, prefs) = await _repository([
        _payload(url: _temporary, version: 'v-temp', now: _serverNow, nextChangeAt: _serverNow.add(const Duration(hours: 1))),
        _payload(url: _permanent, version: 'v-perm', now: _serverNow.add(const Duration(hours: 1))),
      ]);
      await repo.refresh();
      expect(server.calls, 1);
      expect(repo.urlFor(_slot), resolveMediaUrl(_temporary));
      expect(repo.hasScheduledRefresh, isTrue);
      final revisionAfterTemporary = repo.revision.value;

      // قبل اللحظة بدقيقة: لا شيء يحدث — لا استطلاع.
      await tester.pump(const Duration(minutes: 59));
      expect(server.calls, 1);
      expect(repo.urlFor(_slot), resolveMediaUrl(_temporary));

      // اللحظة نفسها: جلبٌ واحد، الدائمة تعود، والمراجعة تتقدّم مرةً.
      await tester.pump(const Duration(minutes: 1));
      await tester.pump();
      expect(server.calls, 2);
      expect(repo.urlFor(_slot), resolveMediaUrl(_permanent));
      expect(repo.revision.value, revisionAfterTemporary + 1);
      // لا مؤقّتةً سارية في الردّ الثاني ⇒ لا جلبٌ مجدول.
      expect(repo.hasScheduledRefresh, isFalse);
      await tester.pump(const Duration(hours: 5));
      expect(server.calls, 2);
      // المحفوظ للتشغيل التالي هو الدائمة — لا تبقى المؤقّتة المنتهية فيه.
      expect(prefs.getString(VisualsRepository.snapshotKey), contains(_permanent));
      expect(prefs.getString(VisualsRepository.snapshotKey), isNot(contains(_temporary)));
    });

    testWidgets('بلا مؤقّتةٍ سارية (`nextChangeAt` غائب أو null) لا مؤقّت أصلاً', (tester) async {
      final (repo, server, _) = await _repository([
        _payload(url: _permanent, version: 'v', now: _serverNow),
      ]);
      await repo.refresh();
      expect(repo.hasScheduledRefresh, isFalse);
      await tester.pump(const Duration(days: 2));
      expect(server.calls, 1);
    });

    testWidgets('لحظةٌ لا تتجاوز ساعة الخادم (انتهت في الطريق) لا تُجدوَل — الردّ يحمل الفعّالة أصلاً', (
      tester,
    ) async {
      final (repo, server, _) = await _repository([
        _payload(url: _permanent, version: 'v', now: _serverNow, nextChangeAt: _serverNow),
      ]);
      await repo.refresh();
      expect(repo.hasScheduledRefresh, isFalse);
      await tester.pump(const Duration(hours: 1));
      expect(server.calls, 1);
    });

    testWidgets('ردٌّ جديد يعيد الجدولة ويلغي السابقة — مؤقّتٌ واحد في كل وقت', (tester) async {
      final (repo, server, _) = await _repository([
        _payload(url: _temporary, version: 'v1', now: _serverNow, nextChangeAt: _serverNow.add(const Duration(hours: 1))),
        // المسؤول قصّر المدّة: الردّ التالي يقول خمس دقائق.
        _payload(url: _temporary, version: 'v1', now: _serverNow, nextChangeAt: _serverNow.add(const Duration(minutes: 5))),
        _payload(url: _permanent, version: 'v2', now: _serverNow.add(const Duration(minutes: 5))),
      ]);
      await repo.refresh();
      await repo.refresh(); // عودةٌ إلى المقدمة مثلاً.
      expect(server.calls, 2);
      await tester.pump(const Duration(minutes: 5));
      await tester.pump();
      expect(server.calls, 3, reason: 'الجدولة الجديدة وحدها نُفّذت');
      expect(repo.urlFor(_slot), resolveMediaUrl(_permanent));
      await tester.pump(const Duration(hours: 1));
      expect(server.calls, 3, reason: 'الجدولة القديمة أُلغيت — لا جلبٌ ثانٍ عند الساعة');
    });

    testWidgets('`dispose` يلغي المؤقّت — لا جلب بعد الإيقاف', (tester) async {
      final (repo, server, _) = await _repository([
        _payload(url: _temporary, version: 'v', now: _serverNow, nextChangeAt: _serverNow.add(const Duration(minutes: 10))),
      ]);
      await repo.refresh();
      expect(repo.hasScheduledRefresh, isTrue);
      repo.dispose();
      expect(repo.hasScheduledRefresh, isFalse);
      await tester.pump(const Duration(minutes: 11));
      expect(server.calls, 1);
    });

    // [CRITICAL] المهلة الواحدة لا تتجاوز يوماً مهما بعُد الانتهاء: مؤقّت الويب
    // (`setTimeout`) يفيض بعد ٢٤٫٨ يوماً فيطلق فوراً — أي جلبٌ يعيد تسليح
    // المهلة نفسها فيطلق فوراً … دورانٌ يضرب الخادم. المهلة المحدودة تجلب
    // مرةً في اليوم، تقرأ الباقي من ساعة الخادم، وتعيد التسليح — لا أكثر.
    for (final horizon in const [Duration(days: 40), Duration(days: 366)]) {
      testWidgets('[CRITICAL] انتهاءٌ بعد ${horizon.inDays} يوماً: لا مؤقّتَ بطول المدّة — جلبٌ وسيط كل يومٍ يعيد التسليح ولا يدور', (
        tester,
      ) async {
        final until = _serverNow.add(horizon);
        final (repo, server, _) = await _repository([
          _payload(url: _temporary, version: 'v', now: _serverNow, nextChangeAt: until),
          _payload(url: _temporary, version: 'v', now: _serverNow.add(const Duration(days: 1)), nextChangeAt: until),
          _payload(url: _temporary, version: 'v', now: _serverNow.add(const Duration(days: 2)), nextChangeAt: until),
        ]);
        await repo.refresh();
        expect(server.calls, 1);
        expect(repo.hasScheduledRefresh, isTrue);
        final revision = repo.revision.value;

        // قبل تمام اليوم: لا شيء — ليس استطلاعاً.
        await tester.pump(const Duration(hours: 23, minutes: 59));
        expect(server.calls, 1);

        // تمام اليوم: جلبٌ وسيط واحد، الصورة كما هي بلا إعادة بناء، والمهلة
        // أُعيد تسليحها من ساعة الخادم (الباقي ما يزال أبعد من يوم ⇒ يومٌ آخر).
        await tester.pump(const Duration(minutes: 1));
        await tester.pump();
        expect(server.calls, 2);
        expect(repo.urlFor(_slot), resolveMediaUrl(_temporary));
        expect(repo.revision.value, revision);
        expect(repo.hasScheduledRefresh, isTrue);

        // لا دوران: نصف يومٍ بلا جلب، ثم اليوم الثاني جلبٌ واحد لا أكثر.
        await tester.pump(const Duration(hours: 12));
        expect(server.calls, 2);
        await tester.pump(const Duration(hours: 12));
        await tester.pump();
        expect(server.calls, 3);
        expect(repo.hasScheduledRefresh, isTrue);

        // الإيقاف يلغي المهلة الوسيطة كما يلغي أي مهلة.
        repo.dispose();
        expect(repo.hasScheduledRefresh, isFalse);
        await tester.pump(const Duration(days: 2));
        expect(server.calls, 3);
      });
    }

    testWidgets('انتهاءٌ أقرب من يوم يُجدوَل للحظته لا لليوم — الحدّ لا يؤخّر', (tester) async {
      final (repo, server, _) = await _repository([
        _payload(url: _temporary, version: 'v1', now: _serverNow, nextChangeAt: _serverNow.add(const Duration(hours: 20))),
        _payload(url: _permanent, version: 'v2', now: _serverNow.add(const Duration(hours: 20))),
      ]);
      await repo.refresh();
      await tester.pump(const Duration(hours: 20));
      await tester.pump();
      expect(server.calls, 2);
      expect(repo.urlFor(_slot), resolveMediaUrl(_permanent));
      expect(repo.hasScheduledRefresh, isFalse);
    });

    testWidgets('ساعة الخادم تحكم لا ساعة الجهاز: انتهاءٌ بعد عشر دقائق من ساعةٍ في سنة ٢٠٣١ يُجلب بعد عشر دقائق', (
      tester,
    ) async {
      // لو حُسبت المهلة `nextChangeAt - DateTime.now()` لكانت أعواماً.
      final (repo, server, _) = await _repository([
        _payload(url: _temporary, version: 'v1', now: _serverNow, nextChangeAt: _serverNow.add(const Duration(minutes: 10))),
        _payload(url: _permanent, version: 'v2', now: _serverNow.add(const Duration(minutes: 10))),
      ]);
      await repo.refresh();
      await tester.pump(const Duration(minutes: 10));
      await tester.pump();
      expect(server.calls, 2);
      expect(repo.urlFor(_slot), resolveMediaUrl(_permanent));
    });
  });

  group('الموضع على الشاشة', () {
    testWidgets('[CRITICAL] `ManagedArtwork` يعرض المؤقّتة ثم الدائمة في العنصر نفسه بمفتاحه — لا مضمَّن بينهما ولا فتحة أخرى', (
      tester,
    ) async {
      final (repo, server, _) = await _repository([
        _payload(url: _temporary, version: 'v1', now: _serverNow, nextChangeAt: _serverNow.add(const Duration(hours: 1))),
        _payload(url: _permanent, version: 'v2', now: _serverNow.add(const Duration(hours: 1))),
      ]);
      if (sl.isRegistered<VisualsRepository>()) sl.unregister<VisualsRepository>();
      sl.registerSingleton<VisualsRepository>(repo);
      await repo.refresh();

      await tester.pumpWidget(
        const MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: Column(
              children: [
                ManagedArtwork(slot: _slot, fallbackAsset: _fallback, height: 100),
                // فتحةٌ أخرى بلا صورة: تبقى مضمَّنةً قبل الانتهاء وبعده.
                ManagedArtwork(slot: VisualSlots.emptyCart, fallbackAsset: _fallback, height: 100),
              ],
            ),
          ),
        ),
      );
      final key = find.byKey(const ValueKey<String>('managed-artwork:$_slot'));
      expect(tester.widget<CachedNetworkImage>(key).imageUrl, resolveMediaUrl(_temporary));
      expect(find.byKey(const ValueKey<String>('managed-artwork:${VisualSlots.emptyCart}')), findsNothing);

      await tester.pump(const Duration(hours: 1));
      await tester.pump();
      expect(server.calls, 2);
      final remote = tester.widget<CachedNetworkImage>(key);
      expect(remote.imageUrl, resolveMediaUrl(_permanent));
      expect(remote.useOldImageOnUrlChange, isTrue, reason: 'المؤقّتة تبقى معروضةً حتى تُحلّ الدائمة — لا مضمَّن بينهما');
      expect(find.byKey(const ValueKey<String>('managed-artwork:${VisualSlots.emptyCart}')), findsNothing);
    });
  });
}
