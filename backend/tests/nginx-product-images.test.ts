import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * [CRITICAL] صور المنتجات وحدها قابلةٌ للفهرسة على مضيف الـAPI (2026-11-07).
 *
 * الـAPI كلّه `noindex` بترويسةٍ على مستوى الخادم، وصور المنتجات تحتاج أن يراها
 * Google لأن JSON-LD المتجر يشير إليها. الاستثناء كتلةٌ واحدة `^~ /uploads/product/`:
 * أي `add_header` فيها يقطع وراثة ترويسات الخادم، فما لم يُعَد تعريفه يسقط.
 * الخطر أن تسقط `noindex` عن غير المنتجات (التقييمات، الصور الشخصية) أو عن
 * الاختبار المسبق كلّه، أو أن يصل مسارٌ ملتفّ (`%2e%2e`) إلى ملفٍّ غير ما فحصه
 * nginx — لذلك `proxy_pass` بمسارٍ يرسل المسار الموحَّد لا الخام.
 */
const ROOT = path.resolve(process.cwd(), '..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');
const NOINDEX = 'add_header X-Robots-Tag "noindex, nofollow, noarchive" always;';

/** الأسطر الفعّالة (بلا تعليقات) لخادم HTTPS، وهو الثاني في الملف. */
function httpsServer(conf: string): string {
  const active = conf
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n');
  const start = active.indexOf('listen 443');
  if (start < 0) throw new Error('no HTTPS server');
  return active.slice(start);
}

/** كتل `location` بمحدِّدها وجسمها (الكتل هنا لا تتداخل). */
function locations(server: string): Array<{ match: string; body: string }> {
  return [...server.matchAll(/location ([^{]+)\{([^}]*)\}/g)].map((m) => ({ match: m[1]!.trim(), body: m[2]! }));
}

/** توجيهات `add_header` على مستوى الخادم: ما خرج عن كل الكتل. */
function serverHeaders(server: string): string[] {
  return server
    .replace(/location [^{]+\{[^}]*\}/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('add_header '));
}

const ENVS = {
  staging: { file: 'deploy/nginx/staging-api.conf', upstream: 'otaku_staging_api' },
  prod: { file: 'deploy/nginx/prod-api.conf', upstream: 'otaku_prod_api' },
} as const;

describe('nginx: صور المنتجات وحدها خارج noindex', () => {
  for (const [env, { file, upstream }] of Object.entries(ENVS)) {
    const server = httpsServer(read(file));
    const locs = locations(server);
    const product = locs.filter((l) => l.match === '^~ /uploads/product/');

    it(`${env}: كتلةٌ واحدة للمنتجات بمسارٍ موحَّد إلى منبعها`, () => {
      expect(product).toHaveLength(1);
      expect(product[0]!.body).toContain(`proxy_pass http://${upstream}/uploads/product/;`);
      expect(product[0]!.body).toContain('add_header X-Upload-Class "product" always;');
      expect(serverHeaders(server)).toContain(NOINDEX);
    });

    it(`${env}: لا كتلة أخرى تقطع وراثة noindex`, () => {
      const others = locs.filter((l) => l !== product[0] && l.body.includes('add_header'));
      expect(others.map((l) => l.match)).toEqual([]);
      // التقييمات والصور الشخصية وبقية الرفع تمرّ بالكتلة العامّة.
      expect(locs.map((l) => l.match)).toContain('/uploads/');
    });

    it(`${env}: كتلة المنتجات تعيد كل ترويسة خادمٍ عدا noindex في الإنتاج`, () => {
      const kept = serverHeaders(server).filter((h) => env === 'staging' || h !== NOINDEX);
      for (const header of kept) expect(product[0]!.body, header).toContain(header);
    });
  }

  it('الإنتاج: صور المنتجات بلا noindex ومسموحةٌ في robots.txt، والباقي ممنوع', () => {
    const server = httpsServer(read(ENVS.prod.file));
    const product = locations(server).find((l) => l.match === '^~ /uploads/product/')!;
    expect(product.body).not.toContain('X-Robots-Tag');
    expect(server).toContain('return 200 "User-agent: *\\nAllow: /uploads/product/\\nDisallow: /\\n";');
  });

  it('الاختبار المسبق: لا شيء يُفهرس، ولا إشارة إلى الإنتاج', () => {
    const server = httpsServer(read(ENVS.staging.file));
    expect(server).not.toMatch(/Allow: \/uploads/);
    expect(read(ENVS.staging.file)).toContain('server 127.0.0.1:4001;');
    expect(read(ENVS.staging.file)).not.toMatch(/otaku_prod_api|127\.0\.0\.1:4000|server_name api\.otakugalaxystore\.com/);
  });
});
