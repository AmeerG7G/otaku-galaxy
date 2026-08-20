import { config } from '../src/config/index.js';
import { runMigrations } from '../scripts/migrate.js';

export default async function globalSetup() {
  await runMigrations(config.testDatabaseUrl);
}