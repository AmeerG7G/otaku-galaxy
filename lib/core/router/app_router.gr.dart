// dart format width=80
// GENERATED CODE - DO NOT MODIFY BY HAND

// **************************************************************************
// AutoRouterGenerator
// **************************************************************************

// ignore_for_file: type=lint
// coverage:ignore-file

part of 'app_router.dart';

/// generated route for
/// [AccountScreen]
class AccountRoute extends PageRouteInfo<void> {
  const AccountRoute({List<PageRouteInfo>? children})
    : super(AccountRoute.name, initialChildren: children);

  static const String name = 'AccountRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      return const AccountScreen();
    },
  );
}

/// generated route for
/// [CartScreen]
class CartRoute extends PageRouteInfo<void> {
  const CartRoute({List<PageRouteInfo>? children})
    : super(CartRoute.name, initialChildren: children);

  static const String name = 'CartRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      return const CartScreen();
    },
  );
}

/// generated route for
/// [CategoriesScreen]
class CategoriesRoute extends PageRouteInfo<void> {
  const CategoriesRoute({List<PageRouteInfo>? children})
    : super(CategoriesRoute.name, initialChildren: children);

  static const String name = 'CategoriesRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      return const CategoriesScreen();
    },
  );
}

/// generated route for
/// [CategoryProductsScreen]
class CategoryProductsRoute extends PageRouteInfo<CategoryProductsRouteArgs> {
  CategoryProductsRoute({
    Key? key,
    required String categoryId,
    required String categoryName,
    List<PageRouteInfo>? children,
  }) : super(
         CategoryProductsRoute.name,
         args: CategoryProductsRouteArgs(
           key: key,
           categoryId: categoryId,
           categoryName: categoryName,
         ),
         initialChildren: children,
       );

  static const String name = 'CategoryProductsRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      final args = data.argsAs<CategoryProductsRouteArgs>();
      return CategoryProductsScreen(
        key: args.key,
        categoryId: args.categoryId,
        categoryName: args.categoryName,
      );
    },
  );
}

class CategoryProductsRouteArgs {
  const CategoryProductsRouteArgs({
    this.key,
    required this.categoryId,
    required this.categoryName,
  });

  final Key? key;

  final String categoryId;

  final String categoryName;

  @override
  String toString() {
    return 'CategoryProductsRouteArgs{key: $key, categoryId: $categoryId, categoryName: $categoryName}';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! CategoryProductsRouteArgs) return false;
    return key == other.key &&
        categoryId == other.categoryId &&
        categoryName == other.categoryName;
  }

  @override
  int get hashCode =>
      key.hashCode ^ categoryId.hashCode ^ categoryName.hashCode;
}

/// generated route for
/// [CollectionDetailScreen]
class CollectionDetailRoute extends PageRouteInfo<CollectionDetailRouteArgs> {
  CollectionDetailRoute({
    Key? key,
    required String collectionId,
    required String collectionName,
    List<PageRouteInfo>? children,
  }) : super(
         CollectionDetailRoute.name,
         args: CollectionDetailRouteArgs(
           key: key,
           collectionId: collectionId,
           collectionName: collectionName,
         ),
         initialChildren: children,
       );

  static const String name = 'CollectionDetailRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      final args = data.argsAs<CollectionDetailRouteArgs>();
      return CollectionDetailScreen(
        key: args.key,
        collectionId: args.collectionId,
        collectionName: args.collectionName,
      );
    },
  );
}

class CollectionDetailRouteArgs {
  const CollectionDetailRouteArgs({
    this.key,
    required this.collectionId,
    required this.collectionName,
  });

  final Key? key;

  final String collectionId;

  final String collectionName;

  @override
  String toString() {
    return 'CollectionDetailRouteArgs{key: $key, collectionId: $collectionId, collectionName: $collectionName}';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! CollectionDetailRouteArgs) return false;
    return key == other.key &&
        collectionId == other.collectionId &&
        collectionName == other.collectionName;
  }

  @override
  int get hashCode =>
      key.hashCode ^ collectionId.hashCode ^ collectionName.hashCode;
}

