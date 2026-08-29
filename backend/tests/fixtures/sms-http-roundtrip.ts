import { createServer } from 'node:http';

/**
 * تحقّق فعلي من مزوّد HTTP: يشغّل خادماً محلياً، يضبط البيئة نحوه، ثم
 * يرسل رسالة عبر المزوّد ويطبع ما وصل الخادم فعلاً.
 *
 * هذا ما يمكن التحقق منه بلا حساب لدى مزوّد حقيقي: أن الواجهة تُبنى، وأن
 * الطلب يخرج بالشكل المتفق عليه، وأن فشل المزوّد يظهر خطأً لا صمتاً.
 */
async function main() {
  let received: unknown = null;

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      received = {
        method: req.method,
        authorization: req.headers.authorization,
        secret: req.headers['x-api-secret'],
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      };
      // الحالة تُملى من الوسيط: نفس الخادم يخدم حالتَي النجاح والفشل.
      res.writeHead(process.env.FIXTURE_FAIL === 'true' ? 502 : 200).end('{}');
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;

  // البيئة تُضبط قبل استيراد وحدة الإعدادات — dotenv لا يدهس ما هو مضبوط.
  process.env.SMS_PROVIDER = 'http';
  process.env.SMS_BASE_URL = `http://127.0.0.1:${port}/send`;
  process.env.SMS_API_KEY = 'fixture-key';
  process.env.SMS_API_SECRET = 'fixture-secret';
  process.env.SMS_SENDER = 'OtakuGalaxy';

  const { createSmsProvider } = await import('../../src/services/sms/index.js');
  const provider = createSmsProvider();

  let error: string | null = null;
  try {
    await provider.send({ to: '07700000001', message: 'رمز الاختبار: 123456' });
  } catch (e) {
    error = (e as Error).message;
  }

  server.close();
  console.log(JSON.stringify({ providerName: provider.name, received, error }));
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
