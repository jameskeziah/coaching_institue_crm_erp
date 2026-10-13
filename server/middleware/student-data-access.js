const { ROLE_GROUPS, ROLES } = require('../config/roles');

const RESTRICTED_STUDENT_ROLES = new Set([ROLES.TEACHER, ROLES.COUNSELLOR]);
const FINANCE_ROLES = new Set(ROLE_GROUPS.FINANCE);
const IDENTITY_ROLES = new Set(ROLE_GROUPS.MANAGEMENT);

function roleOf(req) {
  return String(req.user?.role || '').toLowerCase();
}

function publicStudent(student) {
  if (!student || typeof student !== 'object') return student;

  return {
    id: student.id,
    studentCode: student.studentCode || student.student_code || null,
    name: student.displayName || student.display_name || student.studentName || student.student_name || student.name || null,
    classLevel: student.classLevel || student.class_level || student.grade || null,
    schoolName: student.schoolName || student.school_name || null,
    status: student.status || null,
    attendance: student.attendance ?? null,
    branchId: student.branchId || student.branch_id || null,
    branchName: student.branchName || student.branch_name || null,
    primaryCourseId: student.primaryCourseId || student.primary_course_id || null,
    courseName: student.courseName || student.course_name || null,
    primaryBatchId: student.primaryBatchId || student.primary_batch_id || null,
    batchName: student.batchName || student.primaryBatchName || student.primary_batch_name || student.batch || null,
  };
}

function redactStudentResponse(path, body) {
  if (!body) return body;

  if (path === '/' && Array.isArray(body)) {
    return body.map(publicStudent);
  }

  if (/^\/[^/]+$/.test(path) && body.data) {
    return { ...body, data: publicStudent(body.data) };
  }

  if (/^\/[^/]+\/profile$/.test(path) && body.data) {
    const data = body.data;
    const hiddenAlertTypes = new Set([
      'FEE_OVERDUE',
      'DOCUMENT_MISSING',
      'PARENT_PHONE_MISSING',
      'WHATSAPP_FAILED',
    ]);

    return {
      ...body,
      data: {
        student: publicStudent(data.student),
        branch: data.branch || null,
        course: data.course || null,
        primaryBatch: data.primaryBatch || null,
        batchMemberships: data.batchMemberships || [],
        teachers: data.teachers || [],
        attendanceSummary: data.attendanceSummary || null,
        testSummary: data.testSummary || null,
        status: data.status || data.student?.status || null,
        alerts: Array.isArray(data.alerts)
          ? data.alerts.filter((alert) => !hiddenAlertTypes.has(alert.type))
          : [],
        restrictedSections: [
          'student_identity',
          'guardian_contacts',
          'documents',
          'communications',
          'fees',
        ],
      },
    };
  }

  return body;
}

function studentDataAccess(req, res, next) {
  const role = roleOf(req);
  const path = req.path || '/';
  const isFinancePath = /^\/[^/]+\/fees(?:\/|$)/.test(path);
  const isIdentityPath = /^\/[^/]+\/(guardians|documents|communications|history)(?:\/|$)/.test(path);

  if (isFinancePath && !FINANCE_ROLES.has(role)) {
    return res.status(403).json({
      message: 'Student financial data is restricted to finance-authorized roles.',
      code: 'STUDENT_FINANCIAL_DATA_RESTRICTED',
    });
  }

  if (isIdentityPath && !IDENTITY_ROLES.has(role)) {
    return res.status(403).json({
      message: 'Student identity data is restricted to management roles.',
      code: 'STUDENT_IDENTITY_DATA_RESTRICTED',
    });
  }

  if (!RESTRICTED_STUDENT_ROLES.has(role)) return next();

  const isStudentCreate = req.method === 'POST' && path === '/';
  const isStudentIdentityUpdate = ['PUT', 'PATCH'].includes(req.method) && /^\/[^/]+$/.test(path);
  if (isStudentCreate || isStudentIdentityUpdate) {
    return res.status(403).json({
      message: 'Teachers and counsellors cannot create or edit student identity records.',
      code: 'STUDENT_IDENTITY_WRITE_RESTRICTED',
    });
  }

  if (req.method === 'GET') {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (/^\/[^/]+\/attendance$/.test(path) && body?.data) {
        const attendance = body.data;
        return originalJson({
          ...body,
          data: {
            summary: attendance.summary || null,
            rows: attendance.rows || [],
            subjectWise: attendance.subjectWise || [],
            risk: attendance.risk || null,
            restrictedSections: ['parent_alerts', 'followups'],
          },
        });
      }

      return originalJson(redactStudentResponse(path, body));
    };
  }

  return next();
}

module.exports = {
  studentDataAccess,
  publicStudent,
  redactStudentResponse,
};
