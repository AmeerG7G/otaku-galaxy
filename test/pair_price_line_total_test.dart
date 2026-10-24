// «قطعة بـ٤٠٠٠، قطعتان بـ٧٠٠٠» — سعر القطعتين لكل منتج (STEP 69، هجرة 085).
//
// [CRITICAL] الخادم وحده يحسب العرض: قطعتان بخيارين من المنتج نفسه عرضٌ واحد
// يقع توفيره على السطر الذي تكتمل فيه القطعتان. التطبيق يعرض `lineTotal` كما
// وصل — في السلة وفي الطلب — ولا يعيد حسابه. كان يعرض السعر × الكمية (٨٠٠٠)
// والخادم يحفظ ٧٠٠٠.

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/features/cart/data/repositories/cart_repository_impl.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_item.dart';
import 'package:otaku_galaxy/features/cart/presentation/cubit/cart_state.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';

/// ردٌّ واحد بشكل `GET /cart` الحقيقي: «أحمر» ثم «أزرق» من المنتج نفسه.
class _CartReply implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final line = (String id, String option, num total) => {
      'id': id,
      'productId': 'p1',
      'productNameAr': 'حقيبة',
      'productNameCkb': 'جانتا',
      'productImage': null,
      'optionValue': option,
      'quantity': 1,
      'unitPrice': 4000,
      'pairPrice': 7000,
      'lineTotal': total,
      'stock': 5,
      'hasDeliveryPromo': false,
      'deliveryPromoAmount': 0,
    };
    final body = jsonEncode({
      'success': true,
      'message': null,
      'data': {
        'items': [line('l2', 'أزرق', 3000), line('l1', 'أحمر', 4000)],
        'adjustments': <Object>[],
      },
    });
    return ResponseBody.fromString(body, 200, headers: {
      Headers.contentTypeHeader: ['application/json'],
    });
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  test('السلة تعرض مبلغ كل سطر من الخادم: قطعتان بخيارين = ٧٠٠٠ لا ٨٠٠٠', () async {
    final dio = Dio(BaseOptions(baseUrl: 'https://test.local/api'))
      ..httpClientAdapter = _CartReply();
    final items = await CartRepositoryImpl(api: ApiClient(dio: dio)).fetchCart();

    expect(items.map((item) => item.lineTotal), [3000, 4000]);
    expect(CartLoaded(items: items).total, 7000);
  });

  test('الطلب يعرض ما دفعه الزبون عن السطر — لقطة الخادم لا السعر × الكمية', () {
    final order = Order.fromJson({
      'id': 'o1',
      'number': '1001',
      'status': 'PENDING_ADMIN_CONFIRMATION',
      'productsTotal': 7000,
      'total': 11000,
      'deliveryFee': 4000,
      'items': [
        {
          'productId': 'p1',
          'productNameAr': 'حقيبة',
          'productNameCkb': null,
          'imageUrl': null,
          'optionValue': null,
          'price': 4000,
          'pairPrice': 7000,
          'quantity': 2,
          'lineTotal': 7000,
        },
      ],
    });
    expect(order.items.single.lineTotal, 7000);
    expect(order.items.fold<double>(0, (sum, item) => sum + item.lineTotal), order.productsTotal);
  });

  test('سطرٌ بلا مبلغٍ من الخادم يبقى السعر × الكمية، وكميةٌ جديدة لا تحمل مبلغاً قديماً', () {
    const product = Product(id: 'p1', nameAr: 'حقيبة', descriptionAr: '', price: 4000, images: [], stock: 5);
    expect(const CartItem(product: product, quantity: 2).lineTotal, 8000);

    const priced = CartItem(product: product, quantity: 2, serverLineTotal: 7000);
    expect(priced.lineTotal, 7000);
    expect(priced.copyWith(lineId: 'l1').lineTotal, 7000);
    expect(priced.copyWith(quantity: 3).lineTotal, 12000);
  });
}
