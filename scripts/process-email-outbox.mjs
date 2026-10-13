import db from '../server/db.js';
import outbox from '../server/services/email-outbox.service.js';

const { close, migrate } = db;
const { processDueEmailOutboxRecords } = outbox;

function numericArg(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (!arg) return fallback;
  const parsed = Number(arg.slice(prefix.length));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  await migrate();
  const results = await processDueEmailOutboxRecords({
    limit: numericArg('limit', Number(process.env.EMAIL_OUTBOX_WORKER_LIMIT || 20)),
    workerId: process.env.EMAIL_OUTBOX_WORKER_ID || `cron-${process.pid}`,
    staleAfterMs: numericArg('stale-after-ms', Number(process.env.EMAIL_OUTBOX_STALE_LOCK_MS || 600000)),
  });

  console.log(JSON.stringify({
    processedCount: results.length,
    results,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await close();
  });
