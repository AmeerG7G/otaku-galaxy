// أيقونة الإشعار الصغيرة — أندرويد (شريط الحالة) وشارة إشعار اللوحة.
//
// [CRITICAL] أندرويد وChrome يرسمان الأيقونة الصغيرة/الشارة من الشفافية
// وحدها. أيقونة التشغيل (الشعار بأرضيته المعتمة) كانت تظهر مربعاً أبيض في
// شريط الحالة. الأيقونة الآن رمزٌ مبسّط مستوحى من الشعار — ثلاثة مربعات
// بيضاء على شفاف يرسمها `tool/branding/make_notification_icon.py` هندسياً
// (الشعار وأيقونات التشغيل لا تُقرأ ولا تُمسّ). ظلّ المربعات الستة رُفض: عند
// 24px تلتحم، أو يصغر أصغرها إلى 2px فلا يُرى.
//
// الحارس يقيس البكسل: عودةُ أيقونة معتمة أو ملوّنة أو فارغة تُسقطه، وكذلك
// التحامُ المربعات أو تلاشي أصغرها في أي كثافة — ويتأكّد أن البيان
// (الخلفية/الإغلاق) والتطبيق (المقدّمة) يشيران إلى الأيقونة نفسها.

import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/tokens/app_colors.dart';
import 'package:otaku_galaxy/features/notifications/push/firebase_push.dart';

const _densities = {
  'mdpi': 24,
  'hdpi': 36,
  'xhdpi': 48,
  'xxhdpi': 72,
  'xxxhdpi': 96,
};

const _badge = 'admin/public/otaku-notification-badge.png';

/// (العرض، الارتفاع، rgba غير مضروب بالألفا).
Future<(int, int, List<int>)> _read(String path) async {
  final codec = await ui.instantiateImageCodec(await File(path).readAsBytes());
  final frame = await codec.getNextFrame();
  final data = await frame.image.toByteData(
    format: ui.ImageByteFormat.rawStraightRgba,
  );
  return (frame.image.width, frame.image.height, data!.buffer.asUint8List());
}

/// الأشكال المنفصلة (اتصالٌ رباعي) التي تبلغ ألفاها [threshold] — أحجامها.
List<int> _shapes(List<int> px, int w, int h, int threshold) {
  final seen = List<bool>.filled(w * h, false);
  final sizes = <int>[];
  for (var start = 0; start < w * h; start++) {
    if (seen[start] || px[start * 4 + 3] < threshold) continue;
    seen[start] = true;
    final stack = [start];
    var n = 0;
    while (stack.isNotEmpty) {
      final i = stack.removeLast();
      n++;
      final x = i % w, y = i ~/ w;
      for (final (nx, ny) in [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        final j = ny * w + nx;
        if (!seen[j] && px[j * 4 + 3] >= threshold) {
          seen[j] = true;
          stack.add(j);
        }
      }
    }
    sizes.add(n);
  }
  return sizes..sort();
}

/// قواعد الأيقونة الأحادية: بيضاء حيث تظهر، شفافة في الحواف، لا فارغة ولا
/// مربعاً مصمتاً — ومقروءة: ثلاثة مربعات منفصلة بفجوةٍ نظيفة، أصغرها لا يتلاشى.
Future<void> _expectMonochromeGlyph(String path, int size) async {
  final (w, h, px) = await _read(path);
  expect((w, h), (size, size), reason: '$path: المقاس');

  var opaque = 0;
  for (var i = 0; i < w * h; i++) {
    final a = px[i * 4 + 3];
    if (a == 0) continue;
    expect(
      [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]],
      [255, 255, 255],
      reason: '$path: بكسل مرئي غير أبيض عند ${i % w},${i ~/ w}',
    );
    if (a > 127) opaque++;
  }
  final coverage = opaque / (w * h);
  expect(coverage, greaterThan(0.15), reason: '$path: الأيقونة شبه فارغة');
  expect(coverage, lessThan(0.6), reason: '$path: مربعٌ مصمت لا رمز الإشعار');

  // [CRITICAL] المقروئية بالمقاس الفعلي: ثلاثة أشكال منفصلة حتى مع أخفت
  // البكسلات (10%) — فالفجوات نظيفة لا جسور رمادية — ومع المصمتة (50%).
  for (final threshold in [26, 128]) {
    expect(
      _shapes(px, w, h, threshold),
      hasLength(3),
      reason: '$path: المربعات الثلاثة ملتحمة أو ناقصة (ألفا ≥ $threshold)',
    );
  }
  // أصغر مربع لا يقلّ عن سُدس الضلع مربّعاً (24px → 16 بكسلاً مصمتاً).
  expect(
    _shapes(px, w, h, 128).first,
    greaterThanOrEqualTo(size * size ~/ 36),
    reason: '$path: أصغر المربعات أصغر من أن يُرى',
  );

  // الهامش: الصف والعمود الأولان والأخيران شفافة تماماً.
  for (var k = 0; k < size; k++) {
    for (final (x, y) in [(k, 0), (k, size - 1), (0, k), (size - 1, k)]) {
      expect(px[(y * w + x) * 4 + 3], 0, reason: '$path: حافةٌ غير شفافة عند $x,$y');
    }
  }
}

