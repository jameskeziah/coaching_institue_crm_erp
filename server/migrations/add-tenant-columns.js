const {
  migrateBusinessTenantMetadataColumns,
  migrateTenantIndexes,
  close,
} = require('../db');

async function migrateTenantColumns() {
  try {
    await migrateBusinessTenantMetadataColumns();
    await migrateTenantIndexes();
    console.log('Tenant isolation migration completed.');
    await close();
    process.exit(0);
  } catch (error) {
    console.error('Tenant isolation migration failed:', error);
    await close().catch(() => {});
    process.exit(1);
  }
}

migrateTenantColumns();