/// generated route for
/// [CommunityScreen]
class CommunityRoute extends PageRouteInfo<void> {
  const CommunityRoute({List<PageRouteInfo>? children})
    : super(CommunityRoute.name, initialChildren: children);

  static const String name = 'CommunityRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      return const CommunityScreen();
    },
  );
}

/// generated route for
/// [FavoritesScreen]
class FavoritesRoute extends PageRouteInfo<void> {
  const FavoritesRoute({List<PageRouteInfo>? children})
    : super(FavoritesRoute.name, initialChildren: children);

  static const String name = 'FavoritesRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      return const FavoritesScreen();
    },
  );
}

/// generated route for
/// [ForgotPasswordScreen]
class ForgotPasswordRoute extends PageRouteInfo<void> {
  const ForgotPasswordRoute({List<PageRouteInfo>? children})
    : super(ForgotPasswordRoute.name, initialChildren: children);

  static const String name = 'ForgotPasswordRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      return const ForgotPasswordScreen();
    },
  );
}

/// generated route for
/// [GalaxyPointsScreen]
class GalaxyPointsRoute extends PageRouteInfo<void> {
  const GalaxyPointsRoute({List<PageRouteInfo>? children})
    : super(GalaxyPointsRoute.name, initialChildren: children);

  static const String name = 'GalaxyPointsRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      return const GalaxyPointsScreen();
    },
  );
}

/// generated route for
/// [HomeScreen]
class HomeRoute extends PageRouteInfo<void> {
  const HomeRoute({List<PageRouteInfo>? children})
    : super(HomeRoute.name, initialChildren: children);

  static const String name = 'HomeRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      return const HomeScreen();
    },
  );
}

/// generated route for
/// [LoginScreen]
class LoginRoute extends PageRouteInfo<void> {
  const LoginRoute({List<PageRouteInfo>? children})
    : super(LoginRoute.name, initialChildren: children);

  static const String name = 'LoginRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      return const LoginScreen();
    },
  );
}

/// generated route for
/// [MainNavigationScreen]
class MainNavigationRoute extends PageRouteInfo<void> {
  const MainNavigationRoute({List<PageRouteInfo>? children})
    : super(MainNavigationRoute.name, initialChildren: children);

  static const String name = 'MainNavigationRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      return const MainNavigationScreen();
    },
  );
}

/// generated route for
/// [NotificationsScreen]
class NotificationsRoute extends PageRouteInfo<void> {
  const NotificationsRoute({List<PageRouteInfo>? children})
    : super(NotificationsRoute.name, initialChildren: children);

  static const String name = 'NotificationsRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      return const NotificationsScreen();
    },
  );
}

/// generated route for
/// [OnboardingScreen]
class OnboardingRoute extends PageRouteInfo<void> {
  const OnboardingRoute({List<PageRouteInfo>? children})
    : super(OnboardingRoute.name, initialChildren: children);

  static const String name = 'OnboardingRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      return const OnboardingScreen();
    },
  );
}

/// generated route for
/// [OrderDataScreen]
class OrderDataRoute extends PageRouteInfo<void> {
  const OrderDataRoute({List<PageRouteInfo>? children})
    : super(OrderDataRoute.name, initialChildren: children);

  static const String name = 'OrderDataRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      return const OrderDataScreen();
    },
  );
}

/// generated route for
/// [OrderDetailScreen]
class OrderDetailRoute extends PageRouteInfo<OrderDetailRouteArgs> {
  OrderDetailRoute({
    Key? key,
    required String orderId,
    bool confirmOnOpen = false,
    List<PageRouteInfo>? children,
  }) : super(
         OrderDetailRoute.name,
         args: OrderDetailRouteArgs(
           key: key,
           orderId: orderId,
           confirmOnOpen: confirmOnOpen,
         ),
         initialChildren: children,
       );

  static const String name = 'OrderDetailRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      final args = data.argsAs<OrderDetailRouteArgs>();
      return OrderDetailScreen(
        key: args.key,
        orderId: args.orderId,
        confirmOnOpen: args.confirmOnOpen,
      );
    },
  );
}

