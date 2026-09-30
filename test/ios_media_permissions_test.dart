import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

// [CRITICAL REGRESSION GUARD] نصوص الغرض في iOS لاختيار الصورة.
//
// `image_picker_ios` يستدعي `PHPhotoLibrary requestAuthorization` على مسار
// `UIImagePickerController` (iOS 13 — هدف النشر 13.0) ويربط واجهات الكاميرا.
// بلا `NSPhotoLibraryUsageDescription` يُنهي iOS التطبيق لحظة فتح المعرض، ومعالجة
// App Store/TestFlight ترفض البناء الذي يربط هذه الواجهات بلا نصّ غرضها
// (ITMS-90683) — فلا صورة شخصية ولا صورة تقييم من iOS أصلاً.
void main() {
  final plist = File('ios/Runner/Info.plist').readAsStringSync();

  for (final key in ['NSPhotoLibraryUsageDescription', 'NSCameraUsageDescription']) {
    test('$key موجود بنصٍّ غير فارغ', () {
      final match = RegExp('<key>$key</key>\\s*<string>([^<]*)</string>').firstMatch(plist);
      expect(match, isNotNull, reason: '$key غائب عن Info.plist');
      expect(match!.group(1)!.trim(), isNotEmpty);
    });
  }
}
