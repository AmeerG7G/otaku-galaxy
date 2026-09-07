# syntax=docker/dockerfile:1

# ==============================================================================
# صورة خادم مجرّة الأوتاكو — بناء متعدّد المراحل.
#
# المرحلتان تخدمان غرضين مختلفين:
#   • `builder` يحمل أدوات التطوير كاملةً (typescript, tsx) ويبني `dist/`.
#     منه أيضاً تُشغَّل الهجرات، لأن `scripts/migrate.ts` خارج `rootDir`
#     فلا يترجمه `tsc` ويحتاج `tsx` — انظر خدمة `migrate` في compose.
#   • `runtime` لا يحمل شيئاً من ذلك: اعتماديات الإنتاج و`dist/` فقط.
#
# الصورة نفسها تخدم `staging` و`prod`؛ الفرق كله في متغيّرات البيئة التي
# تُمرَّر عند التشغيل. لا يُخبز فيها إعدادٌ ولا سرّ.
# ==============================================================================

# الإصدار نفسه الذي يستعمله التكامل المستمر (`.github/workflows/ci.yml`).
ARG NODE_VERSION=22

# ---------- المرحلة الأولى: البناء ----------
FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

# طبقة الاعتماديات وحدها أولاً: تغيير الشيفرة لا يُبطل ذاكرة npm المؤقّتة.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

# يُخرج `dist/` وفق tsconfig (rootDir=src ، outDir=dist).
RUN npm run build

# ---------- المرحلة الثانية: التشغيل ----------
FROM node:${NODE_VERSION}-alpine AS runtime

# `dumb-init` يستقبل الإشارات كعملية أولى ويمرّرها إلى node.
# بدونه يعمل node بالمعرّف 1 ولا يتلقّى SIGTERM بالسلوك المتوقَّع، فيُقتل
# بـSIGKILL بعد المهلة بدل أن يُغلق اتصالاته وقاعدته بهدوء.
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
WORKDIR /app

# اعتماديات الإنتاج فقط — لا typescript ولا tsx ولا vitest.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# لا تُنسخ ملفات الهجرة هنا عمداً: صورة التشغيل لا تستطيع تطبيقها أصلاً
# لأن `scripts/migrate.ts` يحتاج `tsx` وهي أداة تطوير مستبعَدة من هذه
# المرحلة. الهجرة تعمل من مرحلة `builder` حيث المصدر والأداة معاً (خدمة
# `migrate` في compose). نسخُها إلى هنا كان يوحي بقدرةٍ غير موجودة.

# مجلد الرفع يُنشأ ويُملَّك للمستخدم غير الجذر قبل التنازل عن الصلاحيات.
# في الإنتاج يجب أن يُركَّب فوقه حجم دائم (volume) وإلا ضاعت الصور مع كل
# إعادة بناء — انظر `docker-compose.yml`.
RUN mkdir -p /app/uploads && chown -R node:node /app

# لا تعمل كجذر. `node` مستخدم جاهز في صور node الرسمية.
USER node

EXPOSE 4000

# فحص الصحّة يستعمل نقطة `/health` القائمة. `PORT` قابل للتغيير من البيئة،
# فيُقرأ داخل الأمر لا يُخبز رقماً.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const p=process.env.PORT||4000;require('http').get('http://127.0.0.1:'+p+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]

# لا `APP_ENV` هنا عمداً: الإعدادات ترفض الإقلاع حين تكون البيئة غامضة
# (`NODE_ENV=production` بلا `APP_ENV`). تمريرها صراحةً عند التشغيل هو ما
# يمنع تشغيل صورة الإنتاج بإعدادات الاختبار المسبق بالخطأ.
CMD ["node", "dist/server.js"]
