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
