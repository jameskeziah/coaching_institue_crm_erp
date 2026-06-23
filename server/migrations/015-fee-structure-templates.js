const { migrateFeeStructureTemplates, close } = require('../db');
const { createDefaultFeeStructuresForExistingTenants } = require('../services/defaultFeeStructures.service');

async function main() {
  await migrateFeeStructureTemplates();
  await createDefaultFeeStructuresForExistingTenants();
  console.log('Fee structure templates migrated and seeded');
}

main()
  .catch((err) => {
    console.error('Fee structure template migration failed');
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await close();
  });
