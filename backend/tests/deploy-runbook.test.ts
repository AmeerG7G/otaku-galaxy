import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * [CRITICAL] دليل التشغيل (`deploy/README.md`) وملفّاته لا يخلطان البيئتين (R-17).
 *
 * الدليل لا يُنفَّذ في التكامل المستمر، فلا شيء كان يلاحظ أن أوامره تشير إلى
 * ما لا وجود له أو تبني الاختبار المسبق في مجلّد الإنتاج. وُجد فيه (2026-10-24):
 * بيئتان في مجلّد PM2 واحد، مشروع compose ووسم صورة وحجم صورٍ مشتركة مع افتراضاتٍ
 * تشغّل الاختبار المسبق على منفذ الإنتاج، `pm2 start deploy/pm2/…` من داخل
 * `backend/`، وموقعٌ يرجع إلى API الإنتاج بلا `API_INTERNAL_URL`. هذا الملف فحصٌ
 * ثابت لكل ذلك: نصّ الدليل يقابل الملفات الموجودة، والملفات تعزل البيئتين.
 */
const ROOT = path.resolve(process.cwd(), '..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');
const RUNBOOK = read('deploy/README.md');
const COMPOSE = read('docker-compose.yml');
const MIGRATIONS = new Set(readdirSync(path.join(ROOT, 'backend/src/database/migrations')));
const ROLLBACKS = new Set(readdirSync(path.join(ROOT, 'backend/scripts/rollback')));

interface Pm2App {
  name: string;
  cwd: string;
  script: string;
  args?: string;
  env: Record<string, string>;
}
const PM2_APPS = (createRequire(import.meta.url)(path.join(ROOT, 'deploy/pm2/ecosystem.config.cjs')) as { apps: Pm2App[] })
  .apps;

/** أسطر الأوامر داخل كتل ```bash في الدليل. */
function bashLines(markdown: string): string[] {
  const lines: string[] = [];
  for (const block of markdown.matchAll(/```bash\n([\s\S]*?)```/g)) {
    lines.push(...block[1]!.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#')));
  }
  return lines;
}

const scriptsOf = (pkg: string) => Object.keys((JSON.parse(read(pkg)) as { scripts: Record<string, string> }).scripts);

describe('[R-17] deploy/README.md يشير إلى ما هو موجود', () => {
  it('كل هجرةٍ مذكورة بالاسم موجودة (وكل سكربت عكسٍ مذكور)', () => {
    const missing: string[] = [];
    for (const match of RUNBOOK.matchAll(/\b(\d{3}_[a-z0-9_]+?)(\.down)?(?:\.sql)?\b/g)) {
      const [, name, down] = match;
      const ok = down ? ROLLBACKS.has(`${name}.down.sql`) : MIGRATIONS.has(`${name}.sql`);
      if (!ok) missing.push(match[0]);
    }
    expect(missing).toEqual([]);
  });

  it('كل `npm run` في الدليل سكربتٌ معرَّف', () => {
    const known = new Set([...scriptsOf('backend/package.json'), ...scriptsOf('web-store/package.json')]);
    const used = bashLines(RUNBOOK).flatMap((line) => [...line.matchAll(/npm run ([\w:.-]+)/g)].map((m) => m[1]!));
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((script) => !known.has(script))).toEqual([]);
  });

  it('كل `--only` تطبيقُ PM2 معرَّف، و`pm2 start` لا يُشغَّل من داخل backend/', () => {
    const names = new Set(PM2_APPS.map((app) => app.name));
    const only = [...RUNBOOK.matchAll(/--only ([\w-]+)/g)].map((m) => m[1]!);
    expect(only.length).toBeGreaterThan(0);
    expect(only.filter((name) => !names.has(name))).toEqual([]);

    // `deploy/pm2/…` نسبيٌّ إلى جذر المستودع: آخر `cd` قبل `pm2 start` يجب ألا ينتهي بـ backend.
    let cwd = '';
    for (const line of bashLines(RUNBOOK)) {
      const cd = /^cd (\S+)/.exec(line);
      if (cd) cwd = cd[1]!;
      if (/pm2 start deploy\/pm2\//.test(line)) expect(cwd, line).not.toMatch(/\/backend\/?$/);
    }
  });

  it('كل ملف nginx مذكور موجود في deploy/nginx', () => {
    const named = [
      ...[...RUNBOOK.matchAll(/deploy\/nginx\/([\w.-]+\.conf)/g)].map((m) => m[1]!),
      ...[...RUNBOOK.matchAll(/CONF=([\w.-]+\.conf)/g)].map((m) => m[1]!),
    ];
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((file) => !existsSync(path.join(ROOT, 'deploy/nginx', file)))).toEqual([]);
  });

  it('nginx لا يُفعَّل قبل الشهادة، وفشل الفحص يلغي التفعيل', () => {
    const enable = bashLines(RUNBOOK).filter((line) => /ln -s \/etc\/nginx\/sites-available\/\$CONF/.test(line));
    expect(enable).toHaveLength(1);
    const section = RUNBOOK.slice(RUNBOOK.indexOf('## ٤.'), RUNBOOK.indexOf('## ٥.'));
    expect(section).toMatch(/test -s \/etc\/letsencrypt\/live\/\$DOMAIN\/fullchain\.pem/);
    expect(section).toMatch(/rm \/etc\/nginx\/sites-enabled\/\$CONF/);
    // `--nginx` يعيد كتابة الملفات المراجَعة ويحتاج إعداداً سليماً — لا يُستعمل أمراً.
    expect(bashLines(RUNBOOK).filter((line) => /certbot --nginx/.test(line))).toEqual([]);
  });

  it('كل أمر docker compose يسمّي مشروع بيئته، وكل خدمةٍ مذكورة موجودة', () => {
    const block = COMPOSE.slice(COMPOSE.indexOf('\nservices:'), COMPOSE.indexOf('\nvolumes:'));
    const services = new Set([...block.matchAll(/^ {2}([a-z][\w-]*):\s*$/gm)].map((m) => m[1]!));
    expect(services).toEqual(new Set(['api', 'migrate']));
    const commands = bashLines(RUNBOOK).filter((line) => /^docker compose (?!ls\b)/.test(line));
    expect(commands.length).toBeGreaterThan(0);
    for (const line of commands) {
      expect(line, line).toMatch(/ -p otaku-(staging|prod) /);
      const target = /(?:up -d|run --rm|build) ([a-z][\w-]*)/.exec(line);
      if (target) expect(services.has(target[1]!), line).toBe(true);
    }
  });

  it('أقسام الموقع والخادم القائم معلَّمة «لا تُشغَّل» حتى تُراجَع على خادم', () => {
    const web = RUNBOOK.slice(RUNBOOK.indexOf('## ١٣.'));
    expect(web).toMatch(/^> \*\*\[حرِج\] لا تُشغَّل هذا القسم\.\*\*/m);
    expect(RUNBOOK).toMatch(/\*\*لا تُشغَّل على خادمٍ يستضيف بيئةً قائمة\*\*/);
  });
});

