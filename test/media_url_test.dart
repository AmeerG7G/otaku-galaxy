// مرجع الوسائط النسبي يتحوّل إلى رابط مطلق مقابل أصل هذا الجهاز.
//
// انحدار: كانت الروابط تُخزَّن مطلقة بأصل `localhost:4000` وقت الرفع، فكل
// صورة يرفعها المسؤول تفشل على الهاتف — `localhost` هناك هو الهاتف نفسه.

import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/network/media_url.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/auth/domain/entities/user.dart';

void main() {
  test('يبني رابطاً مطلقاً من مرجع نسبي', () {
    configureMediaOrigin(AppConfig.staging);
    // الأصل مشتقّ من عنوان البيئة نفسها — لا مضيف مكرَّر في الاختبار يتقادم
    // كلما تغيّر الإعداد (وهو ما حدث حين فُصل عنوان الاختبار عن الإنتاج).
    final expected = AppConfig.staging.apiBaseUrl!.replaceAll('/api', '');
    expect(mediaOrigin, expected);
    expect(
      resolveMediaUrl('/uploads/product/2026/08/a.png'),
      '$expected/uploads/product/2026/08/a.png',
    );
  });

  test('يمرّر الروابط الخارجية كما هي', () {
    configureMediaOrigin(AppConfig.staging);
    const external = 'https://placehold.co/600x600/e91e63/ffffff?text=ring';
    expect(resolveMediaUrl(external), external);
    expect(resolveMediaUrl('http://cdn.test/a.png'), 'http://cdn.test/a.png');
  });

  test('يتجاهل المراجع الفارغة بدل إنتاج رابط مكسور', () {
    configureMediaOrigin(AppConfig.staging);
    expect(resolveMediaUrl(null), isNull);
    expect(resolveMediaUrl('   '), isNull);
    expect(resolveMediaUrls(null), isEmpty);
    expect(resolveMediaUrls(['', '  ', null]), isEmpty);
  });

  test('يتبع الأصل الذي تُضبط عليه البيئة — لا عنوان مثبّت', () {
    configureMediaOrigin(AppConfig.staging);
    final staging = resolveMediaUrl('/uploads/x.png');
    configureMediaOrigin(AppConfig.development);
    final dev = resolveMediaUrl('/uploads/x.png');

    expect(staging, isNot(dev));
    expect(dev, endsWith('/uploads/x.png'));
    expect(dev, isNot(contains('/api/')));
  });

  test('النماذج تحلّ الروابط عند التحليل', () {
    configureMediaOrigin(AppConfig.staging);

    final product = Product.fromJson({
      'id': 'p1',
      'name': 'منتج',
      'price': 1000,
      'description': '',
      'images': ['/uploads/product/a.png', 'https://cdn.test/b.png'],
    });
    expect(product.images.first, startsWith(mediaOrigin));
    expect(product.images.last, 'https://cdn.test/b.png');

    final user = User.fromJson({
      'id': 'u1',
      'username': 'عميل',
      'phone': '07700000000',
      'avatarUrl': '/uploads/avatar/a.png',
      'role': 'customer',
      'createdAt': DateTime.now().toIso8601String(),
    });
    expect(user.avatarUrl, '$mediaOrigin/uploads/avatar/a.png');
  });
}
