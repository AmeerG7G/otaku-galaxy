// [CRITICAL] تصنيف فروق الهندسة بين اللغتين (`support/geometry_probe.dart`).
//
// العقد في `kurdish_geometry_test.dart` يعدّ «bug» وحدها. كل فئةٍ أخرى إعفاءٌ،
// فيجب أن تكون ضيّقةً ومحسوبة: هنا ما يُعفى وما لا يُعفى.

import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';

import 'support/geometry_probe.dart';

GeoNode _box(Rect r, {bool text = false, String kind = 'box'}) =>
    GeoNode(kind, r, '', hasText: text);

void main() {
  group('text-region', () {
    test('صندوقٌ فيه نصّ اتّسع عرضه وحده', () {
      final c = compareGeometry(
        {'/Row#0/Pill#0': _box(const Rect.fromLTWH(10, 10, 60, 20), text: true)},
        {'/Row#0/Pill#0': _box(const Rect.fromLTWH(0, 10, 70, 20), text: true)},
      );
      expect(c.diffs.single.category, 'text-region');
      expect(c.bugs, isEmpty);
    });

    test('صندوقٌ فيه نصّ طال ارتفاعه: bug', () {
      final c = compareGeometry(
        {'/Card#0': _box(const Rect.fromLTWH(0, 0, 100, 40), text: true)},
        {'/Card#0': _box(const Rect.fromLTWH(0, 0, 100, 61), text: true)},
      );
      expect(c.bugs, hasLength(1));
    });
  });

  group('button-label', () {
    const button = '/Card#0/ElevatedButton#0';
    test('أيقونةٌ تتحرّك أفقياً داخل زرٍّ ثابت', () {
      final c = compareGeometry(
        {
          button: _box(const Rect.fromLTWH(0, 100, 300, 44), kind: 'button', text: true),
          '$button/Row#0/Icon#0': _box(const Rect.fromLTWH(200, 112, 20, 20), kind: 'icon'),
        },
        {
          button: _box(const Rect.fromLTWH(0, 100, 300, 44), kind: 'button', text: true),
          '$button/Row#0/Icon#0': _box(const Rect.fromLTWH(254, 112, 20, 20), kind: 'icon'),
        },
      );
      expect(c.diffs.single.category, 'button-label');
      expect(c.bugs, isEmpty);
    });

    test('الزرّ نفسه تحرّك: ما فيه bug', () {
      final c = compareGeometry(
        {
          button: _box(const Rect.fromLTWH(0, 100, 300, 44), kind: 'button', text: true),
          '$button/Row#0/Icon#0': _box(const Rect.fromLTWH(200, 112, 20, 20), kind: 'icon'),
        },
        {
          button: _box(const Rect.fromLTWH(0, 125, 300, 44), kind: 'button', text: true),
          '$button/Row#0/Icon#0': _box(const Rect.fromLTWH(254, 137, 20, 20), kind: 'icon'),
        },
      );
      expect(c.bugs, hasLength(2));
    });

    test('أيقونةٌ نزلت داخل زرٍّ ثابت: bug', () {
      final c = compareGeometry(
        {
          button: _box(const Rect.fromLTWH(0, 100, 300, 44), kind: 'button', text: true),
          '$button/Icon#0': _box(const Rect.fromLTWH(200, 112, 20, 20), kind: 'icon'),
        },
        {
          button: _box(const Rect.fromLTWH(0, 100, 300, 44), kind: 'button', text: true),
          '$button/Icon#0': _box(const Rect.fromLTWH(200, 118, 20, 20), kind: 'icon'),
        },
      );
      expect(c.bugs, hasLength(1));
    });
  });

  group('text-flow', () {
    Map<String, GeoNode> row({required double chip0Width, required double chip1Left}) => {
      '/Row#0/Chip#0/Box#0': _box(Rect.fromLTWH(400 - chip0Width, 0, chip0Width, 36), text: true),
      '/Row#0/Chip#1/Box#0': _box(Rect.fromLTWH(chip1Left, 0, 70, 36)),
    };

    test('شريحةٌ تلي شريحةً أعرض بالمقدار نفسه', () {
      final c = compareGeometry(
        row(chip0Width: 60, chip1Left: 300),
        row(chip0Width: 66.6, chip1Left: 293.4),
      );
      expect(c.diffs.map((d) => d.category), containsAll(['text-region', 'text-flow']));
      expect(c.bugs, isEmpty);
    });

    test('انزياحٌ أكبر مما اتّسعت الشقيقة: bug', () {
      final c = compareGeometry(
        row(chip0Width: 60, chip1Left: 300),
        row(chip0Width: 66.6, chip1Left: 280),
      );
      expect(c.bugs, hasLength(1));
    });

    test('بلا منطقة نصٍّ اتّسعت: الانزياح bug', () {
      final c = compareGeometry(
        {'/Row#0/Chip#1/Box#0': _box(const Rect.fromLTWH(300, 0, 70, 36))},
        {'/Row#0/Chip#1/Box#0': _box(const Rect.fromLTWH(290, 0, 70, 36))},
      );
      expect(c.bugs, hasLength(1));
    });
  });
}