describe('[R-17] الملفات تعزل الاختبار المسبق عن الإنتاج', () => {
  it('docker-compose.yml بلا قيمة افتراضية لملف البيئة والمنفذ ووسم الصورة', () => {
    for (const name of ['ENV_FILE', 'HOST_PORT', 'IMAGE_TAG']) {
      const uses = [...COMPOSE.matchAll(new RegExp(`\\$\\{${name}([^}]*)\\}`, 'g'))].map((m) => m[1]!);
      expect(uses.length, name).toBeGreaterThan(0);
      for (const rest of uses) expect(rest, name).toMatch(/^:\?/);
    }
  });

  it('كل تطبيق PM2 في مجلّد بيئته، ولا مجلّدان ولا منفذان مشتركان', () => {
    expect(new Set(PM2_APPS.map((app) => app.cwd)).size).toBe(PM2_APPS.length);
    for (const app of PM2_APPS) {
      const staging = app.name.endsWith('-staging');
      expect(app.name, app.name).toMatch(/-(staging|prod)$/);
      if (staging) expect(app.cwd).toMatch(/^\/srv\/otaku-galaxy-staging\//);
      else expect(app.cwd).toMatch(/^\/srv\/otaku-galaxy\//);
      if (app.name.startsWith('otaku-api-')) expect(app.env.APP_ENV).toBe(staging ? 'staging' : 'prod');
    }
    const ports = PM2_APPS.filter((app) => app.env.PORT).map((app) => app.env.PORT);
    expect(new Set(ports).size).toBe(ports.length);
  });

  it('تطبيقا الموقع يشغّلان `next start` فعلاً، على 127.0.0.1', () => {
    const web = PM2_APPS.filter((app) => app.name.startsWith('otaku-web-'));
    expect(web.map((app) => app.name).sort()).toEqual(['otaku-web-prod', 'otaku-web-staging']);
    // من ملف القفل المتتبَّع لا من node_modules: مهمة الخادم في CI لا تثبّت الموقع.
    const lock = JSON.parse(read('web-store/package-lock.json')) as {
      packages: Record<string, { bin?: Record<string, string> }>;
    };
    const nextBin = lock.packages['node_modules/next']?.bin?.next;
    expect(nextBin).toBeTruthy();
    for (const app of web) {
      expect(path.normalize(app.script)).toBe(path.normalize(path.join('node_modules/next', nextBin!)));
      expect(app.args).toBe('start -H 127.0.0.1');
      expect(app.env.NODE_ENV).toBe('production');
    }
  });

  it('سكربت `npm start` للموقع لا يثبّت منفذاً (PORT يختاره كل بيئة)', () => {
    const start = (JSON.parse(read('web-store/package.json')) as { scripts: Record<string, string> }).scripts.start!;
    expect(start).toMatch(/^next start -H 127\.0\.0\.1$/);
  });
});
