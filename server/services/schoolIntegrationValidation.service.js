const crypto = require('node:crypto');
const { z } = require('zod');

const enquirySchema = z.object({
  studentName: z.string().trim().min(2).max(100),
  parentName: z.string().trim().min(2).max(100),
  parentPhone: z.string().trim().min(10).max(20),
  className: z.string().trim().min(2).max(100),
  academicYear: z.string().trim().min(4).max(20),
  enquiryTopic: z.enum([
    'availability', 'fees', 'curriculum', 'transport',
    'visit', 'accessibility', 'process', 'other',
  ]),
  preferredContactMethod: z.enum(['phone', 'email']),
  email: z.union([z.email().max(254), z.literal('')]).default(''),
  question: z.string().trim().max(1000).default(''),
  contactConsent: z.literal(true),
  website: z.string().max(200).default(''),
}).strict();

function authorized(key, expected) {
  if (typeof key !== 'string' || !expected || expected.length < 32) return false;
  const supplied = crypto.createHash('sha256').update(key).digest();
  const stored = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(supplied, stored);
}

function indianMobile(input) {
  const digits = input.replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(local) ? local : null;
}

module.exports = { enquirySchema, authorized, indianMobile };