class OrderDetailRouteArgs {
  const OrderDetailRouteArgs({
    this.key,
    required this.orderId,
    this.confirmOnOpen = false,
  });

  final Key? key;

  final String orderId;

  final bool confirmOnOpen;

  @override
  String toString() {
    return 'OrderDetailRouteArgs{key: $key, orderId: $orderId, confirmOnOpen: $confirmOnOpen}';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! OrderDetailRouteArgs) return false;
    return key == other.key &&
        orderId == other.orderId &&
        confirmOnOpen == other.confirmOnOpen;
  }

  @override
  int get hashCode => key.hashCode ^ orderId.hashCode ^ confirmOnOpen.hashCode;
}

/// generated route for
/// [OrderReviewScreen]
class OrderReviewRoute extends PageRouteInfo<OrderReviewRouteArgs> {
  OrderReviewRoute({
    Key? key,
    required OrderData orderData,
    List<PageRouteInfo>? children,
  }) : super(
         OrderReviewRoute.name,
         args: OrderReviewRouteArgs(key: key, orderData: orderData),
         initialChildren: children,
       );

  static const String name = 'OrderReviewRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      final args = data.argsAs<OrderReviewRouteArgs>();
      return OrderReviewScreen(key: args.key, orderData: args.orderData);
    },
  );
}

class OrderReviewRouteArgs {
  const OrderReviewRouteArgs({this.key, required this.orderData});

  final Key? key;

  final OrderData orderData;

  @override
  String toString() {
    return 'OrderReviewRouteArgs{key: $key, orderData: $orderData}';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! OrderReviewRouteArgs) return false;
    return key == other.key && orderData == other.orderData;
  }

  @override
  int get hashCode => key.hashCode ^ orderData.hashCode;
}

/// generated route for
/// [OrdersScreen]
class OrdersRoute extends PageRouteInfo<void> {
  const OrdersRoute({List<PageRouteInfo>? children})
    : super(OrdersRoute.name, initialChildren: children);

  static const String name = 'OrdersRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      return const OrdersScreen();
    },
  );
}

/// generated route for
/// [OtpVerificationScreen]
class OtpVerificationRoute extends PageRouteInfo<OtpVerificationRouteArgs> {
  OtpVerificationRoute({
    Key? key,
    required String phone,
    OtpPurpose purpose = OtpPurpose.registration,
    List<PageRouteInfo>? children,
  }) : super(
         OtpVerificationRoute.name,
         args: OtpVerificationRouteArgs(
           key: key,
           phone: phone,
           purpose: purpose,
         ),
         initialChildren: children,
       );

  static const String name = 'OtpVerificationRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      final args = data.argsAs<OtpVerificationRouteArgs>();
      return OtpVerificationScreen(
        key: args.key,
        phone: args.phone,
        purpose: args.purpose,
      );
    },
  );
}

class OtpVerificationRouteArgs {
  const OtpVerificationRouteArgs({
    this.key,
    required this.phone,
    this.purpose = OtpPurpose.registration,
  });

  final Key? key;

  final String phone;

  final OtpPurpose purpose;

  @override
  String toString() {
    return 'OtpVerificationRouteArgs{key: $key, phone: $phone, purpose: $purpose}';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! OtpVerificationRouteArgs) return false;
    return key == other.key && phone == other.phone && purpose == other.purpose;
  }

  @override
  int get hashCode => key.hashCode ^ phone.hashCode ^ purpose.hashCode;
}

/// generated route for
/// [PersonalizeScreen]
class PersonalizeRoute extends PageRouteInfo<void> {
  const PersonalizeRoute({List<PageRouteInfo>? children})
    : super(PersonalizeRoute.name, initialChildren: children);

  static const String name = 'PersonalizeRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      return const PersonalizeScreen();
    },
  );
}

/// generated route for
/// [ProductDetailScreen]
class ProductDetailRoute extends PageRouteInfo<ProductDetailRouteArgs> {
  ProductDetailRoute({
    Key? key,
    required String productId,
    List<PageRouteInfo>? children,
  }) : super(
         ProductDetailRoute.name,
         args: ProductDetailRouteArgs(key: key, productId: productId),
         initialChildren: children,
       );

