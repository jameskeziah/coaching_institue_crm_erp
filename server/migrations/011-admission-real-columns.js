const { migrateAdmissionRealColumns, close } = require('../db');

(async () => {
  try {
    await migrateAdmissionRealColumns();
    console.log('Admission real columns migration completed');
  } catch (error) {
    console.error('Admission real columns migration failed:', error);
    process.exitCode = 1;
  } finally {
    await close();
  }
})();
