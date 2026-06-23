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
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
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
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      actor_user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

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
  await run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_entity ON audit_logs (tenant_id, entity_type, entity_id)`);
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

async function migrateTenantColumns() {
  await addColumnIfMissing('users', 'tenant_id', 'INTEGER');
  const tenant = await ensureDefaultTenant();
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
  migrateSuperAdmin,
  migrateAdmissionRealColumns,
  migrateMarketingCampaigns,
  migrateLeadActivities,
  migrateBusinessTenantMetadataColumns,
  migrateTenantIndexes,
  close,
  isPostgres,
};