  static const String name = 'ProductDetailRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      final args = data.argsAs<ProductDetailRouteArgs>();
      return ProductDetailScreen(key: args.key, productId: args.productId);
    },
  );
}

class ProductDetailRouteArgs {
  const ProductDetailRouteArgs({this.key, required this.productId});

  final Key? key;

  final String productId;

  @override
  String toString() {
    return 'ProductDetailRouteArgs{key: $key, productId: $productId}';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! ProductDetailRouteArgs) return false;
    return key == other.key && productId == other.productId;
  }

  @override
  int get hashCode => key.hashCode ^ productId.hashCode;
}

/// generated route for
/// [RateOrderScreen]
class RateOrderRoute extends PageRouteInfo<RateOrderRouteArgs> {
  RateOrderRoute({
    Key? key,
    required Order order,
    List<PageRouteInfo>? children,
  }) : super(
         RateOrderRoute.name,
         args: RateOrderRouteArgs(key: key, order: order),
         initialChildren: children,
       );

  static const String name = 'RateOrderRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      final args = data.argsAs<RateOrderRouteArgs>();
      return RateOrderScreen(key: args.key, order: args.order);
    },
  );
}

class RateOrderRouteArgs {
  const RateOrderRouteArgs({this.key, required this.order});

  final Key? key;

  final Order order;

  @override
  String toString() {
    return 'RateOrderRouteArgs{key: $key, order: $order}';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! RateOrderRouteArgs) return false;
    return key == other.key && order == other.order;
  }

  @override
  int get hashCode => key.hashCode ^ order.hashCode;
}

/// generated route for
/// [RegisterScreen]
class RegisterRoute extends PageRouteInfo<void> {
  const RegisterRoute({List<PageRouteInfo>? children})
    : super(RegisterRoute.name, initialChildren: children);

  static const String name = 'RegisterRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      return const RegisterScreen();
    },
  );
}

/// generated route for
/// [ResetPasswordScreen]
class ResetPasswordRoute extends PageRouteInfo<ResetPasswordRouteArgs> {
  ResetPasswordRoute({
    Key? key,
    required String phone,
    required String code,
    List<PageRouteInfo>? children,
  }) : super(
         ResetPasswordRoute.name,
         args: ResetPasswordRouteArgs(key: key, phone: phone, code: code),
         initialChildren: children,
       );

  static const String name = 'ResetPasswordRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      final args = data.argsAs<ResetPasswordRouteArgs>();
      return ResetPasswordScreen(
        key: args.key,
        phone: args.phone,
        code: args.code,
      );
    },
  );
}

class ResetPasswordRouteArgs {
  const ResetPasswordRouteArgs({
    this.key,
    required this.phone,
    required this.code,
  });

  final Key? key;

  final String phone;

  final String code;

  @override
  String toString() {
    return 'ResetPasswordRouteArgs{key: $key, phone: $phone, code: $code}';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! ResetPasswordRouteArgs) return false;
    return key == other.key && phone == other.phone && code == other.code;
  }

  @override
  int get hashCode => key.hashCode ^ phone.hashCode ^ code.hashCode;
}

/// generated route for
/// [ReviewSubmittedScreen]
class ReviewSubmittedRoute extends PageRouteInfo<ReviewSubmittedRouteArgs> {
  ReviewSubmittedRoute({
    Key? key,
    required String productName,
    required int rating,
    required String comment,
    String? photoUrl,
    List<PageRouteInfo>? children,
  }) : super(
         ReviewSubmittedRoute.name,
         args: ReviewSubmittedRouteArgs(
           key: key,
           productName: productName,
           rating: rating,
           comment: comment,
           photoUrl: photoUrl,
         ),
         initialChildren: children,
       );

  static const String name = 'ReviewSubmittedRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      final args = data.argsAs<ReviewSubmittedRouteArgs>();
      return ReviewSubmittedScreen(
        key: args.key,
        productName: args.productName,
        rating: args.rating,
        comment: args.comment,
        photoUrl: args.photoUrl,
      );
    },
  );
}

