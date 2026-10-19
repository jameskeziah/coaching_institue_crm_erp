const crypto = require('node:crypto');
const express = require('express');
const { z } = require('zod');
const { get, run } = require('../db');
const { env } = require('../config/env');
const { findDuplicateLeads } = require('../services/duplicateLead.service');

const router = express.Router();

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

// This endpoint is for server-to-server use only. Never pass the bridge key to browser code.
// The school website must verify its anti-bot challenge before forwarding an enquiry.
router.post('/integrations/school/enquiry', async (req, res) => {
  if (!env.SCHOOL_INTEGRATION_KEY || !env.SCHOOL_TENANT_SLUG || !env.SCHOOL_BRANCH_ID) {
    return res.status(503).json({ message: 'School integration is not configured' });
  }
  if (!authorized(req.get('x-school-bridge-key'), env.SCHOOL_INTEGRATION_KEY)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const parsed = enquirySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid enquiry information' });
  }
  const data = parsed.data;

  // Honeypot: return a non-disclosing success without storing spam.
  if (data.website) return res.status(202).json({ message: 'Enquiry received' });

  const phone = indianMobile(data.parentPhone);
  if (!phone || (data.preferredContactMethod === 'email' && !data.email)) {
    return res.status(400).json({ message: 'Enter valid contact details' });
  }

  try {
    const tenant = await get(
      "SELECT id FROM tenants WHERE slug = ? AND deleted_at IS NULL AND COALESCE(status, 'Active') NOT IN ('Suspended', 'Deleted')",
      [env.SCHOOL_TENANT_SLUG],
    );
    if (!tenant) return res.status(503).json({ message: 'School routing is not available' });
    const branch = await get(
      'SELECT id FROM branches WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
      [env.SCHOOL_BRANCH_ID, tenant.id],
    );
    if (!branch) return res.status(503).json({ message: 'School routing is not available' });

    const duplicates = await findDuplicateLeads({
      tenantId: tenant.id, parentPhone: phone, studentName: data.studentName,
    });
    // Never return another lead's identity or CRM record to an unauthenticated family.
    if (duplicates.length) {
      return res.status(409).json({ message: 'An enquiry already exists for this contact number. Please contact the school office.' });
    }

    const metadata = {
      academicYear: data.academicYear,
      enquiryTopic: data.enquiryTopic,
      preferredContactMethod: data.preferredContactMethod,
      email: data.email || null,
      question: data.question || null,
      consentRecordedAt: new Date().toISOString(),
      origin: 'SSKEMS school website',
    };
    await run(
      \`INSERT INTO admissions (
        tenant_id, studentName, parentName, parentPhone,
        parentPhoneNormalized, parent_phone_normalized, className,
        courseInterested, targetExam, branchId, source, subSource,
        status, leadTemperature, estimatedRevenue, customFields,
        created_at, updated_at, deleted_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, 'School admissions', NULL, ?, 'WEBSITE', 'SSKEMS',
        'NEW', 'WARM', 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
      )\`,
      [
        tenant.id, data.studentName, data.parentName, phone, phone, phone,
        data.className, branch.id, JSON.stringify(metadata),
      ],
    );
    return res.status(201).json({ message: 'Enquiry recorded' });
  } catch (_) {
    // No PII or database detail is exposed to the public requestor.
    return res.status(500).json({ message: 'Unable to record enquiry' });
  }
});

module.exports = { router, enquirySchema, indianMobile, authorized };
