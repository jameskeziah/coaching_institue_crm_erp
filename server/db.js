const path = require('path');
const bcrypt = require('bcryptjs');
const { env } = require('./config/env');
const { normalizeStatus, normalizeTemperature, safeJsonParse } = require('./services/admission.service');
const { normalizeIndianPhone } = require('./utils/phone');

const DB_PATH = path.join(__dirname, 'data.sqlite');
const DATABASE_URL = env.DATABASE_URL;
const isPostgres = /^postgres(ql)?:\/\//i.test(DATABASE_URL);

let sqliteDb = null;
let pgPool = null;

if (isPostgres) {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  });
} else {
  const sqlite3 = require('sqlite3').verbose();
  const sqlitePath = DATABASE_URL ? path.resolve(process.cwd(), DATABASE_URL) : DB_PATH;
  sqliteDb = new sqlite3.Database(sqlitePath);
}

function toPostgresSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function withReturningId(sql) {
  if (!/^\s*insert\s+/i.test(sql) || /\breturning\b/i.test(sql)) return sql;
  return `${sql} RETURNING id`;
}

function normalizePostgresRow(row) {
  if (!row) return row;
  const normalized = { ...row };
  const aliases = {
    displayname: 'displayName',
    tenantid: 'tenant_id',
    tenantname: 'tenantName',
    subscriptionplan: 'subscriptionPlan',
    subscriptionstatus: 'subscriptionStatus',
    billingemail: 'billingEmail',
    updatedat: 'updatedAt',
    createdat: 'createdAt',
    teachername: 'teacherName',
    teachersubject: 'teacherSubject',
    controltype: 'controlType',
    plannedvalue: 'plannedValue',
    actualvalue: 'actualValue',
    evidenceurl: 'evidenceUrl',
    actiontype: 'actionType',
    warninglevel: 'warningLevel',
    salarydecision: 'salaryDecision',
    decidedby: 'decidedBy',
    decidedat: 'decidedAt',
    vendorname: 'vendorName',
    vendortype: 'vendorType',
    mobileNumber: 'mobileNumber',
    mobilenumber: 'mobileNumber',
    gstnumber: 'gstNumber',
    bankdetails: 'bankDetails',
    totalpaid: 'totalPaid',
    pendingamount: 'pendingAmount',
    lastpaymentdate: 'lastPaymentDate',
    expenseid: 'expenseId',
    subcategory: 'subCategory',
    expenseType: 'expenseType',
    expensetype: 'expenseType',
    paidto: 'paidTo',
    vendormobile: 'vendorMobile',
    paymentmode: 'paymentMode',
    paidby: 'paidBy',
    paymentdate: 'paymentDate',
    deductionamount: 'deductionAmount',
    bonusamount: 'bonusAmount',
    netpaid: 'netPaid',
    requestedby: 'requestedBy',
    approvedby: 'approvedBy',
    templatename: 'templateName',
    startmonth: 'startMonth',
    endmonth: 'endMonth',
    dayofmonth: 'dayOfMonth',
    lastgeneratedmonth: 'lastGeneratedMonth',
    billuploaded: 'billUploaded',
    gstbill: 'gstBill',
    approvalrequired: 'approvalRequired',
    billurl: 'billUrl',
    cashflowtype: 'cashFlowType',
    cashadded: 'cashAdded',
    cashexpense: 'cashExpense',
    openingcash: 'openingCash',
    closingcash: 'closingCash',
    studentname: 'studentName',
    tasktype: 'taskType',
    assignedto: 'assignedTo',
    linkedtype: 'linkedType',
    linkedid: 'linkedId',
    createdby: 'createdBy',
    completionoutcome: 'completionOutcome',
    lastescalatedat: 'lastEscalatedAt',
    escalationcount: 'escalationCount',
    completedat: 'completedAt',
    completedby: 'completedBy',
    feecategory: 'feeCategory',
    courseprogram: 'courseProgram',
    paymenttype: 'paymentType',
    totalamount: 'totalAmount',
    discountamount: 'discountAmount',
    discounttype: 'discountType',
    discountreason: 'discountReason',
    approvedby: 'approvedBy',
    discountapproveddate: 'discountApprovedDate',
    discountproofnote: 'discountProofNote',
    feeStatus: 'feeStatus',
    feestatus: 'feeStatus',
    statusupdatedat: 'statusUpdatedAt',
    dueamount: 'dueAmount',
    dueDate: 'dueDate',
    duedate: 'dueDate',
    installmentlabel: 'installmentLabel',
    feeplanid: 'feePlanId',
    componentname: 'componentName',
    paymentdate: 'paymentDate',
    paymentmethod: 'paymentMethod',
    transactionid: 'transactionId',
    receivedby: 'receivedBy',
    receipttype: 'receiptType',
    receiptnumber: 'receiptNumber',
    cancelledat: 'cancelledAt',
    cancelledby: 'cancelledBy',
    cancelreason: 'cancelReason',
    paymentid: 'paymentId',
    pdfurl: 'pdfUrl',
    issuedat: 'issuedAt',
    remindertype: 'reminderType',
    sentvia: 'sentVia',
    sentat: 'sentAt',
    installmentid: 'installmentId',
    oldvalue: 'oldValue',
    newvalue: 'newValue',
    planid: 'planId',
    studentid: 'studentId',
    eventdate: 'eventDate',
    paidamount: 'paidAmount',
    netamount: 'netAmount',
    amountcollected: 'amountCollected',
    teacherid: 'teacherId',
    teachername: 'teacherName',
    starttime: 'startTime',
    endtime: 'endTime',
    lecturetype: 'lectureType',
    markedby: 'markedBy',
    lockedat: 'lockedAt',
    submittedat: 'submittedAt',
    sessionid: 'sessionId',
    alertstatus: 'alertStatus',
    markedtime: 'markedTime',
    arrivalTime: 'arrivalTime',
    arrivaltime: 'arrivalTime',
    studentcount: 'studentCount',
    markedcount: 'markedCount',
    absentcount: 'absentCount',
    latecount: 'lateCount',
    presentcount: 'presentCount',
    excusedcount: 'excusedCount',
    totallectures: 'totalLectures',
    attendancepercent: 'attendancePercent',
    averattendance: 'averageAttendance',
    averageattendance: 'averageAttendance',
    irregularstudents: 'irregularStudents',
    parentphone: 'parentPhone',
    parentphonenormalized: 'parentPhoneNormalized',
    staffid: 'staffId',
    staffname: 'staffName',
    checkin: 'checkIn',
    checkout: 'checkOut',
    lateminutes: 'lateMinutes',
    branchid: 'branchId',
    branchname: 'branchName',
    scheduledlectures: 'scheduledLectures',
    lecturestaken: 'lecturesTaken',
    missedlectures: 'missedLectures',
    replacementrequired: 'replacementRequired',
    leavetype: 'leaveType',
    fromdate: 'fromDate',
    todate: 'toDate',
    approvedat: 'approvedAt',
    requestedby: 'requestedBy',
    recordid: 'recordId',
    oldstatus: 'oldStatus',
    newstatus: 'newStatus',
    requestreason: 'requestReason',
    resolvedby: 'resolvedBy',
    resolvedat: 'resolvedAt',
    alerttype: 'alertType',
    channel: 'channel',
    delivery: 'delivery',
    calloutcome: 'callOutcome',
    calledby: 'calledBy',
    calledat: 'calledAt',
    followupdate: 'followUpDate',
    automationtype: 'automationType',
    targettype: 'targetType',
    targetid: 'targetId',
    referencetype: 'referenceType',
    referenceid: 'referenceId',
    sentvia: 'sentVia',
    sentat: 'sentAt',
    processedat: 'processedAt',
    coursename: 'courseName',
    suitablefor: 'suitableFor',
    exampletopics: 'exampleTopics',
    moduleorder: 'moduleOrder',
    moduleName: 'moduleName',
    modulename: 'moduleName',
    studentName: 'studentName',
    studentname: 'studentName',
    parentname: 'parentName',
    classname: 'className',
    courseinterested: 'courseInterested',
    targetexam: 'targetExam',
    branchid: 'branchId',
    subsource: 'subSource',
    counsellorid: 'counsellorId',
    counsellor_id: 'counsellor_id',
    leadtemperature: 'leadTemperature',
    nextfollowupat: 'nextFollowUpAt',
    lastcontactedat: 'lastContactedAt',
    demodate: 'demoDate',
    demoteacherid: 'demoTeacherId',
    estimatedrevenue: 'estimatedRevenue',
    convertedstudentid: 'convertedStudentId',
    convertedat: 'convertedAt',
    lostreason: 'lostReason',
    spendamount: 'spendAmount',
    startdate: 'startDate',
    enddate: 'endDate',
    isactive: 'isActive',
    totalleads: 'totalLeads',
    convertedleads: 'convertedLeads',
    campaignspend: 'campaignSpend',
    costperadmission: 'costPerAdmission',
    customfields: 'customFields',
    parentName: 'parentName',
    parentname: 'parentName',
    mobileNumber: 'mobileNumber',
    mobilenumber: 'mobileNumber',
    joiningDate: 'joiningDate',
    joiningdate: 'joiningDate',
    courseDuration: 'courseDuration',
    courseduration: 'courseDuration',
    feeType: 'feeType',
    feetype: 'feeType',
    feeAmount: 'feeAmount',
    feeamount: 'feeAmount',
    billingCycle: 'billingCycle',
    billingcycle: 'billingCycle',
    classRange: 'classRange',
    classrange: 'classRange',
    deviceRequired: 'deviceRequired',
    devicerequired: 'deviceRequired',
    previousCodingExperience: 'previousCodingExperience',
    previouscodingexperience: 'previousCodingExperience',
    skillLevel: 'skillLevel',
    skilllevel: 'skillLevel',
    skillAssessment: 'skillAssessment',
    skillassessment: 'skillAssessment',
    courseId: 'courseId',
    courseid: 'courseId',
    studentId: 'studentId',
    studentid: 'studentId',
    mentorId: 'mentorId',
    mentorid: 'mentorId',
    mentorName: 'mentorName',
    mentorname: 'mentorName',
    sessionType: 'sessionType',
    sessiontype: 'sessionType',
    deviceUsed: 'deviceUsed',
    deviceused: 'deviceUsed',
    topicPracticed: 'topicPracticed',
    topicpracticed: 'topicPracticed',
    assignmentGiven: 'assignmentGiven',
    assignmentgiven: 'assignmentGiven',
    parentAlert: 'parentAlert',
    parentalert: 'parentAlert',
    deviceId: 'deviceId',
    deviceid: 'deviceId',
    deviceType: 'deviceType',
    devicetype: 'deviceType',
    purchaseDate: 'purchaseDate',
    purchasedate: 'purchaseDate',
    assignedTo: 'assignedTo',
    assignedto: 'assignedTo',
    sessionTime: 'sessionTime',
    sessiontime: 'sessionTime',
    conditionBefore: 'conditionBefore',
    conditionbefore: 'conditionBefore',
    conditionAfter: 'conditionAfter',
    conditionafter: 'conditionAfter',
    damageReported: 'damageReported',
    damagereported: 'damageReported',
    mentorVerified: 'mentorVerified',
    mentorverified: 'mentorVerified',
    projectName: 'projectName',
    projectname: 'projectName',
    projectType: 'projectType',
    projecttype: 'projectType',
    startDate: 'startDate',
    startdate: 'startDate',
    githubLink: 'githubLink',
    githublink: 'githubLink',
    demoVideo: 'demoVideo',
    demovideo: 'demoVideo',
    finalScore: 'finalScore',
    finalscore: 'finalScore',
    finalDemoStatus: 'finalDemoStatus',
    finaldemostatus: 'finalDemoStatus',
    assignmentName: 'assignmentName',
    assignmentname: 'assignmentName',
    assignmentType: 'assignmentType',
    assignmenttype: 'assignmentType',
    dueDate: 'dueDate',
    duedate: 'dueDate',
    submissionDate: 'submissionDate',
    submissiondate: 'submissionDate',
    fileUploaded: 'fileUploaded',
    fileuploaded: 'fileUploaded',
    mentorFeedback: 'mentorFeedback',
    mentorfeedback: 'mentorFeedback',
    projectWork: 'projectWork',
    projectwork: 'projectWork',
    totalScore: 'totalScore',
    totalscore: 'totalScore',
    githubUsername: 'githubUsername',
    githubusername: 'githubUsername',
    projectRepository: 'projectRepository',
    projectrepository: 'projectRepository',
    portfolioPage: 'portfolioPage',
    portfoliopage: 'portfolioPage',
    certificateLink: 'certificateLink',
    certificatelink: 'certificateLink',
    linkedinProfile: 'linkedinProfile',
    linkedinprofile: 'linkedinProfile',
    certificateId: 'certificateId',
    certificateid: 'certificateId',
    issueDate: 'issueDate',
    issuedate: 'issueDate',
    qrVerification: 'qrVerification',
    qrverification: 'qrVerification',
    academicYear: 'academicYear',
    academicyear: 'academicYear',
    courseName: 'courseName',
    coursename: 'courseName',
    subTopic: 'subTopic',
    subtopic: 'subTopic',
    estimatedLectures: 'estimatedLectures',
    estimatedlectures: 'estimatedLectures',
    requiredTest: 'requiredTest',
    requiredtest: 'requiredTest',
    calendarType: 'calendarType',
    calendartype: 'calendarType',
    startDate: 'startDate',
    startdate: 'startDate',
    endDate: 'endDate',
    enddate: 'endDate',
    targetDate: 'targetDate',
    targetdate: 'targetDate',
    batchName: 'batchName',
    batchname: 'batchName',
    dayOfWeek: 'dayOfWeek',
    dayofweek: 'dayOfWeek',
    timeSlot: 'timeSlot',
    timeslot: 'timeSlot',
    lectureType: 'lectureType',
    lecturetype: 'lectureType',
    homeworkPlanned: 'homeworkPlanned',
    homeworkplanned: 'homeworkPlanned',
    testLinked: 'testLinked',
    testlinked: 'testLinked',
    teachingMaterial: 'teachingMaterial',
    teachingmaterial: 'teachingMaterial',
    lecturePlanId: 'lecturePlanId',
    lectureplanid: 'lecturePlanId',
    plannedTopic: 'plannedTopic',
    plannedtopic: 'plannedTopic',
    actualTopic: 'actualTopic',
    actualtopic: 'actualTopic',
    lectureCompleted: 'lectureCompleted',
    lecturecompleted: 'lectureCompleted',
    classAttendance: 'classAttendance',
    classattendance: 'classAttendance',
    homeworkGiven: 'homeworkGiven',
    homeworkgiven: 'homeworkGiven',
    doubtsSolved: 'doubtsSolved',
    doubtssolved: 'doubtsSolved',
    notesProvided: 'notesProvided',
    notesprovided: 'notesProvided',
    teacherRemark: 'teacherRemark',
    teacherremark: 'teacherRemark',
    academicHeadRemark: 'academicHeadRemark',
    academicheadremark: 'academicHeadRemark',
    dueDate: 'dueDate',
    duedate: 'dueDate',
    submittedCount: 'submittedCount',
    submittedcount: 'submittedCount',
    totalCount: 'totalCount',
    totalcount: 'totalCount',
    checkedBy: 'checkedBy',
    checkedby: 'checkedBy',
    pendingStudents: 'pendingStudents',
    pendingstudents: 'pendingStudents',
    parentAlert: 'parentAlert',
    parentalert: 'parentAlert',
    testName: 'testName',
    testname: 'testName',
    resultDate: 'resultDate',
    resultdate: 'resultDate',
    analysisRequired: 'analysisRequired',
    analysisrequired: 'analysisRequired',
    testId: 'testId',
    testid: 'testId',
    marksObtained: 'marksObtained',
    marksobtained: 'marksObtained',
    totalMarks: 'totalMarks',
    totalmarks: 'totalMarks',
    testRank: 'testRank',
    testrank: 'testRank',
    weakChapter: 'weakChapter',
    weakchapter: 'weakChapter',
    actionNeeded: 'actionNeeded',
    actionneeded: 'actionNeeded',
    studentsAssigned: 'studentsAssigned',
    studentsassigned: 'studentsAssigned',
    improvementChecked: 'improvementChecked',
    improvementchecked: 'improvementChecked',
    revisionDate: 'revisionDate',
    revisiondate: 'revisionDate',
    testAfterRevision: 'testAfterRevision',
    testafterrevision: 'testAfterRevision',
    targetType: 'targetType',
    targettype: 'targetType',
    targetName: 'targetName',
    targetname: 'targetName',
    assignedTeacher: 'assignedTeacher',
    assignedteacher: 'assignedTeacher',
    followUpTest: 'followUpTest',
    followuptest: 'followUpTest',
    testCode: 'testCode',
    testcode: 'testCode',
    totalQuestions: 'totalQuestions',
    totalquestions: 'totalQuestions',
    negativeMarking: 'negativeMarking',
    negativemarking: 'negativeMarking',
    testMode: 'testMode',
    testmode: 'testMode',
    createdBy: 'createdBy',
    createdby: 'createdBy',
    rollNumber: 'rollNumber',
    rollnumber: 'rollNumber',
    physicsMarks: 'physicsMarks',
    physicsmarks: 'physicsMarks',
    chemistryMarks: 'chemistryMarks',
    chemistrymarks: 'chemistryMarks',
    biologyMarks: 'biologyMarks',
    biologymarks: 'biologyMarks',
    mathsMarks: 'mathsMarks',
    mathsmarks: 'mathsMarks',
    percentage: 'percentage',
    batchRank: 'batchRank',
    batchrank: 'batchRank',
    branchRank: 'branchRank',
    branchrank: 'branchRank',
    courseRank: 'courseRank',
    courserank: 'courseRank',
    overallRank: 'overallRank',
    overallrank: 'overallRank',
    attemptedQuestions: 'attemptedQuestions',
    attemptedquestions: 'attemptedQuestions',
    correctAnswers: 'correctAnswers',
    correctanswers: 'correctAnswers',
    wrongAnswers: 'wrongAnswers',
    wronganswers: 'wrongAnswers',
    blankQuestions: 'blankQuestions',
    blankquestions: 'blankQuestions',
    strongSubject: 'strongSubject',
    strongsubject: 'strongSubject',
    weakSubject: 'weakSubject',
    weaksubject: 'weakSubject',
    suggestedAction: 'suggestedAction',
    suggestedaction: 'suggestedAction',
    questionNumber: 'questionNumber',
    questionnumber: 'questionNumber',
    correctOption: 'correctOption',
    correctoption: 'correctOption',
    selectedOption: 'selectedOption',
    selectedoption: 'selectedOption',
    chapterAccuracy: 'chapterAccuracy',
    chapteraccuracy: 'chapterAccuracy',
    parentReportSent: 'parentReportSent',
    parentreportsent: 'parentReportSent',
    teacherRemark: 'teacherRemark',
    teacherremark: 'teacherRemark',
    requiredAction: 'requiredAction',
    requiredaction: 'requiredAction',
    previousAverage: 'previousAverage',
    previousaverage: 'previousAverage',
    currentAverage: 'currentAverage',
    currentaverage: 'currentAverage',
    improvementPercent: 'improvementPercent',
    improvementpercent: 'improvementPercent',
    weakChapterCount: 'weakChapterCount',
    weakchaptercount: 'weakChapterCount',
    remedialDate: 'remedialDate',
    remedialdate: 'remedialDate',
    omrFileName: 'omrFileName',
    omrfilename: 'omrFileName',
    uploadedBy: 'uploadedBy',
    uploadedby: 'uploadedBy',
    processedCount: 'processedCount',
    processedcount: 'processedCount',
    errorCount: 'errorCount',
    errorcount: 'errorCount',
    templatekey: 'templateKey',
    displayname: 'displayName',
    updatedby: 'updatedBy',
  };

  Object.entries(aliases).forEach(([from, to]) => {
    if (Object.prototype.hasOwnProperty.call(normalized, from) && !Object.prototype.hasOwnProperty.call(normalized, to)) {
      normalized[to] = normalized[from];
      delete normalized[from];
    }
  });

  return normalized;
}

