/**
 * إثبات حماية البيع فوق المخزون عبر **عمليات خادم مستقلّة**.
 *
 * [CRITICAL] لماذا لا يكفي اختبار العملية الواحدة؟
 *
 * `oversell-guard.test.ts` يثبت الحماية داخل عملية Node واحدة. لكن حارساً
 * على مستوى التطبيق (mutex، أو طابور، أو ذاكرة مشتركة) كان سينجح في ذلك
 * الاختبار **وينهار في الإنتاج** لحظة تشغيل نسخةٍ ثانية خلف موازِن حِمل:
 * لكل عملية ذاكرتُها، فلا يرى قفلُ إحداهما الأخرى. الاختبار الوحيد الذي
 * يفرّق بين «قفلٌ في PostgreSQL» و«قفلٌ في الذاكرة» هو أن تأتي الطلبات من
 * عمليتين لا تعرف إحداهما الأخرى، ولا تشتركان إلّا في قاعدة البيانات.
 *
 * [CONTRACT 2026-09-14] المخزون يُستهلك عند **قبول الإدارة** لا عند إرسال
 * الزبون. فالسباق الذي يُقاس هو سباق **القبولين**: الإرسالان يمرّان معاً
 * (لا حجز عند الإرسال)، ثم يُطلق قبولاهما من عمليتين مختلفتين في اللحظة
 * نفسها — وواحدٌ فقط يجب أن يبيع.
 *
 * ما يفعله هذا السكربت:
 *   ١. يشغّل خادمين مستقلّين (عمليتان، منفذان، مجمّعا اتصالات منفصلان)
 *      على قاعدة البيانات نفسها.
 *   ٢. يهيّئ منتجاً بمخزون ٣ ومسؤولاً يسجّل دخوله عبر كلا الخادمين.
 *   ٣. يسجّل زبونين، كلٌّ عبر خادمٍ مختلف، فتُنشأ عربتاهما في عمليتين،
 *      ويرسل طلبيهما — كلاهما ٢٠١ والمخزون ما زال ٣.
 *   ٤. يطلق قبولَي الطلبين إلى المنفذين المختلفين عند طابعٍ زمني واحد.
 *   ٥. يتحقّق: ٢٠٠ واحد، ٤٠٩ `INSUFFICIENT_STOCK` واحد، مبيعٌ ٣، مخزونٌ ٠،
 *      ولا مخزون سالب، والخاسر باقٍ في الانتظار لا مقبولاً بلا بضاعة.
 *
 * التشغيل:
 *   cd backend && npx tsx scripts/oversell-multi-instance.ts
 *   ROUNDS=10 CONTENTION=6 npx tsx scripts/oversell-multi-instance.ts
 *   TARGET_DATABASE_URL=postgres://…/otaku_galaxy_staging npx tsx …
 *
 * الافتراضي قاعدةُ الاختبار (`TEST_DATABASE_URL`) كي لا تُمسّ بيانات التطوير.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import pg from 'pg';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '..');
dotenv.config({ path: path.join(BACKEND, '.env'), quiet: true });

const DB_URL =
  process.env.TARGET_DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL!;
const PORTS = [
  Number(process.env.PORT_A ?? 4101),
  Number(process.env.PORT_B ?? 4102),
];
const ROUNDS = Number(process.env.ROUNDS ?? 10);
const CONTENTION = Number(process.env.CONTENTION ?? 6);
const STOCK = 3;

const db = new pg.Pool({ connectionString: DB_URL, max: 4 });
const children: ChildProcess[] = [];
let failures = 0;

const log = (m: string) => console.log(m);
const fail = (m: string) => {
  failures += 1;
  console.error(`  ✗ ${m}`);
};
const ok = (m: string) => console.log(`  ✓ ${m}`);

/** يشغّل خادماً مستقلّاً ويعيد وعداً ينتهي حين يستجيب /health. */
async function startInstance(port: number): Promise<ChildProcess> {
  // [CRITICAL] `tsx` مباشرةً لا عبر `npx`، و`detached` لتكوين مجموعة
  // عمليات: `npx` يولّد حفيداً لا يموت بقتل الأب، فتبقى نسخةٌ قديمة
  // ممسكةً بالمنفذ وتستقبل طلبات التشغيل التالي — وقع ذلك فعلاً هنا،
  // فظهرت نتيجةٌ من شيفرةٍ سابقة للإصلاح وبدت كأنها فشلُ الإصلاح.
  const child = spawn(
    path.join(BACKEND, 'node_modules/.bin/tsx'),
    ['src/server.ts'],
    {
      cwd: BACKEND,
      detached: true,
      env: {
        ...process.env,
        APP_ENV: 'dev',
        NODE_ENV: 'development',
        PORT: String(port),
        DATABASE_URL: DB_URL,
        // كل عملية تفتح مجمّعها الخاص — لا مشاركة اتصالات بينهما.
        PGAPPNAME: `oversell-instance-${port}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  children.push(child);
  child.stderr?.on('data', (b: Buffer) => {
    const t = b.toString();
    if (/error|Error|EADDRINUSE/.test(t)) process.stderr.write(`[${port}] ${t}`);
  });

  const deadline = Date.now() + 60_000;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`instance ${port} never became healthy`);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.ok) return child;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

function stopAll() {
  for (const c of children) {
    if (c.pid === undefined) continue;
    // قتلُ المجموعة كلها (سالب المعرّف) لا العملية وحدها.
    try {
      process.kill(-c.pid, 'SIGKILL');
    } catch {
      try {
        c.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }
  }
}

async function api(port: number, method: string, route: string, body?: unknown, token?: string) {
  const res = await fetch(`http://127.0.0.1:${port}/api${route}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, body: json };
}

const ADMIN_PHONE = '+9647800000001';
const ADMIN_PASSWORD = 'multi-instance-admin-not-a-default';

/** مسؤولٌ للسكربت: صفٌّ مباشر في القاعدة (كما في `tests/helpers.ts`) — مرةً واحدة. */
async function ensureAdmin() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await db.query(
    `INSERT INTO users (username, phone, password_hash, role, phone_verified_at)
     VALUES ('مدير تزامن', $1, $2, 'admin', now())
     ON CONFLICT (phone) DO UPDATE
       SET role = 'admin', password_hash = EXCLUDED.password_hash,
           is_active = TRUE, phone_verified_at = now()`,
    [ADMIN_PHONE, passwordHash],
  );
}

/** تسجيل دخول المسؤول **عبر المنفذ المعطى** — فتوكن كل نسخة صادر من تلك العملية. */
async function adminLogin(port: number) {
  const login = await api(port, 'POST', '/auth/login', { phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
  const token = login.body?.data?.token;
  if (!token) throw new Error(`admin login failed on :${port} — ${JSON.stringify(login.body)}`);
  return token as string;
}

/**
 * يسجّل زبوناً **عبر المنفذ المعطى** فتُنشأ جلستُه في تلك العملية.
 *
 * لا رمز تحقق: التسجيل طلبٌ تحسمه الإدارة، فالتفعيل يمرّ من المسار الإداري
 * الحقيقي (`/admin/account-requests/:id/approve`) عبر المنفذ نفسه.
 */
async function customer(port: number, adminToken: string) {
  const phone = `077${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const registered = await api(port, 'POST', '/auth/register', {
    username: 'مختبر تزامن',
    phone,
    password: 'secret123',
    gender: 'male',
  });
  const requestId = registered.body?.data?.request?.id;
  if (!requestId) throw new Error(`register failed on :${port} — ${JSON.stringify(registered.body)}`);
  const approved = await api(port, 'POST', `/admin/account-requests/${requestId}/approve`, undefined, adminToken);
  if (approved.status !== 200) throw new Error(`approve failed on :${port} — ${JSON.stringify(approved.body)}`);
  const login = await api(port, 'POST', '/auth/login', { phone, password: 'secret123' });
  const token = login.body?.data?.token;
  if (!token) throw new Error(`login failed on :${port} — ${JSON.stringify(login.body)}`);
  return { token, phone };
}

async function scalar<T>(sql: string, params: unknown[]): Promise<T> {
  const { rows } = await db.query(sql, params);
  return Object.values(rows[0] ?? {})[0] as T;
}

async function ensureCatalog() {
  const categoryId = await scalar<string>(
    `INSERT INTO categories (name, image_url) VALUES ('تزامن اختبار','')
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [],
  );
  const governorateId = await scalar<string>(
    `INSERT INTO governorates (name, delivery_fee) VALUES ('بغداد', 4000)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [],
  );
  return { categoryId, governorateId };
}

/** منتج جديد لكل جولة — لا إعادة استعمالٍ تخفي أثر جولةٍ سابقة. */
async function freshProduct(categoryId: string, round: string) {
  return scalar<string>(
    `INSERT INTO products (name, description, price, category_id, stock, is_active)
     VALUES ($1, 'منتج تزامن', 1000, $2, $3, TRUE) RETURNING id`,
    [`MULTIINST ${round}`, categoryId, STOCK],
  );
}

const ORDER = (governorateId: string) => ({
  governorateId,
  fullAddress: 'بغداد، الكرادة',
  phone: '07700000000',
});

/** يجعل الطلبات تنطلق في اللحظة نفسها قدر المستطاع. */
async function atBarrier<T>(startAt: number, fn: () => Promise<T>): Promise<T> {
  const wait = startAt - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return fn();
}

/** المباع فعلاً = أسطر الطلبات التي **قُبلت** (غادرت الانتظار ولم تُرفض). */
async function verifyRound(productId: string, expectedSold: number, label: string) {
  const sold = Number(
    await scalar<string>(
      `SELECT COALESCE(SUM(oi.quantity),0)::text
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = $1
          AND o.status NOT IN ('PENDING_ADMIN_CONFIRMATION', 'REJECTED')`,
      [productId],
    ),
  );
  const stock = Number(await scalar<number>('SELECT stock FROM products WHERE id = $1', [productId]));
  const orphans = Number(
    await scalar<string>(
      `SELECT COUNT(*)::text FROM order_items oi
        WHERE oi.product_id = $1
          AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = oi.order_id)`,
      [productId],
    ),
  );
  if (sold !== expectedSold) fail(`${label}: وحدات مباعة ${sold} ≠ ${expectedSold}`);
  if (stock !== STOCK - expectedSold) fail(`${label}: مخزون ${stock} ≠ ${STOCK - expectedSold}`);
  if (stock < 0) fail(`${label}: مخزون سالب (${stock})`);
  if (orphans !== 0) fail(`${label}: ${orphans} سطر طلبٍ يتيم`);
  return { sold, stock, orphans };
}

async function main() {
  log(`قاعدة البيانات: ${DB_URL.replace(/:[^:@]*@/, ':***@')}`);
  // [CRITICAL] منفذٌ مشغول سلفاً يعني أن الطلبات ستذهب إلى خادمٍ قديم،
  // فتُقرأ نتيجتُه على أنها نتيجة الشيفرة الحالية. السقوط هنا أوضح.
  for (const port of PORTS) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.ok) {
        throw new Error(
          `المنفذ ${port} مشغول سلفاً — أوقف النسخة القديمة قبل التشغيل، ` +
            'وإلّا قِيس خادمٌ آخر غير الذي تبنيه',
        );
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('مشغول سلفاً')) throw e;
      /* المنفذ حرّ — وهو المطلوب */
    }
  }
  log(`تشغيل خادمين مستقلّين على ${PORTS[0]} و ${PORTS[1]} …`);
  await Promise.all(PORTS.map(startInstance));

  // إثبات أن العمليتين منفصلتان فعلاً ولهما اتصالات مستقلّة بالقاعدة.
  const conns = await db.query<{ application_name: string; n: string }>(
    `SELECT application_name, COUNT(*)::text AS n FROM pg_stat_activity
      WHERE application_name LIKE 'oversell-instance-%' GROUP BY 1 ORDER BY 1`,
    [],
  );
  log(`  اتصالات PostgreSQL لكل عملية: ${conns.rows.map((r) => `${r.application_name}=${r.n}`).join(', ') || '(لم تُسمَّ)'}`);
  if (conns.rows.length === 2) ok('العمليتان تفتحان مجمّعَي اتصالات منفصلين');

  const { categoryId, governorateId } = await ensureCatalog();

  // مسؤولٌ واحد بتوكنٍ من كل نسخة — القبول يُطلق من العمليتين لا من واحدة.
  await ensureAdmin();
  const [adminA, adminB] = await Promise.all(PORTS.map(adminLogin));
  const ADMIN_TOKENS = [adminA, adminB];
  const approve = (port: number, orderId: string, token: string) =>
    api(port, 'PATCH', `/admin/orders/${orderId}/status`, { status: 'OUT_FOR_DELIVERY' }, token);

  // ═════════ الجزء ١: قبولان متزامنان عبر خادمين مختلفين ═════════
  let successes = 0;
  let conflicts = 0;
  for (let round = 1; round <= ROUNDS; round += 1) {
    const productId = await freshProduct(categoryId, `R${round}-${Date.now()}`);
    const [a, b] = await Promise.all([customer(PORTS[0]!, adminA), customer(PORTS[1]!, adminB)]);
    await api(PORTS[0]!, 'POST', '/cart', { productId, quantity: STOCK }, a.token);
    await api(PORTS[1]!, 'POST', '/cart', { productId, quantity: STOCK }, b.token);

    // الإرسال لا يحجز: كلا الطلبين يُقبل إنشاؤه والمخزون كامل.
    const [sa, sb] = await Promise.all([
      api(PORTS[0]!, 'POST', '/orders', ORDER(governorateId), a.token),
      api(PORTS[1]!, 'POST', '/orders', ORDER(governorateId), b.token),
    ]);
    if (sa.status !== 201 || sb.status !== 201) {
      fail(`جولة ${round}: الإرسال ${sa.status}/${sb.status} — المتوقَّع 201/201 (لا حجز عند الإرسال)`);
      continue;
    }
    const stockBefore = Number(await scalar<number>('SELECT stock FROM products WHERE id = $1', [productId]));
    if (stockBefore !== STOCK) fail(`جولة ${round}: الإرسال نزّل المخزون (${stockBefore} ≠ ${STOCK})`);
    const orderA = sa.body.data.id as string;
    const orderB = sb.body.data.id as string;

    const startAt = Date.now() + 250;
    const [ra, rb] = await Promise.all([
      atBarrier(startAt, () => approve(PORTS[0]!, orderA, adminA)),
      atBarrier(startAt, () => approve(PORTS[1]!, orderB, adminB)),
    ]);

    const codes = [ra.status, rb.status].sort();
    const accepted = codes.filter((c) => c === 200).length;
    const rejected = codes.filter((c) => c === 409).length;
    successes += accepted;
    conflicts += rejected;

    const detail = await verifyRound(productId, STOCK, `جولة ${round}`);
    if (accepted !== 1 || rejected !== 1) {
      fail(`جولة ${round}: الرموز ${codes.join('/')} — المتوقَّع 200/409`);
    } else {
      ok(`جولة ${round}: ${codes.join('/')} · مبيع ${detail.sold} · مخزون ${detail.stock}`);
    }
    const loser = ra.status === 409 ? ra : rb;
    if (rejected === 1 && loser.body?.error?.code !== 'INSUFFICIENT_STOCK') {
      fail(`جولة ${round}: رمز الرفض ${loser.body?.error?.code} ≠ INSUFFICIENT_STOCK`);
    }
    // الخاسر يبقى منتظراً — لا طلبٌ مقبول بلا بضاعة.
    const statuses = (
      await db.query<{ status: string }>('SELECT status FROM orders WHERE id = ANY($1::uuid[]) ORDER BY status', [[orderA, orderB]])
    ).rows.map((r) => r.status);
    if (statuses.join('/') !== 'OUT_FOR_DELIVERY/PENDING_ADMIN_CONFIRMATION') {
      fail(`جولة ${round}: الحالتان ${statuses.join('/')} — المتوقَّع OUT_FOR_DELIVERY/PENDING_ADMIN_CONFIRMATION`);
    }
  }

  // ═════════ الجزء ٢: ضغطٌ أعلى — قبولات متزامنة موزَّعة على الخادمين ═════════
  log(`\nضغط أعلى: ${CONTENTION} طلباً منتظراً بقطعةٍ واحدة على مخزون ${STOCK}، قبولاتها موزَّعة على الخادمين`);
  const productId = await freshProduct(categoryId, `C-${Date.now()}`);
  const buyers = await Promise.all(
    Array.from({ length: CONTENTION }, (_, i) => customer(PORTS[i % 2]!, ADMIN_TOKENS[i % 2]!)),
  );
  await Promise.all(
    buyers.map((b, i) => api(PORTS[i % 2]!, 'POST', '/cart', { productId, quantity: 1 }, b.token)),
  );
  const submitted = await Promise.all(
    buyers.map((b, i) => api(PORTS[i % 2]!, 'POST', '/orders', ORDER(governorateId), b.token)),
  );
  const pendingIds = submitted.filter((r) => r.status === 201).map((r) => r.body.data.id as string);
  if (pendingIds.length !== CONTENTION) {
    fail(`ضغط: ${pendingIds.length}/${CONTENTION} طلباً أُنشئ — الإرسال يجب ألّا يُرفض (لا حجز)`);
  }
  const startAt = Date.now() + 400;
  const results = await Promise.all(
    pendingIds.map((id, i) =>
      atBarrier(startAt, () => approve(PORTS[i % 2]!, id, ADMIN_TOKENS[i % 2]!)),
    ),
  );
  const created = results.filter((r) => r.status === 200).length;
  const rejected = results.filter((r) => r.status === 409).length;
  const c = await verifyRound(productId, STOCK, 'ضغط');
  if (created !== STOCK) fail(`ضغط: ${created} قبولاً نجح — المتوقَّع ${STOCK}`);
  else ok(`ضغط: ${created} قبولاً نجح و${rejected} رُفض · مبيع ${c.sold} · مخزون ${c.stock}`);

  // ═════════ تنظيف ═════════
  await db.query(
    `DELETE FROM order_status_history WHERE order_id IN (
       SELECT DISTINCT oi.order_id FROM order_items oi
        WHERE oi.product_id IN (SELECT id FROM products WHERE name LIKE 'MULTIINST %'))`,
  );
  await db.query(
    `DELETE FROM notifications WHERE order_id IN (
       SELECT DISTINCT oi.order_id FROM order_items oi
        WHERE oi.product_id IN (SELECT id FROM products WHERE name LIKE 'MULTIINST %'))`,
  );
  await db.query(
    `DELETE FROM order_items WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'MULTIINST %')`,
  );
  await db.query(
    `DELETE FROM orders WHERE id NOT IN (SELECT order_id FROM order_items) AND user_id IN
       (SELECT id FROM users WHERE phone LIKE '+96477%')`,
  );
  await db.query(
    `DELETE FROM cart_items WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'MULTIINST %')`,
  );
  await db.query(`DELETE FROM products WHERE name LIKE 'MULTIINST %'`);

  log(
    `\nالحصيلة: ${ROUNDS} جولة قبولين · نجاح ${successes} · رفض ${conflicts} · ` +
      `ضغط ${created}/${CONTENTION} · أعطال ${failures}`,
  );
  if (failures > 0) {
    console.error('\n✗ فشل: الحماية لا تصمد عبر العمليات المستقلّة');
    process.exitCode = 1;
  } else {
    console.log('\n✓ الحماية تصمد عبر عمليات خادم مستقلّة تتشارك PostgreSQL وحدها');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    stopAll();
    await db.end().catch(() => {});
    setTimeout(() => process.exit(process.exitCode ?? 0), 500);
  });
