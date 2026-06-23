const express = require('express');
const { run, get } = require('../db');
const authMiddleware = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { requireAnyRole } = require('../middleware/rbac');
const { ROLE_GROUPS, ROLES } = require('../config/roles');
const { currentTenantId } = require('../utils/request');

const router = express.Router();

router.patch('/leads/:leadId/counsellor', authMiddleware, requireTenant, requireAnyRole(ROLE_GROUPS.ADMISSIONS), async (req, res) => {
  try {
    const tenantId = currentTenantId(req);
    const { leadId } = req.params;
    const { counsellorId } = req.body;

    if (!counsellorId) {
      return res.status(400).json({ message: 'Counsellor is required', error: 'Counsellor is required' });
    }

    const counsellor = await get(
      `SELECT id
       FROM users
       WHERE id = ?
       AND tenant_id = ?
       AND is_active = 1
       AND deleted_at IS NULL
       AND role IN (?, ?, ?, ?)`,
      [counsellorId, tenantId, ROLES.OWNER, ROLES.DIRECTOR, ROLES.ADMIN, ROLES.COUNSELLOR]
    );

    if (!counsellor) {
      return res.status(400).json({ message: 'Invalid counsellor selected', error: 'Invalid counsellor selected' });
    }

    const result = await run(
      `UPDATE admissions
       SET counsellorId = ?,
           counsellor_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
       AND tenant_id = ?
       AND deleted_at IS NULL`,
      [counsellorId, counsellorId, leadId, tenantId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ message: 'Admission lead not found', error: 'Admission lead not found' });
    }

    return res.json({ message: 'Counsellor assigned successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to assign counsellor', error: 'Failed to assign counsellor' });
  }
});

module.exports = router;