function runSqlite(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function allSqlite(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function getSqlite(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

async function run(sql, params = []) {
  if (!isPostgres) return runSqlite(sql, params);
  const result = await pgPool.query(toPostgresSql(withReturningId(sql)), params);
  return {
    changes: result.rowCount,
    lastID: result.rows?.[0]?.id,
    rowCount: result.rowCount,
  };
}

async function all(sql, params = []) {
  if (!isPostgres) return allSqlite(sql, params);
  const result = await pgPool.query(toPostgresSql(sql), params);
  return result.rows.map(normalizePostgresRow);
}

async function get(sql, params = []) {
  if (!isPostgres) return getSqlite(sql, params);
  const result = await pgPool.query(toPostgresSql(sql), params);
  return normalizePostgresRow(result.rows[0]);
}

async function createTables() {
  const idColumn = isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const integerType = isPostgres ? 'INTEGER' : 'INTEGER';

  await run(
    `CREATE TABLE IF NOT EXISTS tenants (
      id ${idColumn},
      name TEXT,
      slug TEXT UNIQUE,
      subscriptionPlan TEXT DEFAULT 'local',
      subscriptionStatus TEXT DEFAULT 'active',
      billingEmail TEXT,
      status TEXT DEFAULT 'Active',
      createdAt TEXT,
      updatedAt TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS users (
      id ${idColumn},
      username TEXT UNIQUE,
      password TEXT,
      role TEXT,
      tenant_id ${integerType},
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id ${integerType} NOT NULL,
      tenant_id ${integerType} NOT NULL,
      refresh_token_hash TEXT NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id ${integerType} NOT NULL,
      tenant_id ${integerType} NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      superseded_at TEXT,
      superseded_by_token_id TEXT,
      revoked_at TEXT,
      revoke_reason TEXT,
      revocation_reason TEXT,
      delivery_status TEXT DEFAULT 'pending',
      delivery_attempt_count INTEGER DEFAULT 0,
      delivery_last_attempt_at TEXT,
      delivery_sent_at TEXT,
      delivery_provider_message_id TEXT,
      delivery_last_error_code TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id TEXT PRIMARY KEY,
      user_id ${integerType} NOT NULL,
      tenant_id ${integerType} NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      revoked_at TEXT,
      revoke_reason TEXT,
      delivery_status TEXT DEFAULT 'pending',
      delivery_attempt_count INTEGER DEFAULT 0,
      delivery_last_attempt_at TEXT,
      delivery_sent_at TEXT,
      delivery_provider_message_id TEXT,
      delivery_last_error_code TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS user_invites (
      id TEXT PRIMARY KEY,
      tenant_id ${integerType} NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      invited_by ${integerType} NOT NULL,
      accepted_at TEXT,
      revoked_at TEXT,
      delivery_status TEXT DEFAULT 'pending',
      delivery_attempt_count INTEGER DEFAULT 0,
      delivery_last_attempt_at TEXT,
      delivery_sent_at TEXT,
      delivery_provider_message_id TEXT,
      delivery_last_error_code TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS tenant_owner_recovery_requests (
      id TEXT PRIMARY KEY,
      tenant_id ${integerType} NOT NULL,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      platform_admin_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      revoked_at TEXT,
      delivery_status TEXT DEFAULT 'pending',
      delivery_attempt_count INTEGER DEFAULT 0,
      delivery_last_attempt_at TEXT,
      delivery_sent_at TEXT,
      delivery_provider_message_id TEXT,
      delivery_last_error_code TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS email_outbox (
      id TEXT PRIMARY KEY,
      tenant_id ${integerType},
      user_id ${integerType},
      token_id TEXT,
      invite_id TEXT,
      owner_recovery_request_id TEXT,
      type TEXT NOT NULL,
      recipient TEXT NOT NULL,
      payload TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      last_attempt_at TEXT,
      locked_at TEXT,
      locked_by TEXT,
      sent_at TEXT,
      provider_message_id TEXT,
      last_error_code TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS teachers (
      id ${idColumn},
      tenant_id ${integerType},
      name TEXT,
      subject TEXT,
      month TEXT,
      data TEXT,
      updatedAt TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS teacher_reviews (
      id ${idColumn},
      teacher_id ${integerType},
      month TEXT,
      scores TEXT,
      updatedAt TEXT,
      createdAt TEXT,
      UNIQUE(teacher_id, month),
      FOREIGN KEY(teacher_id) REFERENCES teachers(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS teacher_work_controls (
      id ${idColumn},
      teacher_id ${integerType},
      controlType TEXT,
      title TEXT,
      plannedValue TEXT,
      actualValue TEXT,
      status TEXT,
      dueDate TEXT,
      evidenceUrl TEXT,
      remarks TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(teacher_id) REFERENCES teachers(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS teacher_management_actions (
      id ${idColumn},
      teacher_id ${integerType},
      month TEXT,
      actionType TEXT,
      warningLevel TEXT,
      reason TEXT,
      decision TEXT,
      salaryDecision TEXT,
      status TEXT DEFAULT 'Open',
      decidedBy TEXT,
      decidedAt TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(teacher_id) REFERENCES teachers(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS vendors (
      id ${idColumn},
      tenant_id ${integerType},
      vendorName TEXT,
      vendorType TEXT,
      mobileNumber TEXT,
      address TEXT,
      gstNumber TEXT,
      bankDetails TEXT,
      notes TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS expenses (
      id ${idColumn},
      tenant_id ${integerType},
      expenseId TEXT UNIQUE,
      date TEXT,
      branch TEXT,
      category TEXT,
      subCategory TEXT,
      expenseType TEXT,
      amount REAL,
      vendor_id ${integerType},
      paidTo TEXT,
      vendorMobile TEXT,
      paymentMode TEXT,
      paidBy TEXT,
      paymentDate TEXT,
      transactionId TEXT,
      deductionAmount REAL DEFAULT 0,
      bonusAmount REAL DEFAULT 0,
      netPaid REAL DEFAULT 0,
      requestedBy TEXT,
      approvedBy TEXT,
      billUploaded INTEGER DEFAULT 0,
      gstBill INTEGER DEFAULT 0,
      billUrl TEXT,
      remarks TEXT,
      status TEXT DEFAULT 'Draft',
      approvalRequired TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(vendor_id) REFERENCES vendors(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS petty_cash_entries (
      id ${idColumn},
      tenant_id ${integerType},
      date TEXT,
      branch TEXT,
      cashFlowType TEXT,
      amount REAL,
      openingCash REAL DEFAULT 0,
      closingCash REAL DEFAULT 0,
      referenceType TEXT,
      referenceId ${integerType},
      remarks TEXT,
      createdAt TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS recurring_expense_templates (
      id ${idColumn},
      tenant_id ${integerType},
      templateName TEXT,
      branch TEXT,
      category TEXT,
      subCategory TEXT,
      expenseType TEXT DEFAULT 'Fixed',
      amount REAL,
      paidTo TEXT,
      vendorMobile TEXT,
      paymentMode TEXT,
      requestedBy TEXT,
      approvedBy TEXT,
      billUploaded INTEGER DEFAULT 0,
      gstBill INTEGER DEFAULT 0,
      billUrl TEXT,
      remarks TEXT,
      status TEXT DEFAULT 'Active',
      frequency TEXT DEFAULT 'Monthly',
      startMonth TEXT,
      endMonth TEXT,
      dayOfMonth ${integerType} DEFAULT 1,
      lastGeneratedMonth TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS ai_lab_courses (
      id ${idColumn},
      courseName TEXT,
      category TEXT,
      suitableFor TEXT,
      duration TEXT,
      exampleTopics TEXT,
      status TEXT DEFAULT 'Active',
      createdAt TEXT,
      updatedAt TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS ai_lab_modules (
      id ${idColumn},
      course_id ${integerType},
      moduleOrder ${integerType},
      moduleName TEXT,
      topics TEXT,
      status TEXT DEFAULT 'Pending',
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(course_id) REFERENCES ai_lab_courses(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS ai_lab_students (
      id ${idColumn},
      student_id ${integerType},
      studentName TEXT,
      grade TEXT,
      school TEXT,
      parentName TEXT,
      mobileNumber TEXT,
      course_id ${integerType},
      courseName TEXT,
      batch TEXT,
      joiningDate TEXT,
      courseDuration TEXT,
      feeType TEXT,
      deviceRequired INTEGER DEFAULT 0,
      previousCodingExperience TEXT,
      skillLevel ${integerType} DEFAULT 0,
      skillAssessment TEXT,
      status TEXT DEFAULT 'Active',
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(student_id) REFERENCES students(id),
      FOREIGN KEY(course_id) REFERENCES ai_lab_courses(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS ai_lab_attendance (
      id ${idColumn},
      ai_lab_student_id ${integerType},
      course_id ${integerType},
      date TEXT,
      sessionType TEXT,
      mentor_id ${integerType},
      mentorName TEXT,
      status TEXT DEFAULT 'Present',
      deviceUsed TEXT,
      topicPracticed TEXT,
      assignmentGiven INTEGER DEFAULT 0,
      parentAlert TEXT DEFAULT 'Not Sent',
      remarks TEXT,
      createdAt TEXT,
      FOREIGN KEY(ai_lab_student_id) REFERENCES ai_lab_students(id),
      FOREIGN KEY(course_id) REFERENCES ai_lab_courses(id),
      FOREIGN KEY(mentor_id) REFERENCES teachers(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS ai_lab_devices (
      id ${idColumn},
      deviceId TEXT UNIQUE,
      deviceType TEXT,
      name TEXT,
      branch TEXT,
      condition TEXT,
      status TEXT DEFAULT 'Available',
      purchaseDate TEXT,
      notes TEXT,
      createdAt TEXT,
      updatedAt TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS ai_lab_device_allocations (
      id ${idColumn},
      device_id ${integerType},
      ai_lab_student_id ${integerType},
      course_id ${integerType},
      date TEXT,
      sessionTime TEXT,
      conditionBefore TEXT,
      conditionAfter TEXT,
      damageReported INTEGER DEFAULT 0,
      mentorVerified INTEGER DEFAULT 0,
      remarks TEXT,
      createdAt TEXT,
      FOREIGN KEY(device_id) REFERENCES ai_lab_devices(id),
      FOREIGN KEY(ai_lab_student_id) REFERENCES ai_lab_students(id),
      FOREIGN KEY(course_id) REFERENCES ai_lab_courses(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS ai_lab_projects (
      id ${idColumn},
      ai_lab_student_id ${integerType},
      course_id ${integerType},
      mentor_id ${integerType},
      projectName TEXT,
      projectType TEXT,
      startDate TEXT,
      deadline TEXT,
      status TEXT DEFAULT 'Idea Stage',
      githubLink TEXT,
      demoVideo TEXT,
      finalScore REAL DEFAULT 0,
      finalDemoStatus TEXT DEFAULT 'Pending',
      remarks TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(ai_lab_student_id) REFERENCES ai_lab_students(id),
      FOREIGN KEY(course_id) REFERENCES ai_lab_courses(id),
      FOREIGN KEY(mentor_id) REFERENCES teachers(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS ai_lab_assignments (
      id ${idColumn},
      ai_lab_student_id ${integerType},
      course_id ${integerType},
      assignmentName TEXT,
      assignmentType TEXT,
      dueDate TEXT,
      submissionDate TEXT,
      fileUploaded INTEGER DEFAULT 0,
      githubLink TEXT,
      mentorFeedback TEXT,
      score REAL DEFAULT 0,
      status TEXT DEFAULT 'Assigned',
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(ai_lab_student_id) REFERENCES ai_lab_students(id),
      FOREIGN KEY(course_id) REFERENCES ai_lab_courses(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS ai_lab_mentor_feedback (
      id ${idColumn},
      ai_lab_student_id ${integerType},
      course_id ${integerType},
      mentor_id ${integerType},
      date TEXT,
      logic REAL DEFAULT 0,
      coding REAL DEFAULT 0,
      debugging REAL DEFAULT 0,
      creativity REAL DEFAULT 0,
      presentation REAL DEFAULT 0,
      discipline REAL DEFAULT 0,
      independence REAL DEFAULT 0,
      projectWork REAL DEFAULT 0,
      totalScore REAL DEFAULT 0,
      remarks TEXT,
      createdAt TEXT,
      FOREIGN KEY(ai_lab_student_id) REFERENCES ai_lab_students(id),
      FOREIGN KEY(course_id) REFERENCES ai_lab_courses(id),
      FOREIGN KEY(mentor_id) REFERENCES teachers(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS ai_lab_portfolios (
      id ${idColumn},
      ai_lab_student_id ${integerType},
      githubUsername TEXT,
      projectRepository TEXT,
      demoVideo TEXT,
      portfolioPage TEXT,
      certificateLink TEXT,
      linkedinProfile TEXT,
      status TEXT DEFAULT 'Pending',
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(ai_lab_student_id) REFERENCES ai_lab_students(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS ai_lab_certificates (
      id ${idColumn},
      ai_lab_student_id ${integerType},
      course_id ${integerType},
      certificateId TEXT UNIQUE,
      projectName TEXT,
      issueDate TEXT,
      directorSignature TEXT,
      qrVerification TEXT,
      status TEXT DEFAULT 'Pending',
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(ai_lab_student_id) REFERENCES ai_lab_students(id),
      FOREIGN KEY(course_id) REFERENCES ai_lab_courses(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS academic_syllabus (
      id ${idColumn},
      courseName TEXT,
      subject TEXT,
      chapter TEXT,
      topic TEXT,
      subTopic TEXT,
      difficulty TEXT,
      estimatedLectures REAL DEFAULT 0,
      requiredTest INTEGER DEFAULT 0,
      status TEXT DEFAULT 'Pending',
      createdAt TEXT,
      updatedAt TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS academic_calendars (
      id ${idColumn},
      academicYear TEXT,
      calendarType TEXT,
      title TEXT,
      courseName TEXT,
      startDate TEXT,
      endDate TEXT,
      targetDate TEXT,
      notes TEXT,
      status TEXT DEFAULT 'Planned',
      createdAt TEXT,
      updatedAt TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS batch_timetables (
      id ${idColumn},
      batchName TEXT,
      courseName TEXT,
      subject TEXT,
      teacher_id ${integerType},
      teacherName TEXT,
      dayOfWeek TEXT,
      timeSlot TEXT,
      room TEXT,
      lectureType TEXT,
      status TEXT DEFAULT 'Scheduled',
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(teacher_id) REFERENCES teachers(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS lecture_plans (
      id ${idColumn},
      date TEXT,
      batchName TEXT,
      courseName TEXT,
      subject TEXT,
      chapter TEXT,
      topic TEXT,
      subTopic TEXT,
      teacher_id ${integerType},
      teacherName TEXT,
      lectureType TEXT,
      homeworkPlanned TEXT,
      testLinked TEXT,
      teachingMaterial TEXT,
      status TEXT DEFAULT 'Planned',
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(teacher_id) REFERENCES teachers(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS class_delivery_logs (
      id ${idColumn},
      lecture_plan_id ${integerType},
      date TEXT,
      batchName TEXT,
      subject TEXT,
      teacher_id ${integerType},
      teacherName TEXT,
      plannedTopic TEXT,
      actualTopic TEXT,
      lectureCompleted INTEGER DEFAULT 0,
      classAttendance TEXT,
      homeworkGiven INTEGER DEFAULT 0,
      doubtsSolved TEXT,
      notesProvided INTEGER DEFAULT 0,
      teacherRemark TEXT,
      academicHeadRemark TEXT,
      status TEXT DEFAULT 'Delivered',
      createdAt TEXT,
      FOREIGN KEY(lecture_plan_id) REFERENCES lecture_plans(id),
      FOREIGN KEY(teacher_id) REFERENCES teachers(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS homework_assignments (
      id ${idColumn},
      date TEXT,
      batchName TEXT,
      courseName TEXT,
      subject TEXT,
      topic TEXT,
      homework TEXT,
      dueDate TEXT,
      submittedCount ${integerType} DEFAULT 0,
      totalCount ${integerType} DEFAULT 0,
      checkedBy TEXT,
      pendingStudents ${integerType} DEFAULT 0,
      parentAlert TEXT DEFAULT 'Not Sent',
      status TEXT DEFAULT 'Assigned',
      createdAt TEXT,
      updatedAt TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS test_calendars (
      id ${idColumn},
      testName TEXT,
      date TEXT,
      courseName TEXT,
      batchName TEXT,
      subjects TEXT,
      syllabusCovered TEXT,
      totalMarks REAL DEFAULT 0,
      duration TEXT,
      resultDate TEXT,
      analysisRequired INTEGER DEFAULT 0,
      status TEXT DEFAULT 'Scheduled',
      createdAt TEXT,
      updatedAt TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS student_test_results (
      id ${idColumn},
      test_id ${integerType},
      student_id ${integerType},
      studentName TEXT,
      batchName TEXT,
      subject TEXT,
      marksObtained REAL DEFAULT 0,
      totalMarks REAL DEFAULT 0,
      testRank ${integerType},
      accuracy REAL DEFAULT 0,
      weakChapter TEXT,
      actionNeeded TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(test_id) REFERENCES test_calendars(id),
      FOREIGN KEY(student_id) REFERENCES students(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS doubt_sessions (
      id ${idColumn},
      date TEXT,
      batchName TEXT,
      subject TEXT,
      topic TEXT,
      teacher_id ${integerType},
      teacherName TEXT,
      studentsAssigned ${integerType} DEFAULT 0,
      reason TEXT,
      sessionType TEXT,
      status TEXT DEFAULT 'Scheduled',
      improvementChecked INTEGER DEFAULT 0,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(teacher_id) REFERENCES teachers(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS revision_plans (
      id ${idColumn},
      revisionDate TEXT,
      batchName TEXT,
      subject TEXT,
      chapter TEXT,
      teacher_id ${integerType},
      teacherName TEXT,
      revisionType TEXT,
      material TEXT,
      testAfterRevision INTEGER DEFAULT 0,
      status TEXT DEFAULT 'Planned',
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(teacher_id) REFERENCES teachers(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS remedial_actions (
      id ${idColumn},
      targetType TEXT,
      targetName TEXT,
      student_id ${integerType},
      batchName TEXT,
      issue TEXT,
      reason TEXT,
      action TEXT,
      assignedTeacher TEXT,
      deadline TEXT,
      followUpTest INTEGER DEFAULT 0,
      status TEXT DEFAULT 'Open',
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(student_id) REFERENCES students(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS performance_tests (
      id ${idColumn},
      testCode TEXT UNIQUE,
      testName TEXT,
      testType TEXT,
      courseName TEXT,
      batchName TEXT,
      branch TEXT,
      subject TEXT,
      chapters TEXT,
      testDate TEXT,
      duration TEXT,
      totalQuestions ${integerType} DEFAULT 0,
      totalMarks REAL DEFAULT 0,
      negativeMarking INTEGER DEFAULT 0,
      testMode TEXT,
      resultDate TEXT,
      createdBy TEXT,
      status TEXT DEFAULT 'Scheduled',
      createdAt TEXT,
      updatedAt TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS performance_results (
      id ${idColumn},
      test_id ${integerType},
      student_id ${integerType},
      studentName TEXT,
      rollNumber TEXT,
      courseName TEXT,
      batchName TEXT,
      branch TEXT,
      status TEXT DEFAULT 'Present',
      physicsMarks REAL DEFAULT 0,
      chemistryMarks REAL DEFAULT 0,
      biologyMarks REAL DEFAULT 0,
      mathsMarks REAL DEFAULT 0,
      marksObtained REAL DEFAULT 0,
      totalMarks REAL DEFAULT 0,
      percentage REAL DEFAULT 0,
      batchRank ${integerType},
      branchRank ${integerType},
      courseRank ${integerType},
      overallRank ${integerType},
      attemptedQuestions ${integerType} DEFAULT 0,
      correctAnswers ${integerType} DEFAULT 0,
      wrongAnswers ${integerType} DEFAULT 0,
      blankQuestions ${integerType} DEFAULT 0,
      accuracy REAL DEFAULT 0,
      strongSubject TEXT,
      weakSubject TEXT,
      weakChapter TEXT,
      suggestedAction TEXT,
      parentReportSent INTEGER DEFAULT 0,
      teacherRemark TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(test_id) REFERENCES performance_tests(id),
      FOREIGN KEY(student_id) REFERENCES students(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS question_analysis (
      id ${idColumn},
      test_id ${integerType},
      student_id ${integerType},
      questionNumber ${integerType},
      subject TEXT,
      chapter TEXT,
      topic TEXT,
      correctOption TEXT,
      selectedOption TEXT,
      resultStatus TEXT,
      marksAwarded REAL DEFAULT 0,
      createdAt TEXT,
      FOREIGN KEY(test_id) REFERENCES performance_tests(id),
      FOREIGN KEY(student_id) REFERENCES students(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS parent_report_logs (
      id ${idColumn},
      test_id ${integerType},
      student_id ${integerType},
      studentName TEXT,
      parentPhone TEXT,
      marksObtained REAL DEFAULT 0,
      totalMarks REAL DEFAULT 0,
      batchRank ${integerType},
      strongSubject TEXT,
      weakSubject TEXT,
      attendancePercent REAL DEFAULT 0,
      homeworkCompletion REAL DEFAULT 0,
      teacherRemark TEXT,
      requiredAction TEXT,
      sentVia TEXT,
      sentAt TEXT,
      status TEXT DEFAULT 'Draft',
      FOREIGN KEY(test_id) REFERENCES performance_tests(id),
      FOREIGN KEY(student_id) REFERENCES students(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS teacher_result_impact (
      id ${idColumn},
      test_id ${integerType},
      teacher_id ${integerType},
      teacherName TEXT,
      subject TEXT,
      batchName TEXT,
      previousAverage REAL DEFAULT 0,
      currentAverage REAL DEFAULT 0,
      improvementPercent REAL DEFAULT 0,
      weakChapterCount ${integerType} DEFAULT 0,
      homeworkCompletion REAL DEFAULT 0,
      doubtResolution REAL DEFAULT 0,
      remarks TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(test_id) REFERENCES performance_tests(id),
      FOREIGN KEY(teacher_id) REFERENCES teachers(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS remedial_students (
      id ${idColumn},
      test_id ${integerType},
      student_id ${integerType},
      studentName TEXT,
      batchName TEXT,
      weakSubject TEXT,
      weakChapter TEXT,
      issue TEXT,
      assignedTeacher TEXT,
      remedialDate TEXT,
      status TEXT DEFAULT 'Pending',
      followUpTest TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(test_id) REFERENCES performance_tests(id),
      FOREIGN KEY(student_id) REFERENCES students(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS omr_uploads (
      id ${idColumn},
      test_id ${integerType},
      omrFileName TEXT,
      uploadedBy TEXT,
      uploadedAt TEXT,
      processedCount ${integerType} DEFAULT 0,
      errorCount ${integerType} DEFAULT 0,
      status TEXT DEFAULT 'Uploaded',
      notes TEXT,
      FOREIGN KEY(test_id) REFERENCES performance_tests(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS students (
      id ${idColumn},
      tenant_id ${integerType},
      name TEXT,
      grade TEXT,
      batch TEXT,
      attendance TEXT,
      data TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS data_import_batches (
      id TEXT PRIMARY KEY,
      tenant_id ${integerType} NOT NULL,
      entity_type TEXT NOT NULL,
      status TEXT NOT NULL,
      source_name TEXT,
      payload_sha256 TEXT NOT NULL,
      total_rows ${integerType} NOT NULL DEFAULT 0,
      valid_rows ${integerType} NOT NULL DEFAULT 0,
      invalid_rows ${integerType} NOT NULL DEFAULT 0,
      created_by ${integerType},
      created_at TEXT NOT NULL,
      committed_at TEXT,
      rolled_back_at TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS data_import_rows (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      tenant_id ${integerType} NOT NULL,
      row_number ${integerType} NOT NULL,
      status TEXT NOT NULL,
      normalized_data TEXT,
      errors TEXT,
      entity_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(batch_id) REFERENCES data_import_batches(id),
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`
  );

  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_import_rows_batch_number ON data_import_rows (batch_id, row_number)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_import_batches_tenant_status ON data_import_batches (tenant_id, status, created_at)`);

  await run(
    `CREATE TABLE IF NOT EXISTS student_history (
      id ${idColumn},
      student_id ${integerType},
      type TEXT,
      title TEXT,
      detail TEXT,
      eventDate TEXT,
      createdAt TEXT,
      FOREIGN KEY(student_id) REFERENCES students(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS follow_up_tasks (
      id ${idColumn},
      student_id ${integerType},
      studentName TEXT,
      taskType TEXT,
      dueDate TEXT,
      priority TEXT DEFAULT 'Medium',
      assignedTo TEXT,
      status TEXT DEFAULT 'Open',
      notes TEXT,
      linkedType TEXT,
      linkedId ${integerType},
      createdBy TEXT,
      completionOutcome TEXT,
      lastEscalatedAt TEXT,
      escalationCount INTEGER DEFAULT 0,
      completedAt TEXT,
      completedBy TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(student_id) REFERENCES students(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS admissions (
      id ${idColumn},
      tenant_id ${integerType},
      name TEXT,
      program TEXT,
      status TEXT,
      source TEXT,
      data TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS fee_structures (
      id ${idColumn},
      courseName TEXT UNIQUE,
      feeAmount REAL,
      billingCycle TEXT,
      paymentType TEXT,
      classRange TEXT,
      duration TEXT,
      notes TEXT,
      status TEXT DEFAULT 'Active',
      createdAt TEXT,
      updatedAt TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS fee_plans (
      id ${idColumn},
      tenant_id ${integerType},
      student_id ${integerType},
      courseProgram TEXT,
      feeCategory TEXT,
      paymentType TEXT,
      totalAmount REAL,
      discountAmount REAL DEFAULT 0,
      discountType TEXT,
      discountReason TEXT,
      approvedBy TEXT,
      discountApprovedDate TEXT,
      discountProofNote TEXT,
      feeStatus TEXT,
      statusUpdatedAt TEXT,
      dueDate TEXT,
      installmentLabel TEXT,
      notes TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(student_id) REFERENCES students(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS fee_components (
      id ${idColumn},
      fee_plan_id ${integerType},
      componentName TEXT,
      amount REAL DEFAULT 0,
      FOREIGN KEY(fee_plan_id) REFERENCES fee_plans(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS fee_installments (
      id ${idColumn},
      fee_plan_id ${integerType},
      label TEXT,
      amount REAL DEFAULT 0,
      dueDate TEXT,
      status TEXT DEFAULT 'Pending',
      FOREIGN KEY(fee_plan_id) REFERENCES fee_plans(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS fee_payments (
      id ${idColumn},
      tenant_id ${integerType},
      fee_plan_id ${integerType},
      student_id ${integerType},
      amount REAL,
      paymentDate TEXT,
      paymentMethod TEXT,
      transactionId TEXT,
      receivedBy TEXT,
      receiptType TEXT DEFAULT 'Non-GST Receipt',
      receiptNumber TEXT UNIQUE,
      notes TEXT,
      status TEXT DEFAULT 'Active',
      cancelledAt TEXT,
      cancelledBy TEXT,
      cancelReason TEXT,
      createdAt TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(fee_plan_id) REFERENCES fee_plans(id),
      FOREIGN KEY(student_id) REFERENCES students(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS fee_receipts (
      id ${idColumn},
      payment_id ${integerType},
      receiptNumber TEXT UNIQUE,
      receiptType TEXT,
      pdfUrl TEXT,
      issuedAt TEXT,
      FOREIGN KEY(payment_id) REFERENCES fee_payments(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS fee_reminders (
      id ${idColumn},
      student_id ${integerType},
      fee_plan_id ${integerType},
      installment_id ${integerType},
      reminderType TEXT,
      sentVia TEXT,
      sentAt TEXT,
      status TEXT DEFAULT 'Detected',
      message TEXT,
      createdAt TEXT,
      FOREIGN KEY(student_id) REFERENCES students(id),
      FOREIGN KEY(fee_plan_id) REFERENCES fee_plans(id),
      FOREIGN KEY(installment_id) REFERENCES fee_installments(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS fee_audit_logs (
      id ${idColumn},
      entityType TEXT,
      entityId ${integerType},
      action TEXT,
      oldValue TEXT,
      newValue TEXT,
      changedBy TEXT,
      createdAt TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS message_templates (
      id ${idColumn},
      templateKey TEXT UNIQUE,
      displayName TEXT,
      channel TEXT DEFAULT 'WhatsApp',
      body TEXT,
      variables TEXT,
      status TEXT DEFAULT 'Active',
      updatedBy TEXT,
      createdAt TEXT,
      updatedAt TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS attendance_sessions (
      id ${idColumn},
      date TEXT,
      batch TEXT,
      course TEXT,
      subject TEXT,
      teacher_id ${integerType},
      teacherName TEXT,
      startTime TEXT,
      endTime TEXT,
      lectureType TEXT,
      status TEXT DEFAULT 'Draft',
      markedBy TEXT,
      submittedAt TEXT,
      lockedAt TEXT,
      remarks TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(teacher_id) REFERENCES teachers(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS attendance_records (
      id ${idColumn},
      session_id ${integerType},
      student_id ${integerType},
      status TEXT DEFAULT 'Not Marked',
      markedBy TEXT,
      markedAt TEXT,
      markedTime TEXT,
      arrivalTime TEXT,
      alertStatus TEXT DEFAULT 'Not Required',
      remarks TEXT,
      updatedAt TEXT,
      UNIQUE(session_id, student_id),
      FOREIGN KEY(session_id) REFERENCES attendance_sessions(id),
      FOREIGN KEY(student_id) REFERENCES students(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS parent_alert_logs (
      id ${idColumn},
      student_id ${integerType},
      attendance_record_id ${integerType},
      alertType TEXT,
      channel TEXT,
      message TEXT,
      status TEXT,
      sentAt TEXT,
      delivery TEXT,
      createdAt TEXT,
      FOREIGN KEY(student_id) REFERENCES students(id),
      FOREIGN KEY(attendance_record_id) REFERENCES attendance_records(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS parent_call_logs (
      id ${idColumn},
      student_id ${integerType},
      attendance_record_id ${integerType},
      parentPhone TEXT,
      callOutcome TEXT,
      calledBy TEXT,
      calledAt TEXT,
      followUpDate TEXT,
      notes TEXT,
      createdAt TEXT,
      FOREIGN KEY(student_id) REFERENCES students(id),
      FOREIGN KEY(attendance_record_id) REFERENCES attendance_records(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS automation_logs (
      id ${idColumn},
      automationType TEXT,
      targetType TEXT,
      targetId ${integerType},
      referenceType TEXT,
      referenceId ${integerType},
      sentVia TEXT DEFAULT 'WhatsApp',
      message TEXT,
      status TEXT DEFAULT 'Queued',
      sentAt TEXT,
      processedAt TEXT,
      createdAt TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS staff_attendance_records (
      id ${idColumn},
      staff_id ${integerType},
      staffName TEXT,
      role TEXT,
      branchName TEXT,
      date TEXT,
      checkIn TEXT,
      checkOut TEXT,
      status TEXT,
      lateMinutes INTEGER DEFAULT 0,
      scheduledLectures INTEGER DEFAULT 0,
      lecturesTaken INTEGER DEFAULT 0,
      missedLectures INTEGER DEFAULT 0,
      replacementRequired TEXT DEFAULT 'No',
      leaveType TEXT,
      approvedBy TEXT,
      remarks TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(staff_id) REFERENCES teachers(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS leave_requests (
      id ${idColumn},
      staff_id ${integerType},
      staffName TEXT,
      leaveType TEXT,
      fromDate TEXT,
      toDate TEXT,
      reason TEXT,
      replacementTeacher TEXT,
      status TEXT DEFAULT 'Pending',
      approvedBy TEXT,
      approvedAt TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY(staff_id) REFERENCES teachers(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS attendance_correction_requests (
      id ${idColumn},
      record_id ${integerType},
      session_id ${integerType},
      student_id ${integerType},
      oldStatus TEXT,
      newStatus TEXT,
      requestReason TEXT,
      status TEXT DEFAULT 'Pending',
      requestedBy TEXT,
      resolvedBy TEXT,
      resolvedAt TEXT,
      createdAt TEXT,
      FOREIGN KEY(record_id) REFERENCES attendance_records(id),
      FOREIGN KEY(session_id) REFERENCES attendance_sessions(id),
      FOREIGN KEY(student_id) REFERENCES students(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS ontology_entities (
      id ${idColumn},
      name TEXT UNIQUE,
      displayName TEXT,
      description TEXT,
      metadata TEXT,
      createdAt TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS ontology_attributes (
      id ${idColumn},
      entity_id ${integerType},
      name TEXT,
      label TEXT,
      type TEXT,
      required INTEGER DEFAULT 0,
      options TEXT,
      metadata TEXT,
      createdAt TEXT,
      FOREIGN KEY(entity_id) REFERENCES ontology_entities(id)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS ontology_relations (
      id ${idColumn},
      from_entity_id ${integerType},
      to_entity_id ${integerType},
      name TEXT,
      cardinality TEXT,
      metadata TEXT,
      createdAt TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS ontology_classifications (
      id ${idColumn},
      name TEXT UNIQUE,
      description TEXT,
      metadata TEXT,
      createdAt TEXT
    )`
  );
}

async function addColumnIfMissing(table, column, definition) {
  try {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (err) {
    const message = String(err.message || '').toLowerCase();
    if (message.includes('duplicate column') || message.includes('already exists')) return;
    throw err;
  }
}

async function migrateFeeColumns() {
  await addColumnIfMissing('fee_plans', 'courseProgram', 'TEXT');
  await addColumnIfMissing('fee_plans', 'paymentType', 'TEXT');
  await addColumnIfMissing('fee_plans', 'discountType', 'TEXT');
  await addColumnIfMissing('fee_plans', 'discountReason', 'TEXT');
  await addColumnIfMissing('fee_plans', 'approvedBy', 'TEXT');
  await addColumnIfMissing('fee_plans', 'discountApprovedDate', 'TEXT');
  await addColumnIfMissing('fee_plans', 'discountProofNote', 'TEXT');
  await addColumnIfMissing('fee_plans', 'feeStatus', 'TEXT');
  await addColumnIfMissing('fee_plans', 'statusUpdatedAt', 'TEXT');
  await addColumnIfMissing('fee_payments', 'transactionId', 'TEXT');
  await addColumnIfMissing('fee_payments', 'receivedBy', 'TEXT');
  await addColumnIfMissing('fee_payments', 'receiptType', "TEXT DEFAULT 'Non-GST Receipt'");
  await addColumnIfMissing('fee_payments', 'status', "TEXT DEFAULT 'Active'");
  await addColumnIfMissing('fee_payments', 'cancelledAt', 'TEXT');
  await addColumnIfMissing('fee_payments', 'cancelledBy', 'TEXT');
  await addColumnIfMissing('fee_payments', 'cancelReason', 'TEXT');
}

async function migrateFeeStructureTemplates() {
  const installmentIdColumn = isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const integerType = isPostgres ? 'INTEGER' : 'INTEGER';

  const columns = [
    ['tenant_id', `${integerType}`],
    ['branch_id', 'TEXT'],
    ['name', 'TEXT'],
    ['code', 'TEXT'],
    ['category', 'TEXT'],
    ['academic_year', 'TEXT'],
    ['class_from', 'TEXT'],
    ['class_to', 'TEXT'],
    ['target_exam', 'TEXT'],
    ['duration_months', 'INTEGER'],
    ['total_amount', 'REAL DEFAULT 0'],
    ['admission_fee', 'REAL DEFAULT 0'],
    ['tuition_fee', 'REAL DEFAULT 0'],
    ['material_fee', 'REAL DEFAULT 0'],
    ['test_series_fee', 'REAL DEFAULT 0'],
    ['technology_fee', 'REAL DEFAULT 0'],
    ['other_fee', 'REAL DEFAULT 0'],
    ['installments_allowed', 'INTEGER DEFAULT 1'],
    ['discount_allowed', 'INTEGER DEFAULT 1'],
    ['max_discount_amount', 'REAL DEFAULT 0'],
    ['max_discount_percent', 'REAL DEFAULT 0'],
    ['is_default', 'INTEGER DEFAULT 0'],
    ['is_active', 'INTEGER DEFAULT 1'],
    ['created_at', 'TEXT'],
    ['updated_at', 'TEXT'],
  ];

  for (const [column, definition] of columns) {
    await addColumnIfMissing('fee_structures', column, definition);
  }

  await run(
    `CREATE TABLE IF NOT EXISTS fee_structure_installments (
      id ${installmentIdColumn},
      tenant_id ${integerType} NOT NULL,
      fee_structure_id ${integerType} NOT NULL,
      installment_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      due_after_days INTEGER NOT NULL DEFAULT 0,
      created_at TEXT,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),
      FOREIGN KEY(fee_structure_id) REFERENCES fee_structures(id)
    )`
  );

  await run(`UPDATE fee_structures SET name = COALESCE(name, courseName) WHERE name IS NULL`);
  await run(
    `UPDATE fee_structures
     SET code = COALESCE(
       code,
       UPPER(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(courseName, name, 'FEE_STRUCTURE')), ' / ', '_'), ' ', '_'), '-', '_'))
     )
     WHERE code IS NULL`
  );
  await run(`UPDATE fee_structures SET category = COALESCE(category, 'OTHER') WHERE category IS NULL`);
  await run(`UPDATE fee_structures SET academic_year = COALESCE(academic_year, '2026-27') WHERE academic_year IS NULL`);
  await run(`UPDATE fee_structures SET total_amount = COALESCE(total_amount, feeAmount, 0) WHERE total_amount IS NULL OR total_amount = 0`);
  await run(`UPDATE fee_structures SET tuition_fee = COALESCE(NULLIF(tuition_fee, 0), total_amount, feeAmount, 0) WHERE tuition_fee IS NULL OR tuition_fee = 0`);
  await run(`UPDATE fee_structures SET duration_months = COALESCE(duration_months, 12) WHERE duration_months IS NULL`);
  await run(`UPDATE fee_structures SET installments_allowed = COALESCE(installments_allowed, 1) WHERE installments_allowed IS NULL`);
  await run(`UPDATE fee_structures SET discount_allowed = COALESCE(discount_allowed, 1) WHERE discount_allowed IS NULL`);
  await run(`UPDATE fee_structures SET max_discount_amount = COALESCE(max_discount_amount, 0) WHERE max_discount_amount IS NULL`);
  await run(`UPDATE fee_structures SET max_discount_percent = COALESCE(max_discount_percent, 0) WHERE max_discount_percent IS NULL`);
  await run(`UPDATE fee_structures SET is_default = COALESCE(is_default, 0) WHERE is_default IS NULL`);
  await run(`UPDATE fee_structures SET is_active = CASE WHEN COALESCE(status, 'Active') = 'Inactive' THEN 0 ELSE COALESCE(is_active, 1) END WHERE is_active IS NULL OR status = 'Inactive'`);
  await run(`UPDATE fee_structures SET created_at = COALESCE(created_at, createdAt, CAST(CURRENT_TIMESTAMP AS TEXT)) WHERE created_at IS NULL`);
  await run(`UPDATE fee_structures SET updated_at = COALESCE(updated_at, updatedAt, CAST(CURRENT_TIMESTAMP AS TEXT)) WHERE updated_at IS NULL`);

  const defaultTenant = await get(`SELECT id FROM tenants ORDER BY id LIMIT 1`);
  if (defaultTenant) {
    await run(`UPDATE fee_structures SET tenant_id = ? WHERE tenant_id IS NULL`, [defaultTenant.id]);
  }

  await run(`CREATE INDEX IF NOT EXISTS idx_fee_structures_tenant_year ON fee_structures (tenant_id, academic_year, is_active)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_fee_structures_tenant_branch ON fee_structures (tenant_id, branch_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_fee_structures_tenant_code ON fee_structures (tenant_id, code, academic_year, branch_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_fee_structure_installments_structure ON fee_structure_installments (fee_structure_id, installment_number)`);
}

async function migrateFeeFlowHardening() {
  const invoiceDiscountColumns = [
    ['discount_request_id', 'TEXT'],
    ['net_payable_amount', 'REAL'],
    ['pending_balance', 'REAL'],
  ];
  for (const [column, definition] of invoiceDiscountColumns) {
    await addColumnIfMissing('fee_plans', column, definition);
  }
  await run(
    `UPDATE fee_plans
     SET net_payable_amount = COALESCE(net_payable_amount, totalAmount - COALESCE(discountAmount, 0)),
         pending_balance = COALESCE(
           pending_balance,
           CASE WHEN totalAmount - COALESCE(discountAmount, 0) - COALESCE((
             SELECT SUM(fee_payments.amount)
             FROM fee_payments
             WHERE fee_payments.fee_plan_id = fee_plans.id
               AND fee_payments.tenant_id = fee_plans.tenant_id
               AND COALESCE(fee_payments.status, 'Active') != 'Cancelled'
           ), 0) > 0
           THEN totalAmount - COALESCE(discountAmount, 0) - COALESCE((
               SELECT SUM(fee_payments.amount)
               FROM fee_payments
               WHERE fee_payments.fee_plan_id = fee_plans.id
                 AND fee_payments.tenant_id = fee_plans.tenant_id
                 AND COALESCE(fee_payments.status, 'Active') != 'Cancelled'
             ), 0)
           ELSE 0 END
         )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS tenant_fee_settings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL UNIQUE,
      academic_year TEXT NOT NULL DEFAULT '2026-27',
      currency TEXT NOT NULL DEFAULT 'INR',
      default_installment_count INTEGER NOT NULL DEFAULT 3,
      default_installment_gap_days INTEGER NOT NULL DEFAULT 30,
      receipt_prefix TEXT NOT NULL DEFAULT 'RCPT',
      next_receipt_number INTEGER NOT NULL DEFAULT 1,
      razorpay_enabled INTEGER NOT NULL DEFAULT 0,
      razorpay_key_id TEXT,
      razorpay_key_secret_encrypted TEXT,
      razorpay_webhook_secret_encrypted TEXT,
      payment_link_expiry_days INTEGER NOT NULL DEFAULT 7,
      auto_send_payment_link INTEGER NOT NULL DEFAULT 0,
      discount_approval_required INTEGER NOT NULL DEFAULT 1,
      max_auto_discount_amount INTEGER NOT NULL DEFAULT 0,
      max_auto_discount_percent INTEGER NOT NULL DEFAULT 0,
      authorized_signature_url TEXT,
      receipt_footer_note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS student_fee_plans (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      lead_id TEXT,
      fee_structure_id TEXT,
      course_name TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      total_amount INTEGER NOT NULL,
      discount_amount INTEGER NOT NULL DEFAULT 0,
      payable_amount INTEGER NOT NULL,
      paid_amount INTEGER NOT NULL DEFAULT 0,
      pending_amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS student_fee_installments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      student_fee_plan_id TEXT NOT NULL,
      installment_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      amount INTEGER NOT NULL,
      paid_amount INTEGER NOT NULL DEFAULT 0,
      pending_amount INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_fee_plan_id) REFERENCES student_fee_plans(id) ON DELETE CASCADE
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS fee_payment_links (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      student_fee_plan_id TEXT NOT NULL,
      student_fee_installment_id TEXT,
      razorpay_payment_link_id TEXT UNIQUE,
      razorpay_short_url TEXT,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      parent_phone TEXT,
      parent_email TEXT,
      status TEXT NOT NULL DEFAULT 'CREATED',
      expires_at TEXT,
      sent_at TEXT,
      paid_at TEXT,
      cancelled_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS razorpay_webhook_events (
      id TEXT PRIMARY KEY,
      event_id TEXT UNIQUE,
      event_type TEXT NOT NULL,
      razorpay_entity_id TEXT,
      payload TEXT NOT NULL,
      processed INTEGER NOT NULL DEFAULT 0,
      processing_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS fee_discount_requests (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      student_fee_plan_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      requested_amount INTEGER NOT NULL DEFAULT 0,
      requested_percent INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      proof_note TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      requested_by_user_id TEXT NOT NULL,
      approved_by_user_id TEXT,
      approved_at TEXT,
      rejected_by_user_id TEXT,
      rejected_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS discount_requests (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      branch_id TEXT,
      student_id TEXT NOT NULL,
      admission_id TEXT,
      fee_invoice_id TEXT NOT NULL,
      discount_type TEXT NOT NULL,
      discount_amount INTEGER NOT NULL DEFAULT 0,
      discount_percent INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      proof_note TEXT NOT NULL,
      requested_by_user_id TEXT NOT NULL,
      requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      approved_by_user_id TEXT,
      approved_at TEXT,
      rejected_by_user_id TEXT,
      rejected_at TEXT,
      rejection_reason TEXT,
      cancelled_by_user_id TEXT,
      cancelled_at TEXT,
      applied_by_user_id TEXT,
      applied_at TEXT,
      applied_amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      branch_id TEXT,
      actor_user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      old_values TEXT DEFAULT '{}',
      new_values TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  const auditColumns = [
    ['branch_id', 'TEXT'],
    ['old_values', "TEXT DEFAULT '{}'"],
    ['new_values', "TEXT DEFAULT '{}'"],
  ];
  for (const [column, definition] of auditColumns) {
    await addColumnIfMissing('audit_logs', column, definition);
  }

  const paymentColumns = [
    ['student_fee_plan_id', 'TEXT'],
    ['student_fee_installment_id', 'TEXT'],
    ['payment_mode', 'TEXT'],
    ['razorpay_payment_id', 'TEXT'],
    ['razorpay_payment_link_id', 'TEXT'],
    ['refund_status', 'TEXT'],
    ['refunded_amount', 'INTEGER NOT NULL DEFAULT 0'],
    ['paid_at', 'TEXT'],
    ['created_at', 'TEXT'],
    ['updated_at', 'TEXT'],
  ];
  for (const [column, definition] of paymentColumns) {
    await addColumnIfMissing('fee_payments', column, definition);
  }

  const receiptColumns = [
    ['tenant_id', 'TEXT'],
    ['receipt_number', 'TEXT'],
    ['student_name', 'TEXT'],
    ['course_name', 'TEXT'],
    ['amount_paid', 'INTEGER'],
    ['payment_mode', 'TEXT'],
    ['pending_balance', 'INTEGER'],
    ['branch_name', 'TEXT'],
    ['receipt_date', 'TEXT'],
    ['pdf_path', 'TEXT'],
    ['created_at', 'TEXT'],
  ];
  for (const [column, definition] of receiptColumns) {
    await addColumnIfMissing('fee_receipts', column, definition);
  }

  const tenants = await all(`SELECT id FROM tenants`);
  for (const tenant of tenants) {
    await run(
      `INSERT INTO tenant_fee_settings
        (id, tenant_id, academic_year, currency, created_at, updated_at)
       SELECT ?, ?, '2026-27', 'INR', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       WHERE NOT EXISTS (SELECT 1 FROM tenant_fee_settings WHERE tenant_id = ?)`,
      [`fee_set_${tenant.id}`, String(tenant.id), String(tenant.id)]
    );
  }

  await run(`CREATE INDEX IF NOT EXISTS idx_student_fee_plans_tenant_student ON student_fee_plans (tenant_id, student_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_student_fee_installments_plan ON student_fee_installments (student_fee_plan_id, installment_number)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_student_fee_installments_due ON student_fee_installments (tenant_id, due_date, status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_fee_payment_links_installment ON fee_payment_links (tenant_id, student_fee_installment_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_fee_discount_requests_plan ON fee_discount_requests (tenant_id, student_fee_plan_id, status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_discount_requests_invoice ON discount_requests (tenant_id, fee_invoice_id, status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_discount_requests_student ON discount_requests (tenant_id, student_id, created_at)`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_discount_requests_one_pending ON discount_requests (tenant_id, fee_invoice_id) WHERE status = 'PENDING'`);
  await run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_entity ON audit_logs (tenant_id, entity_type, entity_id)`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_payments_razorpay_payment ON fee_payments (razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_payments_razorpay_link ON fee_payments (razorpay_payment_link_id) WHERE razorpay_payment_link_id IS NOT NULL`);
}

async function migrateAcademicMasterData() {
  const branchColumns = [
    ['phone', 'TEXT'],
    ['email', 'TEXT'],
    ['is_active', 'INTEGER NOT NULL DEFAULT 1'],
  ];
  for (const [column, definition] of branchColumns) {
    await addColumnIfMissing('branches', column, definition);
  }

  await run(
    `CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      course_type TEXT NOT NULL DEFAULT 'OTHER',
      class_level TEXT,
      duration_months INTEGER NOT NULL DEFAULT 12,
      description TEXT,
      default_fee REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, code)
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, code)
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      branch_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PLANNED',
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, code)
    )`
  );
  await addColumnIfMissing('batches', 'deleted_at', 'TEXT');
  await run(
    `CREATE TABLE IF NOT EXISTS batch_timings (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      batch_id TEXT NOT NULL,
      day_of_week TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      room_name TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS faculty_subjects (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      faculty_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, faculty_id, subject_id)
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS batch_students (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      batch_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      left_at TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS batch_teachers (
      id TEXT PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      batch_id TEXT NOT NULL,
      teacher_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'PRIMARY',
      assigned_from TEXT NOT NULL,
      assigned_to TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  const studentColumns = [
    ['branch_id', 'TEXT'],
    ['primary_course_id', 'TEXT'],
    ['primary_batch_id', 'TEXT'],
    ['student_name', 'TEXT'],
    ['parent_name', 'TEXT'],
    ['parent_phone', 'TEXT'],
    ['class_level', 'TEXT'],
    ['school_name', 'TEXT'],
    ['admission_id', 'TEXT'],
    ['converted_from_lead_id', 'TEXT'],
    ['status', "TEXT DEFAULT 'ACTIVE'"],
    ['legacy_data', 'TEXT'],
    ['created_at', 'TEXT'],
    ['updated_at', 'TEXT'],
  ];
  for (const [column, definition] of studentColumns) {
    await addColumnIfMissing('students', column, definition);
  }

  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_tenant_code ON branches (tenant_id, code) WHERE deleted_at IS NULL`);
  await run(`CREATE INDEX IF NOT EXISTS idx_batches_tenant_branch ON batches (tenant_id, branch_id, status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_batches_tenant_course ON batches (tenant_id, course_id, status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_batch_timings_batch ON batch_timings (tenant_id, batch_id, is_active, day_of_week)`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_students_active ON batch_students (tenant_id, batch_id, student_id) WHERE status = 'ACTIVE'`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_teachers_active ON batch_teachers (tenant_id, batch_id, teacher_id, subject_id) WHERE status = 'ACTIVE'`);

  const tenants = await all(`SELECT id FROM tenants`);
  for (const tenant of tenants) {
    let branch = await get(
      `SELECT * FROM branches WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY is_default DESC, created_at ASC LIMIT 1`,
      [tenant.id]
    );
    if (!branch) {
      const branchId = `branch_${tenant.id}_default`;
      await run(
        `INSERT INTO branches
          (id, tenant_id, name, code, city, is_default, is_active, created_by, created_at, updated_at)
         VALUES (?, ?, 'Main Branch', 'MAIN', 'Main', 1, 1, 'migration', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [branchId, tenant.id]
      );
      branch = await get(`SELECT * FROM branches WHERE id = ?`, [branchId]);
    }
    await run(`UPDATE branches SET code = COALESCE(NULLIF(code, ''), 'MAIN'), is_active = COALESCE(is_active, 1) WHERE id = ?`, [branch.id]);

    const students = await all(`SELECT * FROM students WHERE tenant_id = ?`, [tenant.id]);
    for (const student of students) {
      let data = {};
      try { data = student.data ? JSON.parse(student.data) : {}; } catch (error) { data = {}; }
      const courseName = String(data.course || student.grade || 'General').trim() || 'General';
      const courseCode = `LEGACY-${courseName.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`.slice(0, 40);
      let course = await get(`SELECT * FROM courses WHERE tenant_id = ? AND code = ?`, [tenant.id, courseCode]);
      if (!course) {
        const courseId = `course_${tenant.id}_${courseCode.toLowerCase()}`;
        await run(
          `INSERT INTO courses
            (id, tenant_id, name, code, course_type, class_level, duration_months, default_fee, is_active)
           VALUES (?, ?, ?, ?, 'OTHER', ?, 12, 0, 1)`,
          [courseId, tenant.id, courseName, courseCode, student.grade || null]
        );
        course = await get(`SELECT * FROM courses WHERE id = ?`, [courseId]);
      }
      const batchName = String(student.batch || 'General Batch').trim() || 'General Batch';
      const batchCode = `LEGACY-${String(branch.code || 'MAIN')}-${courseCode}-${batchName.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`.slice(0, 60);
      let batch = await get(`SELECT * FROM batches WHERE tenant_id = ? AND code = ?`, [tenant.id, batchCode]);
      if (!batch) {
        const batchId = `batch_${tenant.id}_${cryptoHash(batchCode)}`;
        await run(
          `INSERT INTO batches
            (id, tenant_id, branch_id, course_id, name, code, academic_year,
             start_date, end_date, capacity, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, '2026-06-01', '2027-03-31', 1000, 'ACTIVE')`,
          [batchId, tenant.id, branch.id, course.id, batchName, batchCode, data.academicYear || '2026-27']
        );
        batch = await get(`SELECT * FROM batches WHERE id = ?`, [batchId]);
      }
      await run(
        `UPDATE students
         SET branch_id = COALESCE(branch_id, ?),
             primary_course_id = COALESCE(primary_course_id, ?),
             primary_batch_id = COALESCE(primary_batch_id, ?),
             student_name = COALESCE(student_name, name),
             parent_name = COALESCE(parent_name, ?),
             parent_phone = COALESCE(parent_phone, ?),
             class_level = COALESCE(class_level, grade),
             school_name = COALESCE(school_name, ?),
             status = COALESCE(status, ?),
             legacy_data = COALESCE(legacy_data, data),
             created_at = COALESCE(created_at, CAST(CURRENT_TIMESTAMP AS TEXT)),
             updated_at = COALESCE(updated_at, CAST(CURRENT_TIMESTAMP AS TEXT))
         WHERE id = ? AND tenant_id = ?`,
        [
          branch.id,
          course.id,
          batch.id,
          data.parentName || data.fatherName || data.motherName || null,
          data.primaryPhone || data.whatsapp || null,
          data.school || null,
          data.status || 'ACTIVE',
          student.id,
          tenant.id,
        ]
      );
      await run(
        `INSERT INTO batch_students
          (id, tenant_id, batch_id, student_id, joined_at, status, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         WHERE NOT EXISTS (
           SELECT 1 FROM batch_students
           WHERE tenant_id = ? AND batch_id = ? AND student_id = ? AND status = 'ACTIVE'
         )`,
        [
          `bs_${tenant.id}_${batch.id}_${student.id}`,
          tenant.id,
          batch.id,
          String(student.id),
          data.joiningDate || new Date().toISOString().slice(0, 10),
          tenant.id,
          batch.id,
          String(student.id),
        ]
      );
    }
  }
}

async function migrateStudentProfiles() {
  const studentColumns = [
    ['student_code', 'TEXT'],
    ['first_name', 'TEXT'],
    ['middle_name', 'TEXT'],
    ['last_name', 'TEXT'],
    ['display_name', 'TEXT'],
    ['gender', 'TEXT'],
    ['date_of_birth', 'TEXT'],
    ['student_phone', 'TEXT'],
    ['student_email', 'TEXT'],
    ['address', 'TEXT'],
    ['admission_date', 'TEXT'],
    ['deleted_at', 'TEXT'],
  ];
  for (const [column, definition] of studentColumns) {
    await addColumnIfMissing('students', column, definition);
  }
  await addColumnIfMissing('student_history', 'tenant_id', 'INTEGER');
  await addColumnIfMissing('follow_up_tasks', 'tenant_id', 'INTEGER');
  await addColumnIfMissing('follow_up_tasks', 'risk_reason', 'TEXT');
  await addColumnIfMissing('follow_up_tasks', 'assigned_to_user_id', 'TEXT');
  await addColumnIfMissing('follow_up_tasks', 'task_category', "TEXT DEFAULT 'OPERATIONAL'");
  await addColumnIfMissing('follow_up_tasks', 'visibility_scope', "TEXT DEFAULT 'MANAGEMENT'");
  await run(
    `UPDATE follow_up_tasks
     SET task_category = CASE
       WHEN UPPER(COALESCE(task_category, '')) IN ('ACADEMIC', 'COUNSELLING', 'ATTENDANCE', 'FINANCIAL', 'GUARDIAN_COMMUNICATION', 'OPERATIONAL')
         THEN UPPER(task_category)
       WHEN UPPER(COALESCE(taskType, '')) LIKE '%ACADEMIC%' THEN 'ACADEMIC'
       WHEN UPPER(COALESCE(taskType, '')) LIKE '%ATTENDANCE%' OR risk_reason IS NOT NULL THEN 'ATTENDANCE'
       WHEN UPPER(COALESCE(taskType, '')) LIKE '%FEE%' OR UPPER(COALESCE(taskType, '')) LIKE '%PAYMENT%' OR UPPER(COALESCE(linkedType, '')) LIKE '%FEE%' THEN 'FINANCIAL'
       WHEN UPPER(COALESCE(taskType, '')) LIKE '%PARENT%' OR UPPER(COALESCE(taskType, '')) LIKE '%GUARDIAN%' THEN 'GUARDIAN_COMMUNICATION'
       WHEN UPPER(COALESCE(taskType, '')) LIKE '%COUNSELL%' OR UPPER(COALESCE(linkedType, '')) LIKE '%ADMISSION%' THEN 'COUNSELLING'
       ELSE 'OPERATIONAL'
     END
     WHERE task_category IS NULL
        OR UPPER(COALESCE(task_category, '')) NOT IN ('ACADEMIC', 'COUNSELLING', 'ATTENDANCE', 'FINANCIAL', 'GUARDIAN_COMMUNICATION', 'OPERATIONAL')`
  );
  await run(
    `UPDATE follow_up_tasks
     SET visibility_scope = COALESCE(visibility_scope, CASE
       WHEN task_category IN ('ACADEMIC', 'ATTENDANCE') THEN 'TEACHER'
       WHEN task_category = 'COUNSELLING' THEN 'COUNSELLOR'
       ELSE 'MANAGEMENT'
     END)`
  );
  await addColumnIfMissing('teachers', 'user_id', 'TEXT');

  await run(
    `CREATE TABLE IF NOT EXISTS student_guardians (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      name TEXT NOT NULL,
      relationship TEXT NOT NULL DEFAULT 'GUARDIAN',
      phone TEXT,
      alternate_phone TEXT,
      email TEXT,
      occupation TEXT,
      address TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      is_emergency_contact INTEGER NOT NULL DEFAULT 0,
      can_receive_notifications INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS student_documents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      document_type TEXT NOT NULL,
      title TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_name TEXT,
      mime_type TEXT,
      file_size INTEGER,
      uploaded_by_user_id TEXT,
      verified_by_user_id TEXT,
      verified_at TEXT,
      status TEXT NOT NULL DEFAULT 'UPLOADED',
      notes TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS communication_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      student_id TEXT,
      guardian_id TEXT,
      lead_id TEXT,
      admission_id TEXT,
      channel TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'OUTBOUND',
      event_type TEXT NOT NULL,
      subject TEXT,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'LOGGED',
      provider TEXT,
      provider_message_id TEXT,
      sent_by_user_id TEXT,
      sent_at TEXT,
      delivered_at TEXT,
      read_at TEXT,
      failed_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_students_tenant_code ON students (tenant_id, student_code) WHERE student_code IS NOT NULL`);
  await run(`CREATE INDEX IF NOT EXISTS idx_student_guardians_student ON student_guardians (tenant_id, student_id, is_primary)`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_student_guardians_primary ON student_guardians (tenant_id, student_id) WHERE is_primary = 1`);
  await run(`CREATE INDEX IF NOT EXISTS idx_student_documents_student ON student_documents (tenant_id, student_id, archived_at, created_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_communication_events_student ON communication_events (tenant_id, student_id, created_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_access ON follow_up_tasks (tenant_id, student_id, task_category, assigned_to_user_id, status, dueDate)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_teachers_user ON teachers (tenant_id, user_id)`);

  const tenants = await all(`SELECT id FROM tenants`);
  for (const tenant of tenants) {
    await run(
      `UPDATE student_history SET tenant_id = ?
       WHERE tenant_id IS NULL AND student_id IN (SELECT id FROM students WHERE tenant_id = ?)`,
      [tenant.id, tenant.id]
    );
    await run(
      `UPDATE follow_up_tasks SET tenant_id = ?
       WHERE tenant_id IS NULL AND student_id IN (SELECT id FROM students WHERE tenant_id = ?)`,
      [tenant.id, tenant.id]
    );
    const students = await all(`SELECT * FROM students WHERE tenant_id = ? ORDER BY id`, [tenant.id]);
    for (const student of students) {
      let legacy = {};
      try { legacy = student.data ? JSON.parse(student.data) : {}; } catch (error) { legacy = {}; }
      const displayName = student.display_name || student.student_name || student.name || 'Student';
      const nameParts = String(displayName).trim().split(/\s+/);
      const studentCode = student.student_code || `STU-${String(tenant.id).padStart(3, '0')}-${String(student.id).padStart(5, '0')}`;
      await run(
        `UPDATE students SET
          student_code = COALESCE(student_code, ?),
          first_name = COALESCE(first_name, ?),
          last_name = COALESCE(last_name, ?),
          display_name = COALESCE(display_name, ?),
          student_phone = COALESCE(student_phone, ?),
          student_email = COALESCE(student_email, ?),
          address = COALESCE(address, ?),
          admission_date = COALESCE(admission_date, ?),
          status = UPPER(CASE
            WHEN status IN ('Admitted', 'ACTIVE', 'Active') THEN 'ACTIVE'
            WHEN status IN ('Enquiry', 'PROVISIONAL', 'Provisional') THEN 'PROVISIONAL'
            WHEN status IN ('Dropout', 'DROPPED') THEN 'DROPPED'
            ELSE COALESCE(status, 'ACTIVE')
          END)
         WHERE id = ? AND tenant_id = ?`,
        [
          studentCode,
          nameParts[0] || displayName,
          nameParts.length > 1 ? nameParts.slice(1).join(' ') : null,
          displayName,
          legacy.studentPhone || null,
          legacy.studentEmail || null,
          legacy.address || null,
          legacy.joiningDate || null,
          student.id,
          tenant.id,
        ]
      );
      const guardianName = student.parent_name || legacy.parentName || legacy.fatherName || legacy.motherName;
      const guardianPhone = student.parent_phone || legacy.primaryPhone || legacy.whatsapp;
      if (guardianName && guardianPhone) {
        await run(
          `INSERT INTO student_guardians
            (id, tenant_id, student_id, name, relationship, phone, is_primary,
             is_emergency_contact, can_receive_notifications, created_at, updated_at)
           SELECT ?, ?, ?, ?, ?, ?, 1, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
           WHERE NOT EXISTS (
             SELECT 1 FROM student_guardians WHERE tenant_id = ? AND student_id = ? AND is_primary = 1
           )`,
          [
            `guardian_${tenant.id}_${student.id}_primary`,
            String(tenant.id),
            String(student.id),
            guardianName,
            legacy.fatherName ? 'FATHER' : legacy.motherName ? 'MOTHER' : 'GUARDIAN',
            guardianPhone,
            String(tenant.id),
            String(student.id),
          ]
        );
      }
    }
  }
  await run(`CREATE INDEX IF NOT EXISTS idx_student_history_tenant_student ON student_history (tenant_id, student_id, eventDate)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_tenant_student ON follow_up_tasks (tenant_id, student_id, dueDate)`);
}

async function migrateAttendanceOperations() {
  const sessionColumns = [
    ['tenant_id', 'INTEGER'],
    ['branch_id', 'TEXT'],
    ['batch_id', 'TEXT'],
    ['subject_id', 'TEXT'],
    ['session_date', 'TEXT'],
    ['start_time', 'TEXT'],
    ['end_time', 'TEXT'],
    ['session_type', "TEXT DEFAULT 'REGULAR_CLASS'"],
    ['marked_by_user_id', 'TEXT'],
    ['submitted_at', 'TEXT'],
    ['locked_at', 'TEXT'],
    ['total_students', 'INTEGER NOT NULL DEFAULT 0'],
    ['present_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['absent_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['late_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['excused_count', 'INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [column, definition] of sessionColumns) await addColumnIfMissing('attendance_sessions', column, definition);

  const recordColumns = [
    ['tenant_id', 'INTEGER'],
    ['branch_id', 'TEXT'],
    ['batch_id', 'TEXT'],
    ['marked_at', 'TEXT'],
    ['marked_by_user_id', 'TEXT'],
    ['absence_reason', 'TEXT'],
    ['late_minutes', 'INTEGER NOT NULL DEFAULT 0'],
    ['parent_alert_status', "TEXT DEFAULT 'NOT_REQUIRED'"],
    ['parent_alert_sent_at', 'TEXT'],
    ['created_at', 'TEXT'],
    ['updated_at', 'TEXT'],
  ];
  for (const [column, definition] of recordColumns) await addColumnIfMissing('attendance_records', column, definition);

  await run(
    `CREATE TABLE IF NOT EXISTS attendance_settings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL UNIQUE,
      send_absence_alert INTEGER NOT NULL DEFAULT 1,
      send_late_alert INTEGER NOT NULL DEFAULT 0,
      send_repeated_absence_alert INTEGER NOT NULL DEFAULT 1,
      send_low_attendance_alert INTEGER NOT NULL DEFAULT 1,
      low_attendance_threshold INTEGER NOT NULL DEFAULT 75,
      repeated_absence_threshold INTEGER NOT NULL DEFAULT 3,
      auto_followup_enabled INTEGER NOT NULL DEFAULT 1,
      alert_channel TEXT NOT NULL DEFAULT 'WHATSAPP',
      alert_delay_minutes INTEGER NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS attendance_risk_snapshots (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      branch_id TEXT,
      student_id TEXT NOT NULL,
      batch_id TEXT,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      total_sessions INTEGER NOT NULL DEFAULT 0,
      present_count INTEGER NOT NULL DEFAULT 0,
      absent_count INTEGER NOT NULL DEFAULT 0,
      late_count INTEGER NOT NULL DEFAULT 0,
      excused_count INTEGER NOT NULL DEFAULT 0,
      attendance_percentage REAL NOT NULL DEFAULT 0,
      consecutive_absences INTEGER NOT NULL DEFAULT 0,
      absences_last_7_days INTEGER NOT NULL DEFAULT 0,
      absences_last_30_days INTEGER NOT NULL DEFAULT 0,
      risk_level TEXT NOT NULL DEFAULT 'LOW',
      risk_reason TEXT,
      last_parent_alert_at TEXT,
      last_followup_at TEXT,
      next_followup_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, student_id, batch_id, period_start, period_end)
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS teacher_attendance_completion_scores (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      branch_id TEXT,
      teacher_id TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      scheduled_sessions INTEGER NOT NULL DEFAULT 0,
      submitted_sessions INTEGER NOT NULL DEFAULT 0,
      on_time_submissions INTEGER NOT NULL DEFAULT 0,
      late_submissions INTEGER NOT NULL DEFAULT 0,
      missed_sessions INTEGER NOT NULL DEFAULT 0,
      correction_requests INTEGER NOT NULL DEFAULT 0,
      completion_percentage REAL NOT NULL DEFAULT 0,
      on_time_percentage REAL NOT NULL DEFAULT 0,
      final_score REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, teacher_id, period_start, period_end)
    )`
  );
  const followUpColumns = [
    ['source', "TEXT DEFAULT 'MANUAL'"],
    ['source_entity_type', 'TEXT'],
    ['source_entity_id', 'TEXT'],
    ['risk_reason', 'TEXT'],
  ];
  for (const [column, definition] of followUpColumns) await addColumnIfMissing('follow_up_tasks', column, definition);

  const tenants = await all(`SELECT id FROM tenants`);
  for (const tenant of tenants) {
    await run(
      `INSERT INTO attendance_settings (id, tenant_id)
       SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM attendance_settings WHERE tenant_id = ?)`,
      [`attendance_settings_${tenant.id}`, String(tenant.id), String(tenant.id)]
    );
  }
  await run(
    `UPDATE attendance_sessions SET
      session_date = COALESCE(session_date, date),
      batch_id = COALESCE(batch_id, batch),
      submitted_at = COALESCE(submitted_at, submittedAt),
      locked_at = COALESCE(locked_at, lockedAt),
      marked_by_user_id = COALESCE(marked_by_user_id, markedBy),
      session_type = COALESCE(session_type, CASE
        WHEN lectureType = 'Test' THEN 'TEST'
        WHEN lectureType = 'Doubt' THEN 'DOUBT_SESSION'
        WHEN lectureType = 'Revision' THEN 'REVISION'
        ELSE 'REGULAR_CLASS' END),
      status = UPPER(CASE
        WHEN status = 'Submitted' THEN 'SUBMITTED'
        WHEN status = 'Locked' THEN 'LOCKED'
        WHEN status = 'Cancelled' THEN 'CANCELLED'
        ELSE COALESCE(status, 'DRAFT') END)`
  );
  await run(
    `UPDATE attendance_records SET
      marked_at = COALESCE(marked_at, markedAt),
      marked_by_user_id = COALESCE(marked_by_user_id, markedBy),
      parent_alert_status = COALESCE(parent_alert_status, UPPER(REPLACE(alertStatus, ' ', '_'))),
      parent_alert_sent_at = COALESCE(parent_alert_sent_at, CASE WHEN alertStatus = 'Sent' THEN updatedAt ELSE NULL END),
      created_at = COALESCE(created_at, CAST(CURRENT_TIMESTAMP AS TEXT)),
      updated_at = COALESCE(updated_at, updatedAt, CAST(CURRENT_TIMESTAMP AS TEXT)),
      status = UPPER(REPLACE(COALESCE(status, 'NOT_MARKED'), ' ', '_'))`
  );
  await run(`CREATE INDEX IF NOT EXISTS idx_attendance_sessions_calendar ON attendance_sessions (tenant_id, session_date, batch_id, teacher_id, status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_attendance_records_risk ON attendance_records (tenant_id, student_id, status, marked_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_attendance_risk_level ON attendance_risk_snapshots (tenant_id, risk_level, branch_id, batch_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_teacher_attendance_scores ON teacher_attendance_completion_scores (tenant_id, period_start, period_end, teacher_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_followup_attendance_dedupe ON follow_up_tasks (tenant_id, student_id, source, risk_reason, status)`);
}

async function migrateWhatsAppOfficialTemplates() {
  await run(
    `CREATE TABLE IF NOT EXISTS whatsapp_official_templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      template_key TEXT NOT NULL,
      provider_template_name TEXT,
      provider_template_id TEXT,
      language_code TEXT NOT NULL DEFAULT 'en',
      category TEXT NOT NULL DEFAULT 'UTILITY',
      status TEXT NOT NULL DEFAULT 'LOCAL_DRAFT',
      header_type TEXT,
      header_text TEXT,
      body_text TEXT NOT NULL,
      footer_text TEXT,
      button_config TEXT DEFAULT '[]',
      variable_schema TEXT NOT NULL DEFAULT '[]',
      sample_values TEXT DEFAULT '{}',
      rejection_reason TEXT,
      last_synced_at TEXT,
      created_by_user_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, template_key, language_code)
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS whatsapp_template_messages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      branch_id TEXT,
      template_id TEXT NOT NULL,
      template_key TEXT NOT NULL,
      provider_template_name TEXT NOT NULL,
      language_code TEXT NOT NULL,
      student_id TEXT,
      guardian_id TEXT,
      lead_id TEXT,
      admission_id TEXT,
      fee_invoice_id TEXT,
      fee_installment_id TEXT,
      attendance_session_id TEXT,
      test_id TEXT,
      recipient_phone TEXT NOT NULL,
      resolved_variables TEXT NOT NULL DEFAULT '[]',
      rendered_preview TEXT,
      provider_message_id TEXT,
      status TEXT NOT NULL DEFAULT 'QUEUED',
      error_code TEXT,
      error_message TEXT,
      sent_by_user_id TEXT,
      sent_at TEXT,
      delivered_at TEXT,
      read_at TEXT,
      failed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS whatsapp_template_settings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL UNIQUE,
      attendance_absent_enabled INTEGER NOT NULL DEFAULT 1,
      fee_due_enabled INTEGER NOT NULL DEFAULT 1,
      fee_overdue_enabled INTEGER NOT NULL DEFAULT 1,
      payment_receipt_enabled INTEGER NOT NULL DEFAULT 1,
      test_result_enabled INTEGER NOT NULL DEFAULT 1,
      weekly_report_enabled INTEGER NOT NULL DEFAULT 0,
      admission_followup_enabled INTEGER NOT NULL DEFAULT 1,
      default_language_code TEXT NOT NULL DEFAULT 'en',
      send_to_primary_guardian_only INTEGER NOT NULL DEFAULT 1,
      allow_bulk_send INTEGER NOT NULL DEFAULT 0,
      require_manual_approval_before_bulk_send INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await run(`CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_tenant_status ON whatsapp_official_templates (tenant_id, status, template_key)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_provider ON whatsapp_template_messages (provider_message_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_student ON whatsapp_template_messages (tenant_id, student_id, created_at)`);

  const messageColumns = [
    ['status_rank', 'INTEGER NOT NULL DEFAULT 0'],
    ['replied_at', 'TEXT'],
    ['provider_error_details', 'TEXT'],
    ['last_webhook_payload', 'TEXT'],
    ['last_status_at', 'TEXT'],
    ['webhook_event_count', 'INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [column, definition] of messageColumns) await addColumnIfMissing('whatsapp_template_messages', column, definition);
  const communicationColumns = [
    ['replied_at', 'TEXT'],
    ['error_code', 'TEXT'],
    ['error_message', 'TEXT'],
  ];
  for (const [column, definition] of communicationColumns) await addColumnIfMissing('communication_events', column, definition);
  await run(
    `CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      idempotency_key TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL DEFAULT 'UNKNOWN',
      provider_message_id TEXT,
      provider_inbound_message_id TEXT,
      provider_phone_number_id TEXT,
      recipient_phone TEXT,
      sender_phone TEXT,
      status TEXT,
      provider_timestamp TEXT,
      payload TEXT NOT NULL,
      processed_at TEXT,
      processing_status TEXT NOT NULL DEFAULT 'RECEIVED',
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await run(`CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_message ON whatsapp_webhook_events (provider_message_id, status, provider_timestamp)`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_webhook_inbound_unique ON whatsapp_webhook_events (provider_inbound_message_id) WHERE provider_inbound_message_id IS NOT NULL`);

  const definitions = [
    ['attendance_absent', 'attendance_absent', 'UTILITY', 'Dear Parent, {{1}} was absent on {{2}} for {{3}} - {{4}} class at {{5}}. For any clarification, please contact {{6}}.', [
      ['student_name', 'student.displayName'], ['date', 'attendanceSession.sessionDate'], ['batch_name', 'batch.name'],
      ['subject_name', 'subject.name'], ['institute_name', 'tenant.name'], ['branch_phone', 'branch.phone'],
    ]],
    ['fee_due', 'fee_due', 'UTILITY', 'Dear Parent, fee installment of ₹{{1}} for {{2}} is due on {{3}} for {{4}}. Pay here: {{5}} - {{6}}.', [
      ['amount_due', 'installment.amountDue'], ['student_name', 'student.displayName'], ['due_date', 'installment.dueDate'],
      ['course_name', 'course.name'], ['payment_link', 'paymentLink.url'], ['institute_name', 'tenant.name'],
    ]],
    ['fee_overdue', 'fee_overdue', 'UTILITY', 'Dear Parent, ₹{{1}} fee for {{2}} is overdue by {{3}} days. Original due date was {{4}}. Pay here: {{5}} or contact {{6}}.', [
      ['overdue_amount', 'installment.amountDue'], ['student_name', 'student.displayName'], ['days_overdue', 'installment.daysOverdue'],
      ['due_date', 'installment.dueDate'], ['payment_link', 'paymentLink.url'], ['branch_phone', 'branch.phone'],
    ]],
    ['payment_receipt', 'payment_receipt', 'UTILITY', 'Dear Parent, payment of ₹{{1}} for {{2}} has been received. Receipt No: {{3}}, Date: {{4}}. Pending balance: ₹{{5}}. Receipt: {{6}}.', [
      ['paid_amount', 'payment.amount'], ['student_name', 'student.displayName'], ['receipt_number', 'receipt.number'],
      ['payment_date', 'payment.date'], ['pending_balance', 'payment.pendingBalance'], ['receipt_link', 'receipt.url'],
    ]],
    ['test_result', 'test_result', 'UTILITY', 'Dear Parent, {{1}} scored {{2}}/{{3}} in {{4}} - {{5}}. Percentage: {{6}}%. Rank: {{7}}.', [
      ['student_name', 'student.displayName'], ['marks_obtained', 'testResult.marksObtained'], ['total_marks', 'testResult.totalMarks'],
      ['test_name', 'test.name'], ['subject_name', 'subject.name'], ['percentage', 'testResult.percentage'], ['rank', 'testResult.rank'],
    ]],
    ['weekly_report', 'weekly_report', 'UTILITY', 'Weekly report for {{1}}: {{2}}. Attendance: {{3}}%. Tests: {{4}}. Average score: {{5}}%. Pending fee: ₹{{6}}. Details: {{7}}.', [
      ['student_name', 'student.displayName'], ['week_range', 'weeklyReport.weekRange'], ['attendance_percentage', 'weeklyReport.attendancePercentage'],
      ['tests_count', 'weeklyReport.testsCount'], ['average_score', 'weeklyReport.averageScore'], ['pending_fee', 'weeklyReport.pendingFee'],
      ['profile_link', 'weeklyReport.profileLink'],
    ]],
    ['admission_followup', 'admission_followup', 'UTILITY', 'Dear Parent, thank you for your enquiry for {{1}}. Our counsellor {{2}} will guide you for {{3}} at {{4}}. Follow-up date: {{5}}. Contact: {{6}}.', [
      ['student_name', 'lead.studentName'], ['counsellor_name', 'counsellor.name'], ['course_name', 'course.name'],
      ['branch_name', 'branch.name'], ['followup_date', 'followup.date'], ['contact_number', 'branch.phone'],
    ]],
  ];
  const tenants = await all(`SELECT id FROM tenants`);
  for (const tenant of tenants) {
    await run(
      `INSERT INTO whatsapp_template_settings (id, tenant_id)
       SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM whatsapp_template_settings WHERE tenant_id = ?)`,
      [`wa_settings_${tenant.id}`, String(tenant.id), String(tenant.id)]
    );
    for (const [key, providerName, category, body, variables] of definitions) {
      const schema = variables.map(([name, source], index) => ({ position: index + 1, name, source, required: true }));
      const samples = Object.fromEntries(variables.map(([name]) => [name, `Sample ${name.replaceAll('_', ' ')}`]));
      await run(
        `INSERT INTO whatsapp_official_templates
          (id, tenant_id, template_key, provider_template_name, language_code, category,
           status, body_text, variable_schema, sample_values, created_by_user_id,
           created_at, updated_at)
         SELECT ?, ?, ?, ?, 'en', ?, 'LOCAL_DRAFT', ?, ?, ?, 'system',
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         WHERE NOT EXISTS (
           SELECT 1 FROM whatsapp_official_templates
           WHERE tenant_id = ? AND template_key = ? AND language_code = 'en'
         )`,
        [`wa_template_${tenant.id}_${key}`, String(tenant.id), key, providerName, category, body,
          JSON.stringify(schema), JSON.stringify(samples), String(tenant.id), key]
      );
    }
  }
}

async function migrateParentCommunicationCenter() {
  const communicationColumns = [
    ['branch_id', 'TEXT'],
    ['related_entity_type', 'TEXT'],
    ['related_entity_id', 'TEXT'],
    ['assigned_to_user_id', 'TEXT'],
    ['logged_at', 'TEXT'],
    ['reviewed_at', 'TEXT'],
    ['reviewed_by_user_id', 'TEXT'],
    ['archived_at', 'TEXT'],
    ['visibility', "TEXT NOT NULL DEFAULT 'STAFF'"],
  ];
  for (const [column, definition] of communicationColumns) await addColumnIfMissing('communication_events', column, definition);

  const callColumns = [
    ['tenant_id', 'INTEGER'],
    ['deletedAt', 'TEXT'],
    ['branch_id', 'TEXT'],
    ['guardian_id', 'TEXT'],
    ['lead_id', 'TEXT'],
    ['phone_number', 'TEXT'],
    ['call_direction', "TEXT DEFAULT 'OUTBOUND'"],
    ['call_status', "TEXT DEFAULT 'COMPLETED'"],
    ['purpose', 'TEXT'],
    ['summary', 'TEXT'],
    ['outcome', 'TEXT'],
    ['next_action', 'TEXT'],
    ['next_followup_at', 'TEXT'],
    ['called_by_user_id', 'TEXT'],
    ['call_started_at', 'TEXT'],
    ['call_ended_at', 'TEXT'],
    ['duration_seconds', 'INTEGER'],
    ['updated_at', 'TEXT'],
  ];
  for (const [column, definition] of callColumns) await addColumnIfMissing('parent_call_logs', column, definition);

  await run(
    `CREATE TABLE IF NOT EXISTS parent_manual_notes (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      branch_id TEXT,
      student_id TEXT,
      guardian_id TEXT,
      lead_id TEXT,
      communication_event_id TEXT,
      note_type TEXT NOT NULL DEFAULT 'GENERAL',
      subject TEXT,
      note TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'STAFF',
      created_by_user_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await run(
    `UPDATE communication_events SET
       branch_id = COALESCE(branch_id, (
         SELECT CAST(s.branch_id AS TEXT) FROM students s
         WHERE CAST(s.id AS TEXT) = CAST(communication_events.student_id AS TEXT)
           AND CAST(s.tenant_id AS TEXT) = CAST(communication_events.tenant_id AS TEXT)
       )),
       logged_at = COALESCE(logged_at, sent_at, created_at)`
  );
  await run(
    `UPDATE parent_call_logs SET
       phone_number = COALESCE(phone_number, parentPhone),
       outcome = COALESCE(outcome, callOutcome),
       summary = COALESCE(summary, notes),
       next_followup_at = COALESCE(next_followup_at, followUpDate),
       called_by_user_id = COALESCE(called_by_user_id, calledBy),
       call_started_at = COALESCE(call_started_at, calledAt),
       updated_at = COALESCE(updated_at, createdAt, CAST(CURRENT_TIMESTAMP AS TEXT))`
  );

  await run(`CREATE INDEX IF NOT EXISTS idx_parent_communication_inbox ON communication_events (tenant_id, archived_at, logged_at, created_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_parent_communication_filters ON communication_events (tenant_id, branch_id, channel, event_type, status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_parent_communication_assignee ON communication_events (tenant_id, assigned_to_user_id, reviewed_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_parent_manual_notes_student ON parent_manual_notes (tenant_id, student_id, created_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_parent_call_logs_student_normalized ON parent_call_logs (tenant_id, student_id, call_started_at)`);
}

async function migrateTeacherScore() {
  await run(
    `CREATE TABLE IF NOT EXISTS teacher_score_configs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL UNIQUE,
      attendance_weight REAL NOT NULL DEFAULT 15,
      planning_weight REAL NOT NULL DEFAULT 10,
      syllabus_weight REAL NOT NULL DEFAULT 15,
      homework_weight REAL NOT NULL DEFAULT 10,
      student_improvement_weight REAL NOT NULL DEFAULT 25,
      doubt_support_weight REAL NOT NULL DEFAULT 10,
      feedback_weight REAL NOT NULL DEFAULT 15,
      max_complaint_penalty REAL NOT NULL DEFAULT 10,
      minimum_feedback_responses INTEGER NOT NULL DEFAULT 10,
      minimum_attendance_sessions INTEGER NOT NULL DEFAULT 5,
      minimum_improvement_tests INTEGER NOT NULL DEFAULT 2,
      on_time_attendance_buffer_minutes INTEGER NOT NULL DEFAULT 15,
      allow_teacher_self_view INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS teacher_score_snapshots (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      branch_id TEXT,
      teacher_id TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      period_type TEXT NOT NULL DEFAULT 'MONTHLY',
      attendance_score REAL NOT NULL DEFAULT 0,
      planning_score REAL NOT NULL DEFAULT 0,
      syllabus_score REAL NOT NULL DEFAULT 0,
      homework_score REAL NOT NULL DEFAULT 0,
      student_improvement_score REAL NOT NULL DEFAULT 0,
      doubt_support_score REAL NOT NULL DEFAULT 0,
      feedback_score REAL NOT NULL DEFAULT 0,
      complaint_penalty REAL NOT NULL DEFAULT 0,
      final_score REAL NOT NULL DEFAULT 0,
      grade TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
      confidence_score REAL NOT NULL DEFAULT 0,
      data_status TEXT NOT NULL DEFAULT 'PARTIAL',
      calculated_by_user_id TEXT,
      calculated_at TEXT NOT NULL,
      locked_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, teacher_id, period_start, period_end, period_type)
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS teacher_score_components (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      teacher_score_snapshot_id TEXT NOT NULL,
      teacher_id TEXT NOT NULL,
      metric_key TEXT NOT NULL,
      category TEXT NOT NULL,
      raw_value REAL NOT NULL DEFAULT 0,
      raw_display TEXT,
      target_value REAL NOT NULL DEFAULT 0,
      score REAL NOT NULL DEFAULT 0,
      weight REAL NOT NULL DEFAULT 0,
      weighted_score REAL NOT NULL DEFAULT 0,
      source_entity_type TEXT,
      source_entity_ids TEXT NOT NULL DEFAULT '[]',
      calculation_note TEXT,
      evidence_available INTEGER NOT NULL DEFAULT 0,
      minimum_data_met INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (teacher_score_snapshot_id, metric_key)
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS batch_syllabus_progress (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      branch_id TEXT,
      batch_id TEXT,
      course_id TEXT,
      subject_id TEXT,
      teacher_id TEXT NOT NULL,
      topic_id TEXT,
      topic_title TEXT,
      planned_start_date TEXT,
      planned_end_date TEXT,
      actual_completed_date TEXT,
      status TEXT NOT NULL DEFAULT 'NOT_STARTED',
      completion_percentage REAL NOT NULL DEFAULT 0,
      verified_by_user_id TEXT,
      verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS homework_checks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      homework_assignment_id TEXT NOT NULL,
      student_id TEXT,
      teacher_id TEXT NOT NULL,
      checked_status TEXT NOT NULL DEFAULT 'PENDING',
      checked_at TEXT,
      remarks TEXT,
      marks_or_grade TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS teacher_complaints (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      branch_id TEXT,
      teacher_id TEXT NOT NULL,
      student_id TEXT,
      guardian_id TEXT,
      batch_id TEXT,
      subject_id TEXT,
      complaint_type TEXT NOT NULL DEFAULT 'OTHER',
      severity TEXT NOT NULL DEFAULT 'LOW',
      description TEXT NOT NULL,
      source_channel TEXT NOT NULL DEFAULT 'MANUAL',
      status TEXT NOT NULL DEFAULT 'OPEN',
      reported_by_user_id TEXT,
      reviewed_by_user_id TEXT,
      reviewed_at TEXT,
      resolved_by_user_id TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS teacher_feedback_surveys (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      branch_id TEXT,
      teacher_id TEXT NOT NULL,
      batch_id TEXT,
      subject_id TEXT,
      survey_date TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      average_rating REAL NOT NULL DEFAULT 0,
      response_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS teacher_feedback_responses (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      survey_id TEXT NOT NULL,
      teacher_id TEXT NOT NULL,
      student_id TEXT,
      clarity_rating REAL,
      pace_rating REAL,
      doubt_solving_rating REAL,
      discipline_rating REAL,
      homework_rating REAL,
      overall_rating REAL NOT NULL,
      comment TEXT,
      is_anonymous INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS teacher_improvement_plans (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      branch_id TEXT,
      teacher_id TEXT NOT NULL,
      teacher_score_snapshot_id TEXT,
      period_start TEXT,
      period_end TEXT,
      problem_area TEXT NOT NULL,
      goal TEXT NOT NULL,
      action_plan TEXT NOT NULL,
      assigned_by_user_id TEXT,
      assigned_to_user_id TEXT,
      review_date TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS teacher_score_review_notes (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      teacher_score_snapshot_id TEXT NOT NULL,
      teacher_id TEXT NOT NULL,
      note TEXT NOT NULL,
      reviewed_by_user_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await run(
    `CREATE TABLE IF NOT EXISTS teacher_score_alerts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      branch_id TEXT,
      teacher_id TEXT NOT NULL,
      teacher_score_snapshot_id TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'MEDIUM',
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (teacher_score_snapshot_id, alert_type)
    )`
  );

  const lectureColumns = [
    ['tenant_id', 'INTEGER'], ['branch_id', 'TEXT'], ['batch_id', 'TEXT'], ['subject_id', 'TEXT'],
    ['plan_date', 'TEXT'], ['title', 'TEXT'], ['objectives', 'TEXT'], ['teaching_method', 'TEXT'],
    ['resources_required', 'TEXT'], ['created_by_user_id', 'TEXT'], ['completed_at', 'TEXT'],
    ['verified_by_user_id', 'TEXT'], ['verified_at', 'TEXT'],
  ];
  for (const [column, definition] of lectureColumns) await addColumnIfMissing('lecture_plans', column, definition);
  const homeworkColumns = [
    ['tenant_id', 'INTEGER'], ['branch_id', 'TEXT'], ['teacher_id', 'TEXT'], ['batch_id', 'TEXT'],
    ['subject_id', 'TEXT'], ['assigned_date', 'TEXT'], ['due_date', 'TEXT'], ['total_students', 'INTEGER'],
    ['submitted_count', 'INTEGER'], ['checked_count', 'INTEGER'], ['checked_on_time_count', 'INTEGER'],
  ];
  for (const [column, definition] of homeworkColumns) await addColumnIfMissing('homework_assignments', column, definition);
  const doubtColumns = [
    ['tenant_id', 'INTEGER'], ['branch_id', 'TEXT'], ['batch_id', 'TEXT'], ['subject_id', 'TEXT'],
    ['session_date', 'TEXT'], ['start_time', 'TEXT'], ['end_time', 'TEXT'], ['student_count', 'INTEGER'],
    ['resolved_count', 'INTEGER'],
  ];
  for (const [column, definition] of doubtColumns) await addColumnIfMissing('doubt_sessions', column, definition);
  await addColumnIfMissing('student_test_results', 'tenant_id', 'INTEGER');

  await run(`UPDATE lecture_plans SET plan_date = COALESCE(plan_date, date), title = COALESCE(title, topic), tenant_id = COALESCE(tenant_id, (SELECT tenant_id FROM teachers WHERE teachers.id = lecture_plans.teacher_id))`);
  await run(`UPDATE homework_assignments SET assigned_date = COALESCE(assigned_date, date), due_date = COALESCE(due_date, dueDate), total_students = COALESCE(total_students, totalCount), submitted_count = COALESCE(submitted_count, submittedCount), checked_count = COALESCE(checked_count, submittedCount - pendingStudents)`);
  await run(`UPDATE doubt_sessions SET session_date = COALESCE(session_date, date), student_count = COALESCE(student_count, studentsAssigned), tenant_id = COALESCE(tenant_id, (SELECT tenant_id FROM teachers WHERE teachers.id = doubt_sessions.teacher_id))`);
  await run(`UPDATE student_test_results SET tenant_id = COALESCE(tenant_id, (SELECT tenant_id FROM students WHERE students.id = student_test_results.student_id))`);

  const tenants = await all(`SELECT id FROM tenants`);
  for (const tenant of tenants) {
    await run(
      `INSERT INTO teacher_score_configs (id, tenant_id)
       SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM teacher_score_configs WHERE tenant_id = ?)`,
      [`teacher_score_config_${tenant.id}`, String(tenant.id), String(tenant.id)]
    );
  }
  await run(`CREATE INDEX IF NOT EXISTS idx_teacher_score_snapshots_teacher ON teacher_score_snapshots (tenant_id, teacher_id, period_end)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_teacher_score_components_snapshot ON teacher_score_components (tenant_id, teacher_score_snapshot_id, category)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_teacher_complaints_period ON teacher_complaints (tenant_id, teacher_id, created_at, status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_teacher_feedback_period ON teacher_feedback_surveys (tenant_id, teacher_id, period_start, period_end)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_teacher_improvement_plans ON teacher_improvement_plans (tenant_id, teacher_id, status, review_date)`);
}

function cryptoHash(value) {
  return require('crypto').createHash('sha1').update(String(value)).digest('hex').slice(0, 16);
}

async function migrateExpenseColumns() {
  await addColumnIfMissing('expenses', 'paymentDate', 'TEXT');
  await addColumnIfMissing('expenses', 'transactionId', 'TEXT');
  await addColumnIfMissing('expenses', 'deductionAmount', 'REAL DEFAULT 0');
  await addColumnIfMissing('expenses', 'bonusAmount', 'REAL DEFAULT 0');
  await addColumnIfMissing('expenses', 'netPaid', 'REAL DEFAULT 0');
}

async function migrateAttendanceColumns() {
  await addColumnIfMissing('attendance_records', 'markedBy', 'TEXT');
  await addColumnIfMissing('attendance_records', 'markedAt', 'TEXT');
}

async function migrateFollowUpColumns() {
  await addColumnIfMissing('follow_up_tasks', 'completionOutcome', 'TEXT');
  await addColumnIfMissing('follow_up_tasks', 'lastEscalatedAt', 'TEXT');
  await addColumnIfMissing('follow_up_tasks', 'escalationCount', 'INTEGER DEFAULT 0');
}

async function migrateAuthColumns() {
  await addColumnIfMissing('users', 'name', 'TEXT');
  await addColumnIfMissing('users', 'email', 'TEXT');
  await addColumnIfMissing('users', 'password_hash', 'TEXT');
  await addColumnIfMissing('users', 'email_verified_at', 'TEXT');
  await addColumnIfMissing('users', 'password_changed_at', 'TEXT');
  await addColumnIfMissing('users', 'last_login_at', 'TEXT');
  await addColumnIfMissing('users', 'is_active', 'INTEGER DEFAULT 1');
  await addColumnIfMissing('users', 'created_by', 'TEXT');
  await addColumnIfMissing('users', 'created_at', 'TEXT');
  await addColumnIfMissing('users', 'updated_at', 'TEXT');
  await addColumnIfMissing('users', 'deleted_at', 'TEXT');

  for (const table of ['email_verification_tokens', 'password_reset_tokens', 'user_invites']) {
    await addColumnIfMissing(table, 'delivery_status', "TEXT DEFAULT 'pending'");
    await addColumnIfMissing(table, 'delivery_attempt_count', 'INTEGER DEFAULT 0');
    await addColumnIfMissing(table, 'delivery_last_attempt_at', 'TEXT');
    await addColumnIfMissing(table, 'delivery_sent_at', 'TEXT');
    await addColumnIfMissing(table, 'delivery_provider_message_id', 'TEXT');
    await addColumnIfMissing(table, 'delivery_last_error_code', 'TEXT');
  }
  await addColumnIfMissing('email_outbox', 'owner_recovery_request_id', 'TEXT');
  await run(`UPDATE users SET role = 'owner' WHERE LOWER(role) = 'owner' AND role != 'owner'`);
  const duplicateOwners = await all(
    `SELECT tenant_id, COUNT(*) AS owner_count
     FROM users
     WHERE role = 'owner'
       AND deleted_at IS NULL
     GROUP BY tenant_id
     HAVING COUNT(*) > 1`
  );
  if (duplicateOwners.length > 0) {
    const tenantIds = duplicateOwners.map((row) => row.tenant_id).join(', ');
    throw new Error(`Owner invariant migration blocked: multiple non-deleted owners exist for tenant IDs ${tenantIds}. Resolve owner transfer records before restarting.`);
  }
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_single_owner_per_tenant ON users (tenant_id) WHERE role = 'owner' AND deleted_at IS NULL`);
  await run(`CREATE INDEX IF NOT EXISTS idx_owner_recovery_token ON tenant_owner_recovery_requests (token_hash)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_owner_recovery_tenant ON tenant_owner_recovery_requests (tenant_id, accepted_at, revoked_at)`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_recovery_one_pending_per_tenant ON tenant_owner_recovery_requests (tenant_id) WHERE accepted_at IS NULL AND revoked_at IS NULL`);

  for (const table of ['email_verification_tokens', 'password_reset_tokens']) {
    await addColumnIfMissing(table, 'revoked_at', 'TEXT');
    await addColumnIfMissing(table, 'revoke_reason', 'TEXT');
    await addColumnIfMissing(table, 'revocation_reason', 'TEXT');
  }

  await addColumnIfMissing('email_verification_tokens', 'superseded_at', 'TEXT');
  await addColumnIfMissing('email_verification_tokens', 'superseded_by_token_id', 'TEXT');

  await run(
    `UPDATE email_verification_tokens
     SET revocation_reason = COALESCE(revocation_reason, revoke_reason)
     WHERE revocation_reason IS NULL
       AND revoke_reason IS NOT NULL`
  );

  await run(
    `UPDATE password_reset_tokens
     SET revocation_reason = COALESCE(revocation_reason, revoke_reason)
     WHERE revocation_reason IS NULL
       AND revoke_reason IS NOT NULL`
  );

  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_verification_tokens_hash ON email_verification_tokens (token_hash)`);
  await run(
    `CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_active
     ON email_verification_tokens (user_id, used_at, superseded_at, revoked_at, expires_at)`
  );
  await run(
    `CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_created
     ON email_verification_tokens (user_id, tenant_id, created_at)`
  );
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens (token_hash)`);
  await run(
    `CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_active
     ON password_reset_tokens (user_id, used_at, revoked_at, expires_at)`
  );

  await run(
    `CREATE INDEX IF NOT EXISTS idx_email_outbox_user_type
     ON email_outbox (user_id, type, status, created_at)`
  );
  await run(
    `CREATE INDEX IF NOT EXISTS idx_email_outbox_verification_token_active
     ON email_outbox (token_id, status)
     WHERE token_id IS NOT NULL
       AND type IN ('owner_email_verification', 'user_email_verification')
       AND status IN ('pending', 'retry', 'processing')`
  );

  await run(`UPDATE users SET email = COALESCE(email, username) WHERE email IS NULL`);
  await run(`UPDATE users SET name = COALESCE(name, username) WHERE name IS NULL`);
  await run(`UPDATE users SET password_hash = COALESCE(password_hash, password) WHERE password_hash IS NULL`);
  await run(`UPDATE users SET is_active = 1 WHERE is_active IS NULL`);
  await run(`UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE email_verified_at IS NULL AND password IS NOT NULL AND created_at IS NULL`);
  await run(`UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL`);
  await run(`UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL`);
}

function pickAdmissionValue(data, keys, fallback = null) {
  for (const key of keys) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
      return data[key];
    }
  }
  return fallback;
}

async function migrateAdmissionRealColumns() {
  const columns = [
    ['studentName', 'TEXT'],
    ['parentName', 'TEXT'],
    ['parentPhone', 'TEXT'],
    ['className', 'TEXT'],
    ['school', 'TEXT'],
    ['courseInterested', 'TEXT'],
    ['targetExam', 'TEXT'],
    ['branchId', 'TEXT'],
    ['subSource', 'TEXT'],
    ['campaign', 'TEXT'],
    ['counsellorId', 'TEXT'],
    ['counsellor_id', 'TEXT'],
    ['leadTemperature', "TEXT DEFAULT 'WARM'"],
    ['nextFollowUpAt', 'TEXT'],
    ['lastContactedAt', 'TEXT'],
    ['demoDate', 'TEXT'],
    ['demoTeacherId', 'TEXT'],
    ['estimatedRevenue', 'INTEGER DEFAULT 0'],
    ['convertedStudentId', 'TEXT'],
    ['convertedAt', 'TEXT'],
    ['lostReason', 'TEXT'],
    ['parentPhoneNormalized', 'TEXT'],
    ['parent_phone_normalized', 'TEXT'],
    ['customFields', 'TEXT'],
    ['created_by', 'TEXT'],
    ['created_at', 'TEXT'],
    ['updated_at', 'TEXT'],
    ['deleted_at', 'TEXT'],
  ];

  for (const [column, definition] of columns) {
    await addColumnIfMissing('admissions', column, definition);
  }

  await run(`UPDATE admissions SET created_at = COALESCE(created_at, CAST(CURRENT_TIMESTAMP AS TEXT)) WHERE created_at IS NULL`);
  await run(`UPDATE admissions SET updated_at = COALESCE(updated_at, CAST(CURRENT_TIMESTAMP AS TEXT)) WHERE updated_at IS NULL`);
  await run(`UPDATE admissions SET status = COALESCE(status, 'NEW') WHERE status IS NULL`);
  await run(`UPDATE admissions SET leadTemperature = COALESCE(leadTemperature, 'WARM') WHERE leadTemperature IS NULL`);
  await run(`UPDATE admissions SET estimatedRevenue = COALESCE(estimatedRevenue, 0) WHERE estimatedRevenue IS NULL`);
  await run(`UPDATE admissions SET counsellor_id = COALESCE(counsellor_id, counsellorId) WHERE counsellor_id IS NULL`);

  const rows = await all(
    `SELECT id, name, program, status, source, data, parentPhone, parentPhoneNormalized
     FROM admissions
     WHERE deleted_at IS NULL`
  );

  for (const row of rows) {
    const data = safeJsonParse(row.data);
    const values = {
      studentName: pickAdmissionValue(data, ['studentName', 'student_name', 'name'], row.name),
      parentName: pickAdmissionValue(data, ['parentName', 'parent_name', 'guardianName']),
      parentPhone: pickAdmissionValue(data, ['parentPhone', 'parent_phone', 'mobile', 'phone']),
      className: pickAdmissionValue(data, ['className', 'class_name', 'class']),
      school: pickAdmissionValue(data, ['school', 'schoolName']),
      courseInterested: pickAdmissionValue(data, ['courseInterested', 'course_interested', 'course'], row.program),
      targetExam: pickAdmissionValue(data, ['targetExam', 'target_exam', 'exam']),
      branchId: pickAdmissionValue(data, ['branchId', 'branch_id', 'branch']),
      source: pickAdmissionValue(data, ['source'], row.source),
      subSource: pickAdmissionValue(data, ['subSource', 'sub_source']),
      campaign: pickAdmissionValue(data, ['campaign']),
      counsellorId: pickAdmissionValue(data, ['counsellorId', 'counsellor_id', 'counsellor']),
      status: normalizeStatus(pickAdmissionValue(data, ['status'], row.status)),
      leadTemperature: normalizeTemperature(pickAdmissionValue(data, ['leadTemperature', 'lead_temperature'])),
      nextFollowUpAt: pickAdmissionValue(data, ['nextFollowUpAt', 'next_follow_up_at', 'nextFollowUpDate']),
      lastContactedAt: pickAdmissionValue(data, ['lastContactedAt', 'last_contacted_at']),
      demoDate: pickAdmissionValue(data, ['demoDate', 'demo_date']),
      demoTeacherId: pickAdmissionValue(data, ['demoTeacherId', 'demo_teacher_id', 'demoTeacher']),
      estimatedRevenue: Number(pickAdmissionValue(data, ['estimatedRevenue', 'estimated_revenue'], 0)) || 0,
      convertedStudentId: pickAdmissionValue(data, ['convertedStudentId', 'converted_student_id']),
      convertedAt: pickAdmissionValue(data, ['convertedAt', 'converted_at', 'convertedDate']),
      lostReason: pickAdmissionValue(data, ['lostReason', 'lost_reason']),
    };
    values.parentPhoneNormalized = normalizeIndianPhone(values.parentPhone || row.parentPhone);

    await run(
      `UPDATE admissions
       SET
         studentName = COALESCE(studentName, ?),
         parentName = COALESCE(parentName, ?),
         parentPhone = COALESCE(parentPhone, ?),
         className = COALESCE(className, ?),
         school = COALESCE(school, ?),
         courseInterested = COALESCE(courseInterested, ?),
         targetExam = COALESCE(targetExam, ?),
         branchId = COALESCE(branchId, ?),
         source = COALESCE(source, ?),
         subSource = COALESCE(subSource, ?),
         campaign = COALESCE(campaign, ?),
         counsellorId = COALESCE(counsellorId, ?),
         status = COALESCE(status, ?),
         leadTemperature = COALESCE(leadTemperature, ?),
         nextFollowUpAt = COALESCE(nextFollowUpAt, ?),
         lastContactedAt = COALESCE(lastContactedAt, ?),
         demoDate = COALESCE(demoDate, ?),
         demoTeacherId = COALESCE(demoTeacherId, ?),
         estimatedRevenue = COALESCE(estimatedRevenue, ?),
         convertedStudentId = COALESCE(convertedStudentId, ?),
         convertedAt = COALESCE(convertedAt, ?),
         lostReason = COALESCE(lostReason, ?),
         parentPhoneNormalized = COALESCE(parentPhoneNormalized, ?),
         parent_phone_normalized = COALESCE(parent_phone_normalized, ?),
         counsellor_id = COALESCE(counsellor_id, counsellorId)
       WHERE id = ?`,
      [
        values.studentName,
        values.parentName,
        values.parentPhone,
        values.className,
        values.school,
        values.courseInterested,
        values.targetExam,
        values.branchId,
        values.source,
        values.subSource,
        values.campaign,
        values.counsellorId,
        values.status,
        values.leadTemperature,
        values.nextFollowUpAt,
        values.lastContactedAt,
        values.demoDate,
        values.demoTeacherId,
        values.estimatedRevenue,
        values.convertedStudentId,
        values.convertedAt,
        values.lostReason,
        values.parentPhoneNormalized,
        values.parentPhoneNormalized,
        row.id,
      ]
    );
  }

  await run(`UPDATE admissions SET parentPhoneNormalized = parent_phone_normalized WHERE parentPhoneNormalized IS NULL AND parent_phone_normalized IS NOT NULL`);
  await run(`UPDATE admissions SET parent_phone_normalized = parentPhoneNormalized WHERE parent_phone_normalized IS NULL AND parentPhoneNormalized IS NOT NULL`);
  await run(`CREATE INDEX IF NOT EXISTS idx_admissions_tenant_status ON admissions (tenant_id, status, deleted_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_admissions_tenant_branch ON admissions (tenant_id, branchId, deleted_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_admissions_tenant_counsellor ON admissions (tenant_id, counsellorId, deleted_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_admissions_counsellor_id ON admissions (counsellor_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_admissions_tenant_counsellor_id ON admissions (tenant_id, counsellor_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_admissions_parent_phone_normalized ON admissions (tenant_id, parentPhoneNormalized)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_admissions_student_phone ON admissions (tenant_id, studentName, parentPhoneNormalized)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_admissions_source ON admissions (tenant_id, source)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_admissions_campaign ON admissions (tenant_id, campaign)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_admissions_converted_at ON admissions (tenant_id, convertedAt)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_admissions_tenant_followup ON admissions (tenant_id, nextFollowUpAt, deleted_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_admissions_tenant_temperature ON admissions (tenant_id, leadTemperature, deleted_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_admissions_tenant_created ON admissions (tenant_id, created_at, deleted_at)`);
}

async function migrateMarketingCampaigns() {
  const integerType = isPostgres ? 'INTEGER' : 'INTEGER';
  const timestampDefault = isPostgres ? 'DEFAULT CAST(CURRENT_TIMESTAMP AS TEXT)' : 'DEFAULT CURRENT_TIMESTAMP';

  await run(
    `CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id TEXT PRIMARY KEY,
      tenant_id ${integerType} NOT NULL,
      branch_id TEXT,
      name TEXT NOT NULL,
      source TEXT NOT NULL,
      spend_amount INTEGER NOT NULL DEFAULT 0,
      start_date TEXT,
      end_date TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL ${timestampDefault},
      updated_at TEXT NOT NULL ${timestampDefault}
    )`
  );

  await run(`CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_tenant_source ON marketing_campaigns (tenant_id, source)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_tenant_name ON marketing_campaigns (tenant_id, name)`);
}

async function migrateLeadActivities() {
  const integerType = isPostgres ? 'INTEGER' : 'INTEGER';
  const timestampDefault = isPostgres ? 'DEFAULT CAST(CURRENT_TIMESTAMP AS TEXT)' : 'DEFAULT CURRENT_TIMESTAMP';

  await run(
    `CREATE TABLE IF NOT EXISTS lead_activities (
      id TEXT PRIMARY KEY,
      tenant_id ${integerType} NOT NULL,
      lead_id ${integerType} NOT NULL,
      branch_id TEXT,
      created_by_user_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      note TEXT,
      old_status TEXT,
      new_status TEXT,
      activity_at TEXT NOT NULL ${timestampDefault},
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL ${timestampDefault},
      FOREIGN KEY (lead_id) REFERENCES admissions(id) ON DELETE CASCADE
    )`
  );

  await run(`CREATE INDEX IF NOT EXISTS idx_lead_activities_tenant_lead ON lead_activities (tenant_id, lead_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_lead_activities_activity_at ON lead_activities (activity_at DESC)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_lead_activities_type ON lead_activities (type)`);
}

async function migrateTenantOnboarding() {
  const integerType = isPostgres ? 'INTEGER' : 'INTEGER';

  await addColumnIfMissing('tenants', 'plan', "TEXT DEFAULT 'trial'");
  await addColumnIfMissing('tenants', 'contact_email', 'TEXT');
  await addColumnIfMissing('tenants', 'contact_phone', 'TEXT');
  await addColumnIfMissing('tenants', 'created_by', 'TEXT');
  await addColumnIfMissing('tenants', 'created_at', 'TEXT');
  await addColumnIfMissing('tenants', 'updated_at', 'TEXT');
  await addColumnIfMissing('tenants', 'deleted_at', 'TEXT');

  await addColumnIfMissing('fee_plans', 'name', 'TEXT');
  await addColumnIfMissing('fee_plans', 'course_type', 'TEXT');
  await addColumnIfMissing('fee_plans', 'amount', 'INTEGER');
  await addColumnIfMissing('fee_plans', 'billing_cycle', 'TEXT');
  await addColumnIfMissing('fee_plans', 'duration_months', 'INTEGER');
  await addColumnIfMissing('fee_plans', 'is_default', 'INTEGER DEFAULT 0');
  await addColumnIfMissing('fee_plans', 'created_by', 'TEXT');
  await addColumnIfMissing('fee_plans', 'created_at', 'TEXT');
  await addColumnIfMissing('fee_plans', 'updated_at', 'TEXT');
  await addColumnIfMissing('fee_plans', 'deleted_at', 'TEXT');

  await addColumnIfMissing('message_templates', 'tenant_id', 'INTEGER');
  await addColumnIfMissing('message_templates', 'name', 'TEXT');
  await addColumnIfMissing('message_templates', 'category', 'TEXT');
  await addColumnIfMissing('message_templates', 'is_default', 'INTEGER DEFAULT 0');
  await addColumnIfMissing('message_templates', 'created_by', 'TEXT');
  await addColumnIfMissing('message_templates', 'deleted_at', 'TEXT');

  await run(
    `CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      tenant_id ${integerType} NOT NULL,
      name TEXT NOT NULL,
      code TEXT,
      city TEXT,
      address TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT NOT NULL,
      deleted_at TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS tenant_roles (
      id TEXT PRIMARY KEY,
      tenant_id ${integerType} NOT NULL,
      role_key TEXT NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      is_system INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT NOT NULL,
      deleted_at TEXT,
      UNIQUE (tenant_id, role_key)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS dashboard_sample_metrics (
      id TEXT PRIMARY KEY,
      tenant_id ${integerType} NOT NULL,
      metric_key TEXT NOT NULL,
      metric_label TEXT NOT NULL,
      metric_value INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT NOT NULL,
      deleted_at TEXT,
      UNIQUE (tenant_id, metric_key)
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS tenant_onboarding_checklist (
      id TEXT PRIMARY KEY,
      tenant_id ${integerType} NOT NULL,
      checklist_key TEXT NOT NULL,
      label TEXT NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT NOT NULL,
      deleted_at TEXT,
      UNIQUE (tenant_id, checklist_key)
    )`
  );

  await run(`UPDATE tenants SET plan = COALESCE(plan, subscriptionPlan, 'trial') WHERE plan IS NULL`);
  await run(`UPDATE tenants SET contact_email = COALESCE(contact_email, billingEmail, '') WHERE contact_email IS NULL`);
  await run(`UPDATE tenants SET created_at = COALESCE(created_at, CAST(createdAt AS TEXT), CAST(CURRENT_TIMESTAMP AS TEXT)) WHERE created_at IS NULL`);
  await run(`UPDATE tenants SET updated_at = COALESCE(updated_at, CAST(updatedAt AS TEXT), CAST(CURRENT_TIMESTAMP AS TEXT)) WHERE updated_at IS NULL`);

  await run(`CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants (slug)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches (tenant_id, deleted_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_tenant_roles_tenant ON tenant_roles (tenant_id, deleted_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_fee_plans_tenant ON fee_plans (tenant_id, deleted_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_message_templates_tenant ON message_templates (tenant_id, deleted_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_dashboard_sample_metrics_tenant ON dashboard_sample_metrics (tenant_id, deleted_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_tenant_onboarding_checklist_tenant ON tenant_onboarding_checklist (tenant_id, deleted_at)`);
}

async function migrateSuperAdmin() {
  const tenantIdType = isPostgres ? 'INTEGER' : 'INTEGER';

  await run(
    `CREATE TABLE IF NOT EXISTS platform_admins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'super_admin',
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS tenant_subscriptions (
      id TEXT PRIMARY KEY,
      tenant_id ${tenantIdType} NOT NULL,
      plan TEXT NOT NULL DEFAULT 'trial',
      status TEXT NOT NULL DEFAULT 'trialing',
      monthly_amount INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'INR',
      trial_started_at TEXT,
      trial_ends_at TEXT,
      current_period_start TEXT,
      current_period_end TEXT,
      canceled_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS tenant_payments (
      id TEXT PRIMARY KEY,
      tenant_id ${tenantIdType} NOT NULL,
      subscription_id TEXT,
      provider TEXT NOT NULL DEFAULT 'razorpay',
      provider_payment_id TEXT,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL,
      paid_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    )`
  );

  const defaultTenant = await get(`SELECT * FROM tenants WHERE slug = ?`, ['miraku']);
  if (defaultTenant?.id) {
    const existingDefaultSubscription = await get(
      `SELECT id
       FROM tenant_subscriptions
       WHERE tenant_id = ?
       AND deleted_at IS NULL`,
      [defaultTenant.id]
    );

    if (!existingDefaultSubscription) {
      const now = new Date().toISOString();
      await run(
        `INSERT INTO tenant_subscriptions
          (id, tenant_id, plan, status, monthly_amount, currency, trial_started_at, trial_ends_at, current_period_start, current_period_end, created_at, updated_at, deleted_at)
         VALUES (?, ?, 'local', 'active', 0, 'INR', ?, NULL, ?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
        [`sub_${Date.now()}_${Math.random().toString(16).slice(2)}`, defaultTenant.id, now, now]
      );
    }
  }

  await run(
    `CREATE TABLE IF NOT EXISTS tenant_usage_records (
      id TEXT PRIMARY KEY,
      tenant_id ${tenantIdType} NOT NULL,
      metric_key TEXT NOT NULL,
      metric_value INTEGER NOT NULL DEFAULT 0,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS support_access_sessions (
      id TEXT PRIMARY KEY,
      platform_admin_id TEXT NOT NULL,
      tenant_id ${tenantIdType} NOT NULL,
      reason TEXT NOT NULL,
      access_type TEXT NOT NULL DEFAULT 'read_only',
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS platform_audit_logs (
      id TEXT PRIMARY KEY,
      platform_admin_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      metadata TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await run(`CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants (status, deleted_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_status ON tenant_subscriptions (status, deleted_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant ON tenant_subscriptions (tenant_id, deleted_at)`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_subscriptions_one_current ON tenant_subscriptions (tenant_id) WHERE deleted_at IS NULL`);
  await run(`CREATE INDEX IF NOT EXISTS idx_tenant_payments_tenant ON tenant_payments (tenant_id, deleted_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_tenant_usage_records_tenant_period ON tenant_usage_records (tenant_id, period_start, period_end)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_support_access_sessions_tenant ON support_access_sessions (tenant_id, revoked_at, expires_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_admin ON platform_audit_logs (platform_admin_id, created_at)`);
}

async function ensureDefaultTenant() {
  const now = new Date().toISOString();
  let tenant = await get(`SELECT * FROM tenants WHERE slug = ?`, ['miraku']);
  if (!tenant) {
    const result = await run(
      `INSERT INTO tenants (name, slug, subscriptionPlan, subscriptionStatus, billingEmail, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['Miraku Education Foundation', 'miraku', 'local', 'active', process.env.ADMIN_EMAIL || '', 'Active', now, now]
    );
    tenant = await get(`SELECT * FROM tenants WHERE id = ?`, [result.lastID]);
  }
  return tenant;
}

async function ensureDefaultTenantSubscription(tenant) {
  if (!tenant?.id) return;

  const existingDefaultSubscription = await get(
    `SELECT id
     FROM tenant_subscriptions
     WHERE tenant_id = ?
     AND deleted_at IS NULL`,
    [tenant.id]
  );

  if (existingDefaultSubscription) return;

  const now = new Date().toISOString();
  await run(
    `INSERT INTO tenant_subscriptions
      (id, tenant_id, plan, status, monthly_amount, currency, trial_started_at, trial_ends_at, current_period_start, current_period_end, created_at, updated_at, deleted_at)
     VALUES (?, ?, 'local', 'active', 0, 'INR', ?, NULL, ?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
    [`sub_${Date.now()}_${Math.random().toString(16).slice(2)}`, tenant.id, now, now]
  );
}

async function migrateTenantColumns() {
  await addColumnIfMissing('users', 'tenant_id', 'INTEGER');
  const tenant = await ensureDefaultTenant();
  await ensureDefaultTenantSubscription(tenant);
  if (tenant?.id) {
    await run(`UPDATE users SET tenant_id = ? WHERE tenant_id IS NULL`, [tenant.id]);
  }
}

async function migrateOperationalTenantColumns() {
  const tenant = await ensureDefaultTenant();
  const tables = [
    'teachers',
    'students',
    'admissions',
    'fee_plans',
    'fee_payments',
    'vendors',
    'expenses',
    'petty_cash_entries',
    'recurring_expense_templates',
  ];
  for (const table of tables) {
    await addColumnIfMissing(table, 'tenant_id', 'INTEGER');
    if (tenant?.id) {
      await run(`UPDATE ${table} SET tenant_id = ? WHERE tenant_id IS NULL`, [tenant.id]);
    }
  }
}

const tenantMetadataTables = [
  // Academic
  'academic_syllabus',
  'academic_calendars',
  'batch_timetables',
  'lecture_plans',
  'class_delivery_logs',
  'homework_assignments',
  'test_calendars',
  'student_test_results',
  'doubt_sessions',
  'revision_plans',
  'remedial_actions',

  // Attendance and communication
  'attendance_sessions',
  'attendance_records',
  'parent_alert_logs',
  'parent_call_logs',
  'automation_logs',
  'staff_attendance_records',
  'leave_requests',
  'attendance_correction_requests',
  'message_templates',
  'fee_reminders',
  'fee_audit_logs',

  // Test performance
  'performance_tests',
  'performance_results',
  'question_analysis',
  'parent_report_logs',
  'teacher_result_impact',
  'remedial_students',
  'omr_uploads',

  // AI lab
  'ai_lab_courses',
  'ai_lab_modules',
  'ai_lab_students',
  'ai_lab_attendance',
  'ai_lab_devices',
  'ai_lab_device_allocations',
  'ai_lab_projects',
  'ai_lab_assignments',
  'ai_lab_mentor_feedback',
  'ai_lab_portfolios',
  'ai_lab_certificates',
];

async function migrateBusinessTenantMetadataColumns() {
  const tenant = await ensureDefaultTenant();
  const tenantId = tenant?.id || null;
  const systemUserId = process.env.SYSTEM_USER_ID || 'system';
  const now = new Date().toISOString();

  for (const table of tenantMetadataTables) {
    await addColumnIfMissing(table, 'tenant_id', 'INTEGER');
    await addColumnIfMissing(table, 'createdBy', 'TEXT');
    await addColumnIfMissing(table, 'deletedAt', 'TEXT');
    await addColumnIfMissing(table, 'updatedAt', 'TEXT');
    await addColumnIfMissing(table, 'createdAt', 'TEXT');

    if (tenantId) {
      await run(
        `UPDATE ${table}
         SET
           tenant_id = COALESCE(tenant_id, ?),
           createdBy = COALESCE(createdBy, ?),
           createdAt = COALESCE(createdAt, ?),
           updatedAt = COALESCE(updatedAt, ?)
         WHERE tenant_id IS NULL
            OR createdBy IS NULL
            OR createdAt IS NULL
            OR updatedAt IS NULL`,
        [tenantId, systemUserId, now, now]
      );
    }
  }
}

async function migrateTenantIndexes() {
  const indexSpecs = [
    ['attendance_sessions', 'tenant_id, deletedAt, date'],
    ['attendance_records', 'tenant_id, session_id'],
    ['parent_alert_logs', 'tenant_id, createdAt'],
    ['parent_call_logs', 'tenant_id, createdAt'],
    ['automation_logs', 'tenant_id, createdAt'],
    ['message_templates', 'tenant_id, deletedAt'],
    ['academic_syllabus', 'tenant_id, deletedAt'],
    ['academic_calendars', 'tenant_id, deletedAt'],
    ['batch_timetables', 'tenant_id, deletedAt'],
    ['lecture_plans', 'tenant_id, deletedAt'],
    ['homework_assignments', 'tenant_id, deletedAt'],
    ['test_calendars', 'tenant_id, deletedAt'],
    ['student_test_results', 'tenant_id, student_id'],
    ['performance_tests', 'tenant_id, deletedAt'],
    ['performance_results', 'tenant_id, student_id'],
    ['question_analysis', 'tenant_id, test_id'],
    ['parent_report_logs', 'tenant_id, sentAt'],
    ['omr_uploads', 'tenant_id, uploadedAt'],
    ['ai_lab_courses', 'tenant_id, deletedAt'],
    ['ai_lab_students', 'tenant_id, student_id'],
    ['ai_lab_attendance', 'tenant_id, ai_lab_student_id'],
    ['ai_lab_projects', 'tenant_id, ai_lab_student_id'],
    ['ai_lab_assignments', 'tenant_id, ai_lab_student_id'],
    ['ai_lab_mentor_feedback', 'tenant_id, ai_lab_student_id'],
    ['ai_lab_certificates', 'tenant_id, ai_lab_student_id'],
  ];

  for (const [table, columns] of indexSpecs) {
    const indexName = `idx_${table}_tenant_${columns.split(',')[0].replace(/[^a-zA-Z0-9_]/g, '')}`;
    await run(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table} (${columns})`);
  }

  await run(`CREATE INDEX IF NOT EXISTS idx_users_tenant_email ON users (tenant_id, email)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions (user_id, tenant_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh_hash ON user_sessions (refresh_token_hash)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens (token_hash)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_hash ON email_verification_tokens (token_hash)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_user_invites_token ON user_invites (token_hash)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_user_invites_tenant_email ON user_invites (tenant_id, email)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_email_outbox_status_retry ON email_outbox (status, next_attempt_at, locked_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_email_outbox_token ON email_outbox (token_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_email_outbox_invite ON email_outbox (invite_id)`);
}

async function seedAdmin() {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminUsername || !adminPassword) return;

  const tenant = await ensureDefaultTenant();
  const admin = await get(`SELECT * FROM users WHERE username = ?`, [adminUsername]);
  if (!admin) {
    const hashed = await bcrypt.hash(adminPassword, 10);
    await run(`INSERT INTO users (username, password, role, tenant_id) VALUES (?, ?, ?, ?)`, [adminUsername, hashed, 'admin', tenant?.id || null]);
  } else if (!admin.tenant_id && tenant?.id) {
    await run(`UPDATE users SET tenant_id = ? WHERE id = ?`, [tenant.id, admin.id]);
  }
}

async function ensureEntity(name, displayName, description, attributes, now) {
  const existing = await get(`SELECT * FROM ontology_entities WHERE name = ?`, [name]);
  let entityId;
  if (!existing) {
    const res = await run(
      `INSERT INTO ontology_entities (name, displayName, description, metadata, createdAt) VALUES (?, ?, ?, ?, ?)`,
      [name, displayName, description, null, now]
    );
    entityId = res.lastID;
  } else {
    entityId = existing.id;
  }

  for (const attr of attributes) {
    const existsAttr = await get(`SELECT * FROM ontology_attributes WHERE entity_id = ? AND name = ?`, [entityId, attr.name]);
    if (!existsAttr) {
      await run(
        `INSERT INTO ontology_attributes (entity_id, name, label, type, required, options, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [entityId, attr.name, attr.label || attr.name, attr.type || 'string', attr.required ? 1 : 0, attr.options ? JSON.stringify(attr.options) : null, null, now]
      );
    }
  }
}

async function seedOntology() {
  const now = new Date().toISOString();

  await ensureEntity('teacher', 'Teacher', 'Teaching staff profile', [
    { name: 'name', label: 'Name', type: 'string', required: true },
    { name: 'subject', label: 'Subject', type: 'string' },
    { name: 'month', label: 'Month', type: 'string' },
    { name: 'data', label: 'Data', type: 'json' },
    { name: 'updatedAt', label: 'Updated At', type: 'datetime' },
  ], now);

  await ensureEntity('student', 'Student', 'Student profile', [
    { name: 'name', label: 'Name', type: 'string', required: true },
    { name: 'grade', label: 'Grade', type: 'string' },
    { name: 'batch', label: 'Batch', type: 'string' },
    { name: 'attendance', label: 'Attendance', type: 'string' },
    { name: 'data', label: 'Data', type: 'json' },
  ], now);

  await ensureEntity('admission', 'Admission', 'Admissions lead', [
    { name: 'name', label: 'Name', type: 'string', required: true },
    { name: 'program', label: 'Program', type: 'string' },
    { name: 'status', label: 'Status', type: 'string' },
    { name: 'source', label: 'Source', type: 'string' },
    { name: 'data', label: 'Data', type: 'json' },
  ], now);
}

async function ensureMessageTemplate(templateKey, displayName, body, variables, now) {
  const existing = await get(`SELECT * FROM message_templates WHERE templateKey = ?`, [templateKey]);
  if (existing) return;
  await run(
    `INSERT INTO message_templates (templateKey, displayName, channel, body, variables, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [templateKey, displayName, 'WhatsApp', body, JSON.stringify(variables || []), 'Active', now, now]
  );
}

async function seedMessageTemplates() {
  const now = new Date().toISOString();
  await ensureMessageTemplate(
    'fee_due_reminder',
    'Fee Due Reminder',
    'Dear Parent,\nThis is a reminder that {{amount}} fee installment for {{studentName}} is due on {{dueDate}}.\nKindly pay before the due date.\nProTrack Kaizen, Miraku Education Foundation.',
    ['studentName', 'amount', 'dueDate', 'course', 'installmentLabel'],
    now
  );
  await ensureMessageTemplate(
    'fee_overdue_reminder',
    'Fee Overdue Reminder',
    'Dear Parent,\nThe fee installment of {{amount}} for {{studentName}} was due on {{dueDate}} and is still pending.\nPlease clear it at the earliest or contact the office.\nProTrack Kaizen, Miraku Education Foundation.',
    ['studentName', 'amount', 'dueDate', 'course', 'installmentLabel'],
    now
  );
  await ensureMessageTemplate(
    'payment_receipt',
    'Payment Receipt Message',
    'Dear Parent,\nWe received {{amount}} for {{studentName}} on {{paymentDate}}. Receipt No: {{receiptNumber}}.\nThank you.\nProTrack Kaizen, Miraku Education Foundation.',
    ['studentName', 'amount', 'paymentDate', 'receiptNumber', 'course'],
    now
  );
  await ensureMessageTemplate(
    'attendance_absent',
    'Attendance Absent Alert',
    'Dear Parent,\nYour child {{studentName}} was absent for {{subject}} lecture of {{batch}} batch on {{date}}.\nPlease contact the office if there is any reason.\nProTrack Kaizen.',
    ['studentName', 'subject', 'batch', 'date'],
    now
  );
  await ensureMessageTemplate(
    'test_result_parent',
    'Test Result Parent Message',
    'Dear Parent,\n{{studentName}} scored {{marksObtained}}/{{totalMarks}} in {{testName}}. Required action: {{requiredAction}}.\nProTrack Kaizen.',
    ['studentName', 'marksObtained', 'totalMarks', 'testName', 'requiredAction'],
    now
  );
}

async function migrate() {
  await createTables();
  await migrateFeeColumns();
  await migrateExpenseColumns();
  await migrateAttendanceColumns();
  await migrateFollowUpColumns();
  await migrateAdmissionRealColumns();
  await migrateMarketingCampaigns();
  await migrateLeadActivities();
  await migrateAuthColumns();
  await migrateTenantOnboarding();
  await migrateAcademicMasterData();
  await migrateStudentProfiles();
  await migrateAttendanceOperations();
  await migrateWhatsAppOfficialTemplates();
  await migrateParentCommunicationCenter();
  await migrateTeacherScore();
  await migrateFeeStructureTemplates();
  await migrateFeeFlowHardening();
  await migrateSuperAdmin();
  await migrateTenantColumns();
  await migrateOperationalTenantColumns();
  await migrateBusinessTenantMetadataColumns();
  await migrateTenantIndexes();
  await seedAdmin();
  await seedOntology();
  await seedMessageTemplates();
}

async function close() {
  if (pgPool) await pgPool.end();
  if (sqliteDb) {
    await new Promise((resolve, reject) => sqliteDb.close((err) => (err ? reject(err) : resolve())));
  }
}

module.exports = {
  db: isPostgres ? pgPool : sqliteDb,
  run,
  all,
  get,
  migrate,
  migrateFeeStructureTemplates,
  migrateFeeFlowHardening,
  migrateTenantOnboarding,
  migrateAcademicMasterData,
  migrateStudentProfiles,
  migrateAttendanceOperations,
  migrateWhatsAppOfficialTemplates,
  migrateParentCommunicationCenter,
  migrateTeacherScore,
  migrateSuperAdmin,
  migrateAdmissionRealColumns,
  migrateMarketingCampaigns,
  migrateLeadActivities,
  migrateBusinessTenantMetadataColumns,
  migrateTenantIndexes,
  close,
  isPostgres,
};
