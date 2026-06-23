const { migrateAdmissionRealColumns, close } = require('../db');

(async () => {
  try {
    await migrateAdmissionRealColumns();
    console.log('Admission JSON backfill completed');
  } catch (error) {
    console.error('Admission JSON backfill failed:', error);
    process.exitCode = 1;
  } finally {
    await close();
  }
})();
