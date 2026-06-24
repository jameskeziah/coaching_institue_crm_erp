const crypto = require('crypto');
const express = require('express');

const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS } = require('../config/roles');
const { run, get, all } = require('../services/db.service');
const { getTenantFeeSettings } = require('../services/tenantFeeSettings.service');
const { getTenantRazorpayClient } = require('../services/razorpay.service');
const { createAuditLog } = require('../services/auditLog.service');

const router = express.Router();

router.get(
  '/payment-links',
  authMiddleware,
  requireTenant,
  requireAnyRole(ROLE_GROUPS.FINANCE),
  async (req, res) => {
    const rows = await all(
      `SELECT *
       FROM fee_payment_links
       WHERE tenant_id = ?
       ORDER BY created_at DESC`,
      [req.user.tenantId]
    );
    res.json({ data: rows });
  }
);

router.post(
  '/fee-installments/:installmentId/payment-link',
  authMiddleware,
  requireTenant,
  requireAnyRole(ROLE_GROUPS.FINANCE),
  async (req, res) => {
    try {
      const tenantId = req.user.tenantId;
      const installment = await get(
        `SELECT
           i.id,
           i.student_fee_plan_id AS studentFeePlanId,
           i.pending_amount AS pendingAmount,
           p.course_name AS courseName
         FROM student_fee_installments i
         JOIN student_fee_plans p
           ON p.id = i.student_fee_plan_id
          AND p.tenant_id = i.tenant_id
         WHERE i.id = ?
           AND i.tenant_id = ?`,
        [req.params.installmentId, tenantId]
      );
      if (!installment) return res.status(404).json({ error: 'Installment not found' });
      if (Number(installment.pendingAmount) <= 0) {
        return res.status(400).json({ error: 'Installment is already paid' });
      }

      const existing = await get(
        `SELECT id, razorpay_short_url AS shortUrl, status, expires_at AS expiresAt
         FROM fee_payment_links
         WHERE tenant_id = ?
           AND student_fee_installment_id = ?
           AND status IN ('CREATED', 'ISSUED', 'SENT')
         ORDER BY created_at DESC
         LIMIT 1`,
        [tenantId, installment.id]
      );
      if (existing) {
        return res.status(409).json({ error: 'An active payment link already exists', data: existing });
      }

      const settings = await getTenantFeeSettings(tenantId);
      const razorpay = await getTenantRazorpayClient(tenantId);
      if (!razorpay) return res.status(503).json({ error: 'Razorpay is not configured' });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + Number(settings.paymentLinkExpiryDays || 7));
      const paymentLink = await razorpay.paymentLink.create({
        amount: Math.round(Number(installment.pendingAmount) * 100),
        currency: settings.currency || 'INR',
        description: `Fee payment for ${installment.courseName}`,
        expire_by: Math.floor(expiresAt.getTime() / 1000),
        reference_id: installment.id,
        customer: {
          name: req.body.parentName || undefined,
          contact: req.body.parentPhone || undefined,
          email: req.body.parentEmail || undefined,
        },
        notify: { sms: false, email: false },
        notes: {
          tenantId: String(tenantId),
          installmentId: String(installment.id),
          studentFeePlanId: String(installment.studentFeePlanId),
        },
      });

      const id = crypto.randomUUID();
      await run(
        `INSERT INTO fee_payment_links
          (id, tenant_id, student_fee_plan_id, student_fee_installment_id,
           razorpay_payment_link_id, razorpay_short_url, amount, currency,
           parent_phone, parent_email, status, expires_at, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ISSUED', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          id,
          tenantId,
          installment.studentFeePlanId,
          installment.id,
          paymentLink.id,
          paymentLink.short_url,
          installment.pendingAmount,
          settings.currency || 'INR',
          req.body.parentPhone || null,
          req.body.parentEmail || null,
          expiresAt.toISOString(),
          JSON.stringify(paymentLink),
        ]
      );
      await createAuditLog({
        tenantId,
        actorUserId: req.user.id,
        action: 'FEE_PAYMENT_LINK_CREATED',
        entityType: 'FEE_PAYMENT_LINK',
        entityId: id,
        metadata: { installmentId: installment.id, amount: installment.pendingAmount },
      });
      res.status(201).json({
        message: 'Payment link created',
        data: {
          id,
          razorpayPaymentLinkId: paymentLink.id,
          shortUrl: paymentLink.short_url,
          amount: Number(installment.pendingAmount),
          expiresAt: expiresAt.toISOString(),
        },
      });
    } catch (error) {
      console.error('Failed to create payment link', error);
      res.status(500).json({ error: 'Failed to create payment link' });
    }
  }
);

router.post(
  '/payment-links/:id/send',
  authMiddleware,
  requireTenant,
  requireAnyRole(ROLE_GROUPS.FINANCE),
  async (req, res) => {
    const link = await get(
      `SELECT id, razorpay_short_url AS shortUrl, parent_phone AS parentPhone, status
       FROM fee_payment_links
       WHERE id = ?
         AND tenant_id = ?`,
      [req.params.id, req.user.tenantId]
    );
    if (!link) return res.status(404).json({ error: 'Payment link not found' });
    if (!['CREATED', 'ISSUED', 'SENT'].includes(link.status)) {
      return res.status(400).json({ error: `Payment link cannot be sent while ${link.status}` });
    }
    await run(
      `UPDATE fee_payment_links
       SET status = 'SENT', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ?`,
      [req.params.id, req.user.tenantId]
    );
    res.json({ message: 'Payment link marked as sent', data: link });
  }
);

router.patch(
  '/payment-links/:id/cancel',
  authMiddleware,
  requireTenant,
  requireAnyRole(ROLE_GROUPS.FINANCE),
  async (req, res) => {
    try {
      const link = await get(
        `SELECT id, razorpay_payment_link_id AS razorpayPaymentLinkId, status
         FROM fee_payment_links
         WHERE id = ? AND tenant_id = ?`,
        [req.params.id, req.user.tenantId]
      );
      if (!link) return res.status(404).json({ error: 'Payment link not found' });
      if (link.status === 'PAID') return res.status(400).json({ error: 'Paid links cannot be cancelled' });
      if (link.status === 'CANCELLED') return res.json({ message: 'Payment link already cancelled' });

      const razorpay = await getTenantRazorpayClient(req.user.tenantId);
      if (!razorpay) return res.status(503).json({ error: 'Razorpay is not configured' });
      await razorpay.paymentLink.cancel(link.razorpayPaymentLinkId);
      await run(
        `UPDATE fee_payment_links
         SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND tenant_id = ?`,
        [req.params.id, req.user.tenantId]
      );
      res.json({ message: 'Payment link cancelled' });
    } catch (error) {
      console.error('Failed to cancel payment link', error);
      res.status(500).json({ error: 'Failed to cancel payment link' });
    }
  }
);

module.exports = router;
