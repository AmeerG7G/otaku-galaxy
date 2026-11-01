import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * [CRITICAL] مضيف API الاختبار المسبق مكتوبٌ في ثلاثة أماكن لا يقرأ أحدها
 * الآخر: نكهة staging في التطبيق، وقالب اللوحة، وقالب الخادم. وُجد (2026-10-25)
 * أن قالب الخادم بقي على `staging-api.otaku-galaxy.example` بعد أن صار التطبيق
 * واللوحة على `staging-api.otakugalaxystore.com` (STEP 64) — فمن ينسخ القالب
 * يضبط `PUBLIC_BASE_URL` على مضيفٍ لا يحلّ.
 */
const ROOT = path.resolve(process.cwd(), '..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

/** قيمة المتغيّر في قالب `.env` — السطر غير المعلَّق وحده. */
function envValue(file: string, key: string): string {
  const line = read(file)
    .split('\n')
    .find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} missing from ${file}`);
  return line.slice(key.length + 1).trim();
}

/** `apiBaseUrl` لنكهةٍ في `app_config.dart` — من كتلة `<flavor>._(` إلى أول `),`. */
function flavorApiBaseUrl(flavor: 'staging' | 'production'): string {
  const source = read('lib/core/config/app_config.dart');
  const start = source.indexOf(`${flavor}._(`);
  if (start < 0) throw new Error(`${flavor}._( missing from app_config.dart`);
  const block = source.slice(start, source.indexOf('),', start));
  const match = block.match(/apiBaseUrl:\s*'([^']+)'/);
  if (!match) throw new Error(`apiBaseUrl missing from the ${flavor} flavor`);
  return match[1]!;
}

const host = (url: string) => new URL(url).host;

describe('[CRITICAL] قوالب البيئة ومضيف API الاختبار المسبق', () => {
  const app = host(flavorApiBaseUrl('staging'));

  it('التطبيق واللوحة والخادم على مضيف API اختبارٍ واحد', () => {
    expect(host(envValue('admin/.env.staging.example', 'VITE_API_BASE_URL'))).toBe(app);
    expect(host(envValue('backend/.env.staging.example', 'PUBLIC_BASE_URL'))).toBe(app);
  });

  it('لا قالب اختبارٍ يشير إلى مضيف الإنتاج', () => {
    const production = [
      host(flavorApiBaseUrl('production')),
      host(envValue('backend/.env.prod.example', 'PUBLIC_BASE_URL')),
      host(envValue('admin/.env.prod.example', 'VITE_API_BASE_URL')),
    ];
    for (const prod of production) {
      expect(app).not.toBe(prod);
      expect(read('backend/.env.staging.example')).not.toContain(`//${prod}`);
      expect(read('admin/.env.staging.example')).not.toContain(`//${prod}`);
    }
  });
});

/**
 * [CRITICAL] الإنتاج (خطة الإنتاج، 2026-11-01): مضيف API الإنتاج مكتوبٌ في نكهة
 * التطبيق وقالبَي اللوحة والخادم وقوالب nginx — خمسة أماكن لا يقرأ أحدها الآخر.
 * بقيت كلها على `api.otaku-galaxy.example` حتى قبيل الإطلاق.
 */
describe('[CRITICAL] قوالب الإنتاج على المضيفات الحقيقية', () => {
  const API = 'api.otakugalaxystore.com';
  const placeholder = /otaku-galaxy\.example|example\.com|localhost|127\.0\.0\.1|staging/;

  it('التطبيق واللوحة والخادم على مضيف API إنتاجٍ واحد، والـCORS للوحة وحدها', () => {
    expect(host(flavorApiBaseUrl('production'))).toBe(API);
    expect(host(envValue('admin/.env.prod.example', 'VITE_API_BASE_URL'))).toBe(API);
    expect(host(envValue('backend/.env.prod.example', 'PUBLIC_BASE_URL'))).toBe(API);
    expect(envValue('backend/.env.prod.example', 'CORS_ORIGINS')).toBe('https://admin.otakugalaxystore.com');
  });

  it('لا قيمة نائبة ولا مضيف اختبار أو تطوير في قيم قوالب الإنتاج', () => {
    for (const file of ['backend/.env.prod.example', 'admin/.env.prod.example']) {
      for (const line of read(file).split('\n')) {
        if (line.startsWith('#') || !line.includes('=')) continue;
        expect(line, `${file}: ${line}`).not.toMatch(placeholder);
      }
    }
    expect(envValue('backend/.env.prod.example', 'APP_ENV')).toBe('prod');
    expect(envValue('backend/.env.prod.example', 'TRUST_PROXY')).toBe('1');
  });

  it('قوالب nginx للإنتاج: المضيفات والمنافذ، ولا Basic Auth على المتجر، ولا فهرسة للوحة والـAPI', () => {
    const api = read('deploy/nginx/prod-api.conf');
    const store = read('deploy/nginx/prod-store.conf');
    const admin = read('deploy/nginx/prod-admin.conf');
    const active = (conf: string) =>
      conf
        .split('\n')
        .filter((l) => !l.trimStart().startsWith('#'))
        .join('\n');

    expect(active(api)).toContain(`server_name ${API};`);
    expect(active(api)).toContain('server 127.0.0.1:4000;');
    expect(active(store)).toContain('server_name otakugalaxystore.com;');
    expect(active(store)).toContain('proxy_pass http://127.0.0.1:3000;');
    expect(active(admin)).toContain('server_name admin.otakugalaxystore.com;');
    expect(active(admin)).toContain('root /srv/otaku-galaxy/production/admin/dist;');

    // المتجر عامٌّ ويُفهرس؛ اللوحة والـAPI لا يُفهرسان أبداً.
    expect(active(store)).not.toMatch(/auth_basic|X-Robots-Tag|noindex/);
    expect(active(admin)).toContain('X-Robots-Tag "noindex, nofollow, noarchive" always');
    expect(active(api)).toContain('X-Robots-Tag "noindex, nofollow, noarchive" always');
    expect(active(admin)).toContain('return 200 "User-agent: *\\nDisallow: /\\n";');

    for (const conf of [api, store, admin]) {
      expect(active(conf)).toContain('include /etc/nginx/snippets/cloudflare-real-ip.conf;');
      // عنوانٌ واحد بعد real_ip — السلسلة يتحكّم بها العميل.
      expect(active(conf)).not.toContain('$proxy_add_x_forwarded_for');
      expect(active(conf)).not.toMatch(/staging|example\.com|otaku-galaxy\.example/);
    }
    // HSTS من helmet على الـAPI؛ تكراره في nginx كان I-03.
    expect(active(api)).not.toContain('Strict-Transport-Security');
  });

  it('بصمة سكربت `admin/index.html` المضمَّن هي التي في CSP اللوحة', () => {
    const scripts = [...read('admin/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    expect(scripts).toHaveLength(1);
    const hash = createHash('sha256').update(scripts[0]!, 'utf8').digest('base64');
    expect(read('deploy/nginx/prod-admin.conf')).toContain(`script-src 'self' 'sha256-${hash}';`);
  });
});
