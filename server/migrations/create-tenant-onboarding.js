const { migrateTenantOnboarding, close } = require('../db');

(async () => {
  try {
    await migrateTenantOnboarding();
    console.log('Tenant onboarding migration completed');
  } catch (error) {
    console.error('Tenant onboarding migration failed');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await close();
  }
})();
