const crypto = require('crypto');
const { run, all } = require('../db');
const { LEAD_ACTIVITY_TYPES } = require('../config/lead-activity.constants');

function getLeadActivityTitle(type, payload = {}) {
  switch (type) {
    case LEAD_ACTIVITY_TYPES.CALL_NOTE:
      return 'Call note added';
    case LEAD_ACTIVITY_TYPES.WHATSAPP_NOTE:
      return 'WhatsApp note added';
    case LEAD_ACTIVITY_TYPES.VISIT_NOTE:
      return 'Visit note added';
    case LEAD_ACTIVITY_TYPES.COUNSELLING_NOTE:
      return 'Counselling note added';
    case LEAD_ACTIVITY_TYPES.STATUS_CHANGE:
      return `Status changed from ${payload.oldStatus || 'Unknown'} to ${payload.newStatus || 'Unknown'}`;
    case LEAD_ACTIVITY_TYPES.DEMO_SCHEDULED:
      return 'Demo scheduled';
    case LEAD_ACTIVITY_TYPES.DEMO_COMPLETED:
      return 'Demo completed';
    case LEAD_ACTIVITY_TYPES.FEE_DISCUSSED:
      return 'Fee discussed';
    case LEAD_ACTIVITY_TYPES.FOLLOW_UP_CREATED:
      return 'Follow-up created';
    case LEAD_ACTIVITY_TYPES.LEAD_CONVERTED:
      return 'Lead converted to student';
    case LEAD_ACTIVITY_TYPES.LEAD_LOST:
      return 'Lead marked as lost';
    default:
      return 'Lead activity added';
  }
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
}

async function createLeadActivity({
  tenantId,
  leadId,
  branchId = null,
  createdByUserId = null,
  type,
  title,
  note = null,
  oldStatus = null,
  newStatus = null,
  activityAt = new Date().toISOString(),
  metadata = {},
}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const finalTitle = title || getLeadActivityTitle(type, { oldStatus, newStatus });

  await run(
    `INSERT INTO lead_activities (
      id,
      tenant_id,
      lead_id,
      branch_id,
      created_by_user_id,
      type,
      title,
      note,
      old_status,
      new_status,
      activity_at,
      metadata,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      tenantId,
      leadId,
      branchId,
      createdByUserId,
      type,
      finalTitle,
      note,
      oldStatus,
      newStatus,
      activityAt,
      JSON.stringify(metadata || {}),
      now,
    ]
  );

  return {
    id,
    tenantId,
    leadId,
    branchId,
    createdByUserId,
    type,
    title: finalTitle,
    note,
    oldStatus,
    newStatus,
    activityAt,
    metadata: metadata || {},
    createdAt: now,
  };
}

async function listLeadActivities({ tenantId, leadId }) {
  const rows = await all(
    `SELECT
      id,
      tenant_id,
      lead_id,
      branch_id,
      created_by_user_id,
      type,
      title,
      note,
      old_status,
      new_status,
      activity_at,
      metadata,
      created_at
    FROM lead_activities
    WHERE tenant_id = ?
      AND lead_id = ?
    ORDER BY activity_at DESC, created_at DESC`,
    [tenantId, leadId]
  );

  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id || row.tenantId,
    leadId: row.lead_id || row.leadId,
    branchId: row.branch_id || row.branchId || null,
    createdByUserId: row.created_by_user_id || row.createdByUserId || null,
    type: row.type,
    title: row.title,
    note: row.note,
    oldStatus: row.old_status || row.oldStatus || null,
    newStatus: row.new_status || row.newStatus || null,
    activityAt: row.activity_at || row.activityAt,
    metadata: parseMetadata(row.metadata),
    createdAt: row.created_at || row.createdAt,
  }));
}

module.exports = {
  LeadActivityType: LEAD_ACTIVITY_TYPES,
  createLeadActivity,
  getLeadActivityTitle,
  listLeadActivities,
};
