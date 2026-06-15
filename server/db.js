const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'data.sqlite');
const DATABASE_URL = process.env.DATABASE_URL;
const isPostgres = Boolean(DATABASE_URL);

let sqliteDb = null;
let pgPool = null;

if (isPostgres) {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
} else {
  const sqlite3 = require('sqlite3').verbose();
  sqliteDb = new sqlite3.Database(DB_PATH);
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
  await migrateTenantColumns();
  await migrateOperationalTenantColumns();
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
  close,
  isPostgres,
};
