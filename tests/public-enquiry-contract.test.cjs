const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../server/routes/publicEnquiry.routes.js'), 'utf8');

test('anonymous CRM enquiries never expose existing lead details', () => {
  assert.doesNotMatch(source, /res\.status\(409\)/);
  assert.doesNotMatch(source, /duplicates:\s*duplicateLeads/);
  assert.doesNotMatch(source, /data:\s*\{\s*leadId/);
  assert.match(source, /if \(duplicateLeads\.length > 0\)/);
  assert.match(source, /return res\.status\(202\)\.json\(\{ message: 'Enquiry received\. Our team will review it\.' \}\);/);
});

test('website intake is tenant- and branch-scoped and stores allowlisted context', () => {
  assert.match(source, /WHERE slug = \?/);
  assert.match(source, /AND tenant_id = \?/);
  assert.match(source, /const safeDetails = \{\}/);
  assert.match(source, /customFields,/);
  assert.match(source, /source \|\| 'WEBSITE'/);
  assert.match(source, /contactConsent = req\.body\.contactConsent === true/);
});
