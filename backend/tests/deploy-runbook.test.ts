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
 * `backend/`، nginx مفعَّلٌ قبل شهادته، وموقعٌ يرجع إلى API الإنتاج بلا
 * `API_INTERNAL_URL`. ثم وجدت المراجعة المستقلة أن نسختي الأولى من هذا الملف
 * تمرّر ١٢ تحويراً من ١٢ (بناء الاختبار المسبق في مجلّد الإنتاج نفسه بينها)،
 * وأن `migrate` لا تُعاد صورته. لذلك يُفحص هنا **كل كتلة أوامر بقيم بيئتها**.
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

type Env = 'staging' | 'prod';
const ROOTS: Record<Env, string> = { staging: '/srv/otaku-galaxy-staging', prod: '/srv/otaku-galaxy' };
const OTHER: Record<Env, Env> = { staging: 'prod', prod: 'staging' };

/** قيمٌ لا تظهر إلا في أوامر بيئتها — ظهورها في كتلة الأخرى خلطٌ للبيئتين. */
const MARKERS: Record<Env, RegExp[]> = {
  staging: [/-p otaku-staging\b/, /HOST_PORT=4001\b/, /IMAGE_TAG=staging-/, /\.env\.staging\b/, /otaku-(api|web)-staging\b/, /:staging\b/, /localhost:4001\b/, /127\.0\.0\.1:300?1\b/, /\/srv\/otaku-galaxy-staging\b/, /= staging$/],
  prod: [/-p otaku-prod\b/, /HOST_PORT=4000\b/, /IMAGE_TAG=prod-/, /\.env\.prod\b/, /otaku-(api|web)-prod\b/, /:prod\b/, /localhost:4000\b/, /\/srv\/otaku-galaxy(\/|\s|$)/, /= prod$/],
};

/** نصّ الأمر بلا تعليقٍ في آخره (لا `#` داخل الأوامر هنا إلا تعليقاً). */
const code = (line: string) => line.replace(/\s+#\s.*$/, '').replace(/^#.*$/, '').trim();

/** أسطر الأوامر داخل كتل ```bash. */
function bashLines(markdown: string): string[] {
  const lines: string[] = [];
  for (const block of markdown.matchAll(/```bash\n([\s\S]*?)```/g)) {
    lines.push(...block[1]!.split('\n').map(code).filter(Boolean));
  }
  return lines;
}

/** كتل القشرات الفرعية `( … )` بأسطرها — وحدة التشغيل في الدليل. */
function subshells(markdown: string): string[][] {
  const blocks: string[][] = [];
  let current: string[] | null = null;
  for (const line of bashLines(markdown)) {
    if (current === null && line.startsWith('(')) current = [];
    if (current !== null) {
      current.push(line.replace(/^\(\s*(set -e)?\s*/, '').replace(/\s*\)$/, '').trim());
      if (line === ')' || line.endsWith(' )')) {
        blocks.push(current.filter(Boolean));
        current = null;
      }
    }
  }
  expect(current, 'قشرةٌ فرعية بلا قوس إغلاق').toBeNull();
  return blocks;
}

/** البيئة من أول `cd` مطلق في الكتلة. */
function envOf(block: string[]): Env | null {
  for (const line of block) {
    const cd = /^cd (\/\S+)/.exec(line);
    if (!cd) continue;
    if (cd[1]!.startsWith(ROOTS.staging)) return 'staging';
    if (cd[1] === ROOTS.prod || cd[1]!.startsWith(`${ROOTS.prod}/`)) return 'prod';
  }
  return null;
}

const scriptsOf = (pkg: string) => Object.keys((JSON.parse(read(pkg)) as { scripts: Record<string, string> }).scripts);
const section = (from: string, to: string) => RUNBOOK.slice(RUNBOOK.indexOf(from), RUNBOOK.indexOf(to));

/** كتلة خدمةٍ واحدة من docker-compose.yml (حتى الخدمة التالية أو `volumes:`). */
function serviceBlock(name: string): string {
  const start = COMPOSE.indexOf(`\n  ${name}:\n`);
  expect(start, name).toBeGreaterThan(-1);
  const rest = COMPOSE.slice(start + 1);
  const end = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n|\nvolumes:/);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

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

  it('كل `--only` تطبيقُ PM2 معرَّف، وكل ملف nginx مذكور موجود', () => {
    const names = new Set(PM2_APPS.map((app) => app.name));
    const only = [...RUNBOOK.matchAll(/--only ([\w-]+)/g)].map((m) => m[1]!);
    expect(only.length).toBeGreaterThan(0);
    expect(only.filter((name) => !names.has(name))).toEqual([]);
    const confs = [
      ...[...RUNBOOK.matchAll(/deploy\/nginx\/([\w.-]+\.conf)/g)].map((m) => m[1]!),
      ...[...RUNBOOK.matchAll(/CONF=([\w.-]+\.conf)/g)].map((m) => m[1]!),
    ];
    expect(confs.length).toBeGreaterThan(0);
    expect(confs.filter((file) => !existsSync(path.join(ROOT, 'deploy/nginx', file)))).toEqual([]);
  });

  it('أقسام الموقع والخادم القائم معلَّمة «لا تُشغَّل» حتى تُراجَع على خادم', () => {
    expect(RUNBOOK.slice(RUNBOOK.indexOf('## ١٣.'))).toMatch(/^> \*\*\[حرِج\] لا تُشغَّل هذا القسم\.\*\*/m);
    expect(RUNBOOK).toMatch(/\*\*لا تُشغَّل على خادمٍ يستضيف بيئةً قائمة\*\*/);
  });
});