class ReviewSubmittedRouteArgs {
  const ReviewSubmittedRouteArgs({
    this.key,
    required this.productName,
    required this.rating,
    required this.comment,
    this.photoUrl,
  });

  final Key? key;

  final String productName;

  final int rating;

  final String comment;

  final String? photoUrl;

  @override
  String toString() {
    return 'ReviewSubmittedRouteArgs{key: $key, productName: $productName, rating: $rating, comment: $comment, photoUrl: $photoUrl}';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! ReviewSubmittedRouteArgs) return false;
    return key == other.key &&
        productName == other.productName &&
        rating == other.rating &&
        comment == other.comment &&
        photoUrl == other.photoUrl;
  }

  @override
  int get hashCode =>
      key.hashCode ^
      productName.hashCode ^
      rating.hashCode ^
      comment.hashCode ^
      photoUrl.hashCode;
}

/// generated route for
/// [SearchScreen]
class SearchRoute extends PageRouteInfo<SearchRouteArgs> {
  SearchRoute({
    Key? key,
    String initialQuery = '',
    List<PageRouteInfo>? children,
  }) : super(
         SearchRoute.name,
         args: SearchRouteArgs(key: key, initialQuery: initialQuery),
         initialChildren: children,
       );

  static const String name = 'SearchRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      final args = data.argsAs<SearchRouteArgs>(
        orElse: () => const SearchRouteArgs(),
      );
      return SearchScreen(key: args.key, initialQuery: args.initialQuery);
    },
  );
}

class SearchRouteArgs {
  const SearchRouteArgs({this.key, this.initialQuery = ''});

  final Key? key;

  final String initialQuery;

  @override
  String toString() {
    return 'SearchRouteArgs{key: $key, initialQuery: $initialQuery}';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! SearchRouteArgs) return false;
    return key == other.key && initialQuery == other.initialQuery;
  }

  @override
  int get hashCode => key.hashCode ^ initialQuery.hashCode;
}

/// generated route for
/// [SettingsScreen]
class SettingsRoute extends PageRouteInfo<void> {
  const SettingsRoute({List<PageRouteInfo>? children})
    : super(SettingsRoute.name, initialChildren: children);

  static const String name = 'SettingsRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      return const SettingsScreen();
    },
  );
}

/// generated route for
/// [SplashScreen]
class SplashRoute extends PageRouteInfo<void> {
  const SplashRoute({List<PageRouteInfo>? children})
    : super(SplashRoute.name, initialChildren: children);

  static const String name = 'SplashRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      return const SplashScreen();
    },
  );
}

/// generated route for
/// [WriteReviewScreen]
class WriteReviewRoute extends PageRouteInfo<WriteReviewRouteArgs> {
  WriteReviewRoute({
    Key? key,
    required String orderId,
    required String productId,
    required String productName,
    List<PageRouteInfo>? children,
  }) : super(
         WriteReviewRoute.name,
         args: WriteReviewRouteArgs(
           key: key,
           orderId: orderId,
           productId: productId,
           productName: productName,
         ),
         initialChildren: children,
       );

  static const String name = 'WriteReviewRoute';

  static PageInfo page = PageInfo(
    name,
    builder: (data) {
      final args = data.argsAs<WriteReviewRouteArgs>();
      return WriteReviewScreen(
        key: args.key,
        orderId: args.orderId,
        productId: args.productId,
        productName: args.productName,
      );
    },
  );
}

class WriteReviewRouteArgs {
  const WriteReviewRouteArgs({
    this.key,
    required this.orderId,
    required this.productId,
    required this.productName,
  });

  final Key? key;

  final String orderId;

  final String productId;

  final String productName;

  @override
  String toString() {
    return 'WriteReviewRouteArgs{key: $key, orderId: $orderId, productId: $productId, productName: $productName}';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! WriteReviewRouteArgs) return false;
    return key == other.key &&
        orderId == other.orderId &&
        productId == other.productId &&
        productName == other.productName;
  }

  @override
  int get hashCode =>
      key.hashCode ^
      orderId.hashCode ^
      productId.hashCode ^
      productName.hashCode;
}
