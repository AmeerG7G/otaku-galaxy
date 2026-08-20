import 'dotenv/config';

/** مركزي لقراءة إعدادات البيئة مع قيم افتراضية آمنة للتطوير المحلي. */
export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isDev: (process.env.NODE_ENV ?? 'development') === 'development',

  port: Number(process.env.PORT ?? 4000),

  databaseUrl:
    process.env.DATABASE_URL ??
    'postgres://otaku_galaxy_app:change_me_dev_password@localhost:5432/otaku_galaxy',
  testDatabaseUrl:
    process.env.TEST_DATABASE_URL ??
    'postgres://otaku_galaxy_app:change_me_dev_password@localhost:5432/otaku_galaxy_test',
  migrationDatabaseUrl: process.env.MIGRATION_DATABASE_URL ?? '',

  jwtSecret: process.env.JWT_SECRET ?? 'insecure_dev_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 10),

  verification: {
    provider: process.env.VERIFICATION_PROVIDER ?? 'development',
    lifetimeMinutes: Number(process.env.VERIFICATION_CODE_LIFETIME_MINUTES ?? 10),
    maxAttempts: Number(process.env.VERIFICATION_MAX_ATTEMPTS ?? 5),
    developmentCode: process.env.DEVELOPMENT_OTP_CODE ?? '123456',
  },

  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
    globalMax: Number(process.env.RATE_LIMIT_GLOBAL_MAX ?? 300),
    authMax: Number(process.env.RATE_LIMIT_AUTH_MAX ?? 10),
  },
} as const;

export const isTest = process.env.NODE_ENV === 'test' || import.meta.url.includes('vitest');