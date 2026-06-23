const { migrateSuperAdmin, close } = require('../db');

(async () => {
  try {
    await migrateSuperAdmin();
    console.log('Super admin migration completed');
  } catch (error) {
    console.error('Super admin migration failed');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await close();
  }
})();
