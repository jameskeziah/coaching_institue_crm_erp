const { migrateAdmissionRealColumns, migrateMarketingCampaigns, close } = require('../db');

(async () => {
  try {
    await migrateAdmissionRealColumns();
    await migrateMarketingCampaigns();
    console.log('Admission assignment, duplicate, and campaign migration completed');
  } catch (error) {
    console.error('Admission assignment, duplicate, and campaign migration failed:', error);
    process.exitCode = 1;
  } finally {
    await close();
  }
})();
