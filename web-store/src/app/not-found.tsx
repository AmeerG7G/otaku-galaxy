import Link from '@/components/Link';

export default function NotFound() {
  return (
    <div className="empty card narrow">
      <h1>الصفحة غير موجودة</h1>
      <p>الرابط غير صحيح، أو أن المنتج لم يعد معروضاً.</p>
      <Link className="btn btn-primary" href="/">
        الرجوع للمتجر
      </Link>
    </div>
  );
}
