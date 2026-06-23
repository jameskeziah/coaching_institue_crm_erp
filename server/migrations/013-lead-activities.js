const { migrateLeadActivities, close } = require('../db');

(async () => {
  try {
    await migrateLeadActivities();
    console.log('Lead activities migration completed');
  } catch (error) {
    console.error('Lead activities migration failed:', error);
    process.exitCode = 1;
  } finally {
    await close();
  }
})();
