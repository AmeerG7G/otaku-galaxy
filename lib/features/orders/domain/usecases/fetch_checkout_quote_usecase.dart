import '../entities/checkout_quote.dart';
import '../repositories/order_repository.dart';

/// ملخّص الدفع بأرقام الخادم — الخصومات (ومنها مزيّة المستوى) قبل التأكيد.
class FetchCheckoutQuoteUsecase {
  const FetchCheckoutQuoteUsecase(this._repository);

  final OrderRepository _repository;

  Future<CheckoutQuote> call({String? governorateId, String? zoneId}) =>
      _repository.fetchCheckoutQuote(governorateId: governorateId, zoneId: zoneId);
}
