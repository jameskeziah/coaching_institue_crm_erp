const test = require('node:test');
const assert = require('node:assert/strict');
const {
  enquirySchema,
  authorized,
  indianMobile,
} = require('../services/schoolIntegrationValidation.service');

const sample = {
  studentName: 'Aarav Example',
  parentName: 'Parent Example',
  parentPhone: '9876543210',
  className: 'Class I',
  academicYear: '2026–27',
  enquiryTopic: 'fees',
  preferredContactMethod: 'phone',
  email: '',
  question: 'Please provide fee details.',
  contactConsent: true,
  website: '',
};

test('accepts a short, consented school enquiry', () => {
  assert.equal(enquirySchema.safeParse(sample).success, true);
  assert.equal(enquirySchema.safeParse({ ...sample, contactConsent: false }).success, false);
  assert.equal(enquirySchema.safeParse({ ...sample, enquiryTopic: 'unsafe-topic' }).success, false);
  assert.equal(enquirySchema.safeParse({ ...sample, question: 'x'.repeat(1001) }).success, false);
  assert.equal(enquirySchema.safeParse({ ...sample, secretExtra: 'ignored' }).success, false);
});

test('validates Indian mobile numbers consistently', () => {
  assert.equal(indianMobile('+91 98765 43210'), '9876543210');
  assert.equal(indianMobile('9876543210'), '9876543210');
  assert.equal(indianMobile('1234567890'), null);
  assert.equal(indianMobile('9999'), null);
});

test('rejects missing, wrong and short server-to-server keys', () => {
  const key = '0123456789abcdef0123456789abcdef';
  assert.equal(authorized(key, key), true);
  assert.equal(authorized('x'.repeat(32), key), false);
  assert.equal(authorized(undefined, key), false);
  assert.equal(authorized('short', 'short'), false);
});