void main() {
  group('[CRITICAL] أيقونة شريط الحالة لأندرويد', () {
    for (final MapEntry(key: density, value: size) in _densities.entries) {
      test('drawable-$density/ic_stat_otaku.png: رمز أبيض مقروء ${size}px', () async {
        await _expectMonochromeGlyph(
          'android/app/src/main/res/drawable-$density/$kPushSmallIcon.png',
          size,
        );
      });
    }

    test('البيان: FCM في الخلفية والإغلاق يرسم الأيقونة نفسها ولونها', () {
      final manifest = File(
        'android/app/src/main/AndroidManifest.xml',
      ).readAsStringSync();
      expect(
        manifest,
        matches(
          RegExp(
            r'com\.google\.firebase\.messaging\.default_notification_icon"\s*'
            'android:resource="@drawable/$kPushSmallIcon"',
          ),
        ),
      );
      expect(
        manifest,
        matches(
          RegExp(
            r'com\.google\.firebase\.messaging\.default_notification_color"\s*'
            r'android:resource="@color/notification_accent"',
          ),
        ),
      );
      final colors = File(
        'android/app/src/main/res/values/colors.xml',
      ).readAsStringSync();
      final hex = (AppColors.primary.toARGB32() & 0xFFFFFF)
          .toRadixString(16)
          .padLeft(6, '0')
          .toUpperCase();
      expect(
        colors,
        contains('<color name="notification_accent">#$hex</color>'),
      );
      expect(kPushAccentColor, AppColors.primary);
    });

    test('المقدّمة: الإشعار المحلي يستعمل الأيقونة نفسها لا أيقونة التشغيل', () {
      final src = File(
        'lib/features/notifications/push/firebase_push.dart',
      ).readAsStringSync();
      expect(src, isNot(contains('@mipmap/ic_launcher')));
      expect(src, contains('AndroidInitializationSettings(kPushSmallIcon)'));
      expect(src, contains('icon: kPushSmallIcon'));
    });
  });

  group('[CRITICAL] شارة إشعار اللوحة (Web Push)', () {
    test('otaku-notification-badge.png: رمز أبيض مقروء 96px', () async {
      await _expectMonochromeGlyph(_badge, 96);
    });

    test('عامل الخدمة يستعمل الشارة الأحادية والشعار الملوّن أيقونةً', () {
      final sw = File('admin/public/admin-push-sw.js').readAsStringSync();
      expect(sw, contains("badge: '/otaku-notification-badge.png'"));
      expect(sw, contains("icon: '/otaku-square-mark.png'"));
    });
  });
}