describe('[R-17] كل كتلة أوامر تخصّ بيئةً واحدة وتتوقّف عند أول خطأ', () => {
  const blocks = subshells(RUNBOOK);

  it('أوامر البناء والهجرة والتشغيل داخل قشرةٍ فرعية تعرف بيئتها', () => {
    const risky = /\b(npm ci|npm run (build|db:migrate|analytics:rebuild)|pm2 (start|delete)\b|docker compose (?!ls\b))/;
    const inside = new Set(blocks.flat());
    const stray = bashLines(RUNBOOK).filter((line) => risky.test(line) && !inside.has(line.replace(/^\(\s*(set -e)?\s*/, '').replace(/\s*\)$/, '').trim()));
    expect(stray).toEqual([]);
    for (const block of blocks.filter((b) => b.some((line) => risky.test(line)))) {
      expect(envOf(block), block.join(' ⏎ ')).not.toBeNull();
    }
  });

  it('كتلة كل بيئة لا تحمل قيمةً من البيئة الأخرى، وتفحص فرعها بعد `cd`', () => {
    for (const block of blocks) {
      const env = envOf(block);
      if (env === null) continue;
      for (const line of block) {
        for (const marker of MARKERS[OTHER[env]]) expect(line, `${env}: ${line}`).not.toMatch(marker);
      }
      // فحص الفرع — إن وُجد — يلي أول `cd` مباشرةً ويسمّي فرع البيئة نفسها.
      if (block.some((line) => /git rev-parse --abbrev-ref HEAD\)" =/.test(line))) {
        const cd = block.findIndex((line) => /^cd \//.test(line));
        const test = block.findIndex((line) => line === `test "$(git rev-parse --abbrev-ref HEAD)" = ${env}`);
        expect(test, block.join(' ⏎ ')).toBe(cd + 1);
      }
    }
    // كتل `set -e` كلها (البناء والتشغيل وnginx) تفحص الفرع.
    const setE = bashLines(RUNBOOK).filter((line) => line.startsWith('( set -e')).length;
    const checked = blocks.filter((b) => b.some((line) => /^test "\$\(git rev-parse --abbrev-ref HEAD\)" = (staging|prod)$/.test(line)));
    expect(setE).toBeGreaterThan(0);
    expect(checked.length).toBe(setE);
  });

  it('كل أمر docker compose يسمّي مشروع بيئته، و`migrate` تُبنى قبل تشغيلها', () => {
    const block = COMPOSE.slice(COMPOSE.indexOf('\nservices:'), COMPOSE.indexOf('\nvolumes:'));
    const services = new Set([...block.matchAll(/^ {2}([a-z][\w-]*):\s*$/gm)].map((m) => m[1]!));
    expect(services).toEqual(new Set(['api', 'migrate', 'web']));
    const commands = bashLines(RUNBOOK).filter((line) => /docker compose (?!ls\b)/.test(line));
    expect(commands.length).toBeGreaterThan(0);
    for (const line of commands) {
      expect(line, line).toMatch(/(^|[\s(])docker compose -p otaku-(staging|prod) /);
      for (const m of line.matchAll(/(?:up -d|run --rm|build)((?: [a-z][\w-]*)+)/g)) {
        for (const svc of m[1]!.trim().split(/\s+/)) expect(services.has(svc), line).toBe(true);
      }
    }
    for (const b of blocks) {
      const run = b.findIndex((line) => /run --rm migrate/.test(line));
      if (run === -1) continue;
      const build = b.findIndex((line) => /docker compose -p \S+ build( [\w-]+)* migrate\b/.test(line));
      expect(build, b.join(' ⏎ ')).toBeGreaterThan(-1);
      expect(build).toBeLessThan(run);
    }
  });

  it('PM2 والهجرة يبدآن ببيئةٍ نظيفة، من جذر النسخة، وسجلّاتهما في مجلّدٍ يملكه المستخدم', () => {
    for (const b of blocks) {
      const env = envOf(b);
      let cwd = '';
      for (const line of b) {
        const cd = /^cd (\S+)/.exec(line);
        if (cd) cwd = cd[1] === '..' ? path.posix.dirname(cwd) : cd[1]!.startsWith('/') ? cd[1]! : `${cwd}/${cd[1]}`;
        if (/\bpm2 start\b/.test(line)) {
          expect(line, line).toMatch(/^env -i HOME="\$HOME" PATH="\$PATH" pm2 start deploy\/pm2\/ecosystem\.config\.cjs /);
          expect(cwd, line).toBe(ROOTS[env!]);
        }
        if (/npm run (db:migrate|analytics:rebuild)/.test(line)) expect(line, line).toMatch(/env -i HOME="\$HOME" PATH="\$PATH" npm run /);
        if (/^npm ci\b/.test(line)) expect(cwd.startsWith(ROOTS[env!]), `${line} @ ${cwd}`).toBe(true);
      }
    }
    expect(bashLines(RUNBOOK)).toContain('sudo install -d -o "$USER" -g "$USER" /var/log/otaku-galaxy');
    expect(RUNBOOK).not.toMatch(/mkdir -p \/var\/log\/otaku-galaxy/);
  });

  it('nginx: الشهادة قبل التفعيل، والإعادة مشروطةٌ بنجاح الفحص، والفشل يُرجع ما كان', () => {
    const enable = blocks.filter((b) => b.some((line) => /ln -s "\$AV" "\$EN"/.test(line)));
    expect(enable).toHaveLength(1);
    const b = enable[0]!;
    const at = (re: RegExp) => b.findIndex((line) => re.test(line));
    const cert = at(/test -s \/etc\/letsencrypt\/live\/\$DOMAIN\/fullchain\.pem/);
    const backup = at(/cp -p "\$AV" "\$AV\.bak"/);
    const link = at(/ln -s "\$AV" "\$EN"/);
    const check = b.indexOf('if sudo nginx -t; then');
    const reloads = b.flatMap((line, i) => (/systemctl reload nginx/.test(line) ? [i] : []));
    expect([cert, backup, link, check].every((i) => i > -1), b.join(' ⏎ ')).toBe(true);
    expect(cert).toBeLessThan(backup);
    expect(backup).toBeLessThan(link);
    expect(link).toBeLessThan(check);
    expect(reloads).toEqual([check + 1]);
    const rollback = b.slice(check + 2);
    expect(rollback[0]).toBe('else');
    expect(rollback.some((line) => /\[ "\$CREATED" = 1 \]; then sudo rm "\$EN"/.test(line))).toBe(true);
    expect(rollback.some((line) => /sudo mv "\$AV\.bak" "\$AV"/.test(line))).toBe(true);
    // `--nginx` يعيد كتابة الملفات المراجَعة ويحتاج إعداداً سليماً — لا يُستعمل أمراً.
    expect(bashLines(RUNBOOK).filter((line) => /certbot --nginx/.test(line))).toEqual([]);
    expect(section('## ٤.', '## ٥.')).toMatch(/1\.25\.1|§٠/);
  });
});

describe('[R-17] الملفات تعزل الاختبار المسبق عن الإنتاج', () => {
  it('docker-compose.yml: لا قيمة افتراضية لملف البيئة والمنفذ ووسم الصورة، ولا اسمٌ ثابت', () => {
    const api = serviceBlock('api');
    const migrate = serviceBlock('migrate');
    expect(api).toMatch(/\n {4}image: otaku-galaxy-api:\$\{IMAGE_TAG:\?[^}]+\}\n/);
    expect(api).toMatch(/\n {6}- "127\.0\.0\.1:\$\{HOST_PORT:\?[^}]+\}:4000"\n/);
    for (const svc of [api, migrate]) {
      const envFiles = /\n {4}env_file:\n((?: {6}- .*\n)+)/.exec(svc);
      expect(envFiles).not.toBeNull();
      for (const entry of envFiles![1]!.trim().split('\n')) expect(entry.trim()).toMatch(/^- \$\{ENV_FILE:\?[^}]+\}$/);
    }
    for (const name of ['ENV_FILE', 'HOST_PORT', 'IMAGE_TAG']) {
      expect(COMPOSE, name).not.toMatch(new RegExp(`\\$\\{${name}(:?-|[^:}?])`));
    }
    // اسمٌ ثابت للحاوية أو للحجم يجعله واحداً لكل مشروع — أي للبيئتين.
    expect(COMPOSE).not.toMatch(/^\s*container_name:/m);
    expect(COMPOSE.slice(COMPOSE.indexOf('\nvolumes:'))).not.toMatch(/^\s+name:/m);
  });

  it('docker-compose.yml: الموقع ملفّ بيئته وحده، ومنفذه محلي، ولا يجرّ `api` ولا يبدأ إلا باسمه', () => {
    const web = serviceBlock('web');
    expect(web).toMatch(/\n {4}profiles: \["web"\]\n/);
    expect(web).toMatch(/\n {4}image: otaku-galaxy-web:\$\{IMAGE_TAG:\?[^}]+\}\n/);
    // ملف الـAPI يحمل وصلة القاعدة وسرّ JWT: لا يصل الموقع.
    expect(web).not.toMatch(/ENV_FILE:\?/);
    // البديل مسارٌ غير موجود، و`required: true` يرفض الإنشاء بدونه.
    expect(web).toMatch(/\n {6}- path: \$\{WEB_ENV_FILE:-\.\/web-store\/\.env\.WEB_ENV_FILE-is-required\}\n {8}required: true\n/);
    // بلا منفذٍ معطى: منفذٌ عشوائي محلي، لا منفذ بيئةٍ أخرى.
    expect(web).toMatch(/\n {6}- "127\.0\.0\.1:\$\{WEB_HOST_PORT:-\}:3000"\n/);
    expect(web).not.toMatch(/depends_on:/);
    // الكتلة في الدليل تتحقّق من المنفذ المنشور قبل أن تعدّ النشر ناجحاً.
    const blocks = subshells(RUNBOOK).filter((b) => b.some((line) => /up -d --no-deps web$/.test(line)));
    expect(blocks).toHaveLength(1);
    const b = blocks[0]!;
    const up = b.findIndex((line) => /up -d --no-deps web$/.test(line));
    const port = b.findIndex((line) => /^test "\$\(docker compose -p otaku-staging --profile web port web 3000\)" = 127\.0\.0\.1:3001$/.test(line));
    expect(port, b.join(' ⏎ ')).toBe(up + 1);
  });

  it('صورة الموقع: لا ملف بيئة في سياق البناء، ولا تعمل كجذر', () => {
    const ignore = read('web-store/.dockerignore').split('\n').map((line) => line.trim());
    expect(ignore).toEqual(expect.arrayContaining(['.env', '.env.*', 'node_modules', '.next']));
    const dockerfile = read('web-store/Dockerfile').replace(/^\s*#.*$/gm, '');
    const runtime = dockerfile.slice(dockerfile.indexOf(' AS runtime'));
    expect(runtime).toMatch(/^USER node$/m);
    // لا `COPY . .` ولا نسخٌ لملف بيئة: ما يدخل الصورة مسمّى.
    expect(dockerfile).not.toMatch(/^COPY \. /m);
    expect(dockerfile).not.toMatch(/\.env/);
  });

  it('nginx الموقع على الاختبار المسبق: مغلق، لا يُفهرس، وعنوان الزبون لا يُزوَّر', () => {
    const conf = read('deploy/nginx/staging-store.conf');
    const code = conf.replace(/#.*$/gm, '');
    const tls = code.slice(code.indexOf('listen 443'));
    const at = (re: RegExp) => tls.search(re);
    // nginx الخادم 1.24: `http2 on;` يُفشل `nginx -t`.
    expect(code).not.toMatch(/http2 on;/);
    expect(tls).toMatch(/listen 443 ssl http2;/);
    // عنوان Cloudflare الحقيقي، ثم كتابةٌ فوق الترويستين — لا إلحاق.
    expect(tls).toMatch(/include \/etc\/nginx\/snippets\/cloudflare-real-ip\.conf;/);
    expect(tls).toMatch(/proxy_set_header X-Real-IP\s+\$remote_addr;/);
    expect(tls).toMatch(/proxy_set_header X-Forwarded-For\s+\$remote_addr;/);
    expect(code).not.toMatch(/\$proxy_add_x_forwarded_for/);
    expect(tls).toMatch(/proxy_set_header Authorization\s+"";/);
    expect(tls).toMatch(/proxy_set_header CF-Connecting-IP\s+"";/);
    expect(tls).toMatch(/proxy_pass http:\/\/127\.0\.0\.1:3001;/);
    // مغلق ولا يُفهرس، على مستوى الخادم كله (قبل أول location).
    const firstLocation = at(/\n\s*location /);
    for (const re of [
      /\n\s*auth_basic\s+"/,
      /\n\s*auth_basic_user_file \/etc\/nginx\/staging-store\.htpasswd;/,
      /\n\s*add_header X-Robots-Tag "noindex, nofollow[^"]*" always;/,
    ]) {
      const i = at(re);
      expect(i, String(re)).toBeGreaterThan(-1);
      expect(i, String(re)).toBeLessThan(firstLocation);
    }
    // `add_header` داخل location يُسقط ترويسة الخادم من ذلك الموقع.
    for (const block of tls.slice(firstLocation).split(/\n\s*location /)) expect(block).not.toMatch(/add_header/);
    // الاستثناء الوحيد من كلمة المرور: robots.txt يمنع الكل.
    expect([...tls.matchAll(/auth_basic off;/g)]).toHaveLength(1);
    expect(tls).toMatch(/location = \/robots\.txt \{\s*auth_basic off;\s*default_type text\/plain;\s*return 200 "User-agent: \*\\nDisallow: \/\\n";\s*\}/);
    // لا HSTS قبل التحقّق من HTTPS على النطاق.
    expect(code).not.toMatch(/Strict-Transport-Security/);

    const snippet = read('deploy/nginx/snippets/cloudflare-real-ip.conf').replace(/#.*$/gm, '');
    expect(snippet).toMatch(/^real_ip_header CF-Connecting-IP;$/m);
    expect(snippet).not.toMatch(/real_ip_recursive on|set_real_ip_from (0\.0\.0\.0\/0|::\/0)/);
    expect([...snippet.matchAll(/^set_real_ip_from \S+;$/gm)].length).toBeGreaterThan(10);
  });

  it('كل تطبيق PM2 في مجلّد بيئته، ولا مجلّدان ولا منفذان مشتركان', () => {
    expect(new Set(PM2_APPS.map((app) => app.cwd)).size).toBe(PM2_APPS.length);
    for (const app of PM2_APPS) {
      const env: Env = app.name.endsWith('-staging') ? 'staging' : 'prod';
      expect(app.name, app.name).toMatch(/-(staging|prod)$/);
      expect(app.cwd.startsWith(`${ROOTS[env]}/`), app.name).toBe(true);
      if (env === 'prod') expect(app.cwd.startsWith(`${ROOTS.staging}/`)).toBe(false);
      if (app.name.startsWith('otaku-api-')) expect(app.env.APP_ENV).toBe(env);
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
