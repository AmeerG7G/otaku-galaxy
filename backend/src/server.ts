import { createApp } from './app.js';
import { config } from './config/index.js';
import { closePools } from './database/pool.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`Otaku Galaxy API running on http://localhost:${config.port}`);
  if (config.verification.provider === 'development') {
    console.log('⚠  VERIFICATION_PROVIDER=development — رمز التحقق ثابت 123456');
  }
});

async function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down...`);
  server.close(async () => {
    await closePools();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));