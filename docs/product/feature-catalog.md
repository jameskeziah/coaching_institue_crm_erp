# Feature Catalog

Generated from [feature-registry.json](feature-registry.json). Application baseline audited 2026-11-27 at [0643bda](https://github.com/jameskeziah/coaching_institue_crm_erp/commit/0643bdad9eacdd24ae000460d59d2086c01e96ee).

## ACA-000 · Academic operations

Maintain academic structure and plan, deliver and monitor instruction.

**Institution operations / Academic operations / Academics** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Academic.jsx](../../src/pages/Academic.jsx) · frontend · Integrated forms and metrics for academic operations.
- [server/routes/academicMaster.routes.js](../../server/routes/academicMaster.routes.js) · backend · Academic master routes are mounted ahead of the legacy fallback.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Legacy academic route group serves academic operations.
- [server/db.js](../../server/db.js) · database · Academic master schema and legacy academic planning tables.
- [server/tests/legacy-academic.tenant.test.js](../../server/tests/legacy-academic.tenant.test.js) · test · Two-tenant PostgreSQL HTTP fixtures cover scoped reads, writes and malformed or foreign references in the six legacy academic resource groups.

**Related pull requests**

[#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

### ACA-001 · Branch directory and lifecycle

Maintain branch identity and status for downstream academic and operational records.

**Institution operations / Academic operations / Academics** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/AcademicMasters.jsx](../../src/pages/AcademicMasters.jsx) · frontend · Branch list and edit controls in settings.
- [server/routes/academicMaster.routes.js](../../server/routes/academicMaster.routes.js) · backend · List, create, read, edit and deactivate branches.
- [server/db.js](../../server/db.js) · database · branches is created during tenant metadata migration.

**Related pull requests**

—

### ACA-002 · Course directory

Maintain course/program definitions used by batch and student academic data.

**Institution operations / Academic operations / Academics** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/AcademicMasters.jsx](../../src/pages/AcademicMasters.jsx) · frontend · Courses settings provide management workflows.
- [server/routes/academicMaster.routes.js](../../server/routes/academicMaster.routes.js) · backend · Shared academic master route factory applies course rules.
- [server/db.js](../../server/db.js) · database · courses stores scoped program records.

**Related pull requests**

—

### ACA-003 · Subject directory

Manage subject definitions and the subject identifiers used by classes and teaching assignments.

**Institution operations / Academic operations / Academics** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/AcademicMasters.jsx](../../src/pages/AcademicMasters.jsx) · frontend · Subjects settings give staff a subject list and edit form.
- [server/routes/academicMaster.routes.js](../../server/routes/academicMaster.routes.js) · backend · Shared master route factory applies subject rules.
- [server/db.js](../../server/db.js) · database · subjects stores tenant-scoped subject records.

**Related pull requests**

—

### ACA-004 · Batch lifecycle and yearly placement

Maintain batch identity, course, branch, class, academic year, capacity and active lifecycle.

**Institution operations / Academic operations / Academics** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/AcademicMasters.jsx](../../src/pages/AcademicMasters.jsx) · frontend · Batch collection and detail views expose academic placement and actions.
- [server/routes/academicMaster.routes.js](../../server/routes/academicMaster.routes.js) · backend · Batch list, detail, create, update, delete, status and audit routes.
- [server/db.js](../../server/db.js) · database · batches stores course, branch, capacity, and term metadata.

**Related pull requests**

—

### ACA-005 · Batch timings

Store recurring instructional time slots associated with a batch.

**Institution operations / Academic operations / Academics** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/AcademicMasters.jsx](../../src/pages/AcademicMasters.jsx) · frontend · Batch detail presents settings for schedule slots.
- [server/routes/academicMaster.routes.js](../../server/routes/academicMaster.routes.js) · backend · PUT /batches/:batchId/timings replaces timings and records audit evidence.
- [server/db.js](../../server/db.js) · database · batch_timings models batch schedule slots.

**Related pull requests**

—

### ACA-006 · Faculty subject and batch assignment

Associate teachers with owned subjects and batches for timetable and student access.

**Institution operations / Academic operations / Academics** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/AcademicMasters.jsx](../../src/pages/AcademicMasters.jsx) · frontend · Batch detail lists and manages teacher assignments.
- [server/routes/academicMaster.routes.js](../../server/routes/academicMaster.routes.js) · backend · Batch/teacher and faculty/subject add/remove routes.
- [server/db.js](../../server/db.js) · database · batch_teachers and faculty_subjects store assignment relationships.

**Related pull requests**

—

### ACA-007 · Syllabus topic tracking

Track topics, estimated lectures, difficulty and progress by course and subject.

**Institution operations / Academic operations / Academics** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Academic.jsx](../../src/pages/Academic.jsx) · frontend · Syllabus tracker shows progress and allows topic entry.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Syllabus list/create/update/delete routes use tenant row checks.
- [server/db.js](../../server/db.js) · database · academic_syllabus stores topics and status.
- [server/tests/legacy-academic.tenant.test.js](../../server/tests/legacy-academic.tenant.test.js) · test · Two-tenant PostgreSQL HTTP fixtures cover scoped reads, writes and malformed or foreign references in the six legacy academic resource groups.

**Related pull requests**

[#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

### ACA-008 · Academic calendar

Maintain academic year events, target dates and planning status.

**Institution operations / Academic operations / Academics** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Academic.jsx](../../src/pages/Academic.jsx) · frontend · Calendar features a form and sorted record list.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Calendar list/create/delete are tenant filtered.
- [server/db.js](../../server/db.js) · database · academic_calendars stores institution calendar entries.
- [server/tests/legacy-academic.tenant.test.js](../../server/tests/legacy-academic.tenant.test.js) · test · Two-tenant PostgreSQL HTTP fixtures cover scoped reads, writes and malformed or foreign references in the six legacy academic resource groups.

**Related pull requests**

[#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

### ACA-009 · Teaching timetable

Assign subject, teacher, batch, day, time and room for instruction.

**Institution operations / Academic operations / Academics** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Academic.jsx](../../src/pages/Academic.jsx) · frontend · Timetable form collects scheduling fields and displays rows.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Timetable writes verify teacher ownership and handle managed batch status.
- [server/db.js](../../server/db.js) · database · batch_timetables stores legacy class timetable rows.
- [server/tests/legacy-academic.tenant.test.js](../../server/tests/legacy-academic.tenant.test.js) · test · Two-tenant PostgreSQL HTTP fixtures cover scoped reads, writes and malformed or foreign references in the six legacy academic resource groups.

**Related pull requests**

[#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

### ACA-010 · Lecture planning

Create lesson plans with date, topic, learning material and related homework/test flags.

**Institution operations / Academic operations / Academics** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Academic.jsx](../../src/pages/Academic.jsx) · frontend · Lecture planning form and list are registered under Academic.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Lecture CRUD protects tenant scope and referenced teacher ownership.
- [server/db.js](../../server/db.js) · database · lecture_plans holds plans and delivery metadata.
- [server/tests/legacy-academic.tenant.test.js](../../server/tests/legacy-academic.tenant.test.js) · test · Two-tenant PostgreSQL HTTP fixtures cover scoped reads, writes and malformed or foreign references in the six legacy academic resource groups.

**Related pull requests**

[#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

### ACA-011 · Lecture delivery logs

Record actual topics, notes, class attendance and completion against a planned lecture.

**Institution operations / Academic operations / Academics** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Academic.jsx](../../src/pages/Academic.jsx) · frontend · Delivery form captures outcomes and displays delivery logs.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Delivery creation validates plan and teacher ownership and advances the matching plan.
- [server/db.js](../../server/db.js) · database · class_delivery_logs references lecture_plans and teacher records.
- [server/tests/legacy-academic.tenant.test.js](../../server/tests/legacy-academic.tenant.test.js) · test · Two-tenant PostgreSQL HTTP fixtures cover scoped reads, writes and malformed or foreign references in the six legacy academic resource groups.

**Related pull requests**

[#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

### ACA-012 · Homework assignments and tracking

Track homework for batch instruction with submitted, pending and checked counts.

**Institution operations / Academic operations / Academics** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Academic.jsx](../../src/pages/Academic.jsx) · frontend · Assignments form and pending-homework list track totals.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Homework routes validate scoped teacher and checked-by references.
- [server/db.js](../../server/db.js) · database · homework_assignments stores legacy assignment fields and counts.
- [server/tests/legacy-academic.tenant.test.js](../../server/tests/legacy-academic.tenant.test.js) · test · Two-tenant PostgreSQL HTTP fixtures cover scoped reads, writes and malformed or foreign references in the six legacy academic resource groups.

**Related pull requests**

[#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

### ACA-013 · Doubt session planning

Schedule and track resolution of student doubts by batch, date and topic.

**Institution operations / Academic operations / Academics** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Academic.jsx](../../src/pages/Academic.jsx) · frontend · Doubt session form and history list.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Academic doubt-session list, create and delete routes.
- [server/db.js](../../server/db.js) · database · doubt_sessions records plans and status.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Isolated fixtures assert academic doubt-session tenant scoping.

**Related pull requests**

—

### ACA-014 · Revision planning

Plan chapter and subject revision cycles with scheduled dates and status.

**Institution operations / Academic operations / Academics** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Academic.jsx](../../src/pages/Academic.jsx) · frontend · Revision Planner records date, class and chapter selections.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Academic revision plan list, create and delete routes.
- [server/db.js](../../server/db.js) · database · revision_plans stores subject, sequence and status fields.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Isolated test covers revision row isolation.

**Related pull requests**

—

### ACA-015 · Academic remedial actions

Manage support actions with issue, assigned staff, target student and follow-up deadline.

**Institution operations / Academic operations / Academics** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Academic.jsx](../../src/pages/Academic.jsx) · frontend · Academic remediation form logs interventions.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Create/list/delete with tenant-scoped student and teacher references.
- [server/db.js](../../server/db.js) · database · remedial_actions records interventions and due dates.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Tenant scoping for academic remedial actions is covered.

**Related pull requests**

—

### ACA-016 · Academic progress dashboard

Aggregate syllabus completion, delivery, homework, test performance, doubt resolution, revision and remediation.

**Institution operations / Academic operations / Academics** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Academic.jsx](../../src/pages/Academic.jsx) · frontend · Academic command centre shows progress cards and subject breakdown.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · academicDashboard queries each source by session-owned tenant and groups syllabus by subject.
- [server/db.js](../../server/db.js) · database · The dashboard reads nine academic and result sources.
- [server/tests/legacy-academic.tenant.test.js](../../server/tests/legacy-academic.tenant.test.js) · test · Two-tenant PostgreSQL HTTP fixtures cover scoped reads, writes and malformed or foreign references in the six legacy academic resource groups.

**Related pull requests**

[#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

### ACA-017 · Academic year promotion and rollover

Move an eligible cohort to a new academic year while preserving prior memberships and history.

**Institution operations / Academic operations / Academics** · NOT_BUILT · PROPOSED

**Source evidence**

- [server/routes/academicMaster.routes.js](../../server/routes/academicMaster.routes.js) · backend · Batch and membership updates exist. No dedicated academic-year promotion workflow was found.
- [server/db.js](../../server/db.js) · database · batches has academic year fields, with no promotion transition surfaced in the baseline audit.

**Related pull requests**

—

## ADM-001 · Manual lead entry and pipeline

Create, filter, edit, move and archive admissions leads in a tenant-scoped pipeline.

**Admissions / Lead management / Admissions pipeline** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/Admissions.jsx](../../src/pages/Admissions.jsx) · frontend · Lead form, stage columns, dashboard counters, edits and deletes.
- [server/routes/admissions.routes.js](../../server/routes/admissions.routes.js) · backend · Role- and tenant-guarded CRUD, status normalization and analytics summary.
- [server/config/roles.js](../../server/config/roles.js) · security · Admissions includes counsellors while the finance group used by the fee structure route excludes them.
- [server/migrations/011-admission-real-columns.js](../../server/migrations/011-admission-real-columns.js) · database · Adds normalized admission columns.
- [server/migrations/012-backfill-admission-json.js](../../server/migrations/012-backfill-admission-json.js) · database · Backfills old admission JSON values into real columns.
- [scripts/smoke-test.mjs](../../scripts/smoke-test.mjs) · test · Creates, lists and cleans up a fixture admission and checks counsellor access.
- [server/services/admission.service.js](../../server/services/admission.service.js) · backend · Normalizes lead fields and statuses used by admissions.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### ADM-002 · Counsellor assignment and ownership

Assign an active eligible staff member to an institution's lead and expose assignment in the pipeline.

**Admissions / Lead management / Admissions pipeline** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/Admissions.jsx](../../src/pages/Admissions.jsx) · frontend · Loads counsellor options and submits lead assignment.
- [server/routes/leadManagement.routes.js](../../server/routes/leadManagement.routes.js) · backend · Checks assignee membership and active role before scoped lead update.
- [server/migrations/014-admission-assignment-duplicates-campaigns.js](../../server/migrations/014-admission-assignment-duplicates-campaigns.js) · database · Introduces counsellor, source and duplicate infrastructure.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### ADM-003 · Counselling activities and stage history

Record calls, notes, demos, follow-up dates and pipeline changes in a lead timeline.

**Admissions / Lead management / Activity timeline** · PARTIAL · APPROVED

**Source evidence**

- [src/components/leads/AddLeadActivityForm.jsx](../../src/components/leads/AddLeadActivityForm.jsx) · frontend · Provides supported activity form fields.
- [src/components/leads/LeadActivityTimeline.jsx](../../src/components/leads/LeadActivityTimeline.jsx) · frontend · Displays activities and stage transitions.
- [server/routes/leadActivities.routes.js](../../server/routes/leadActivities.routes.js) · backend · Checks lead ownership and exposes list/create endpoints.
- [server/services/leadActivity.service.js](../../server/services/leadActivity.service.js) · backend · Stores lead activity and actor metadata.
- [server/migrations/013-lead-activities.js](../../server/migrations/013-lead-activities.js) · database · Creates the timeline relation and indexes.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### ADM-004 · Staff duplicate lead review

Match same-tenant leads using normalized phone and name and allow an explicit staff decision on a possible duplicate.

**Admissions / Lead management / Duplicate management** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/Admissions.jsx](../../src/pages/Admissions.jsx) · frontend · Shows duplicate matches on a staff create attempt and supports explicit continuation.
- [server/services/duplicateLead.service.js](../../server/services/duplicateLead.service.js) · backend · Queries candidate leads within one institution.
- [server/routes/admissions.routes.js](../../server/routes/admissions.routes.js) · backend · Returns matching context in the authenticated CRM flow.
- [server/migrations/014-admission-assignment-duplicates-campaigns.js](../../server/migrations/014-admission-assignment-duplicates-campaigns.js) · database · Adds normalized phone indexing.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### ADM-005 · Formal admission application

Collect and track an application independently of an initial lead.

**Admissions / Admission verification / Application** · NOT_BUILT · APPROVED

**Source evidence**

- [src/pages/Admissions.jsx](../../src/pages/Admissions.jsx) · frontend · Main's lead form collects intake and pipeline data rather than a dedicated application workflow.
- [server/routes/admissions.routes.js](../../server/routes/admissions.routes.js) · backend · Lead CRUD currently serves as the admissions entry point.

**Related pull requests**

—

#### ADM-006 · Applicant document verification

Collect, review and approve admission documents before conversion.

**Admissions / Admission verification / Document review** · INCOMPLETE · APPROVED

**Source evidence**

- [src/pages/StudentProfile.jsx](../../src/pages/StudentProfile.jsx) · frontend · Existing student document metadata, verify and reject actions after student creation.
- [server/routes/students.routes.js](../../server/routes/students.routes.js) · backend · Student-scoped document routes can inform reuse in applicant verification.

**Related pull requests**

—

#### ADM-007 · Admission approval and rejection

Require a recorded authorized admission decision before conversion into an enrolled student.

**Admissions / Admission verification / Application decision** · NOT_BUILT · APPROVED

**Source evidence**

- [src/pages/Admissions.jsx](../../src/pages/Admissions.jsx) · frontend · Pipeline stage and conversion buttons do not provide a separate document-dependent approval gate.
- [server/routes/admissions.routes.js](../../server/routes/admissions.routes.js) · backend · Existing status updates provide the workflow overlap.

**Related pull requests**

—

### ADM-008 · Lead-to-student conversion and enrolment

Convert one eligible admission lead into one student assigned to the right academic branch, course and batch.

**Admissions / Student enrolment / Lead conversion** · INCOMPLETE · APPROVED

**Source evidence**

- [src/pages/Admissions.jsx](../../src/pages/Admissions.jsx) · frontend · Conversion makes sequential student create, optional legacy fee plan create and lead update requests.
- [server/routes/students.routes.js](../../server/routes/students.routes.js) · backend · Student creation provides the enrolment persistence layer.
- [server/routes/admissions.routes.js](../../server/routes/admissions.routes.js) · backend · Records converted student and timestamp on the lead.
- [server/db.js](../../server/db.js) · database · Student, academic master and admissions conversion fields exist.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### ADM-009 · Student task queue and escalation

Create, assign, complete, export and escalate student tasks with role-specific visibility.

**Admissions / Student follow-up / Follow-up tasks** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/FollowUps.jsx](../../src/pages/FollowUps.jsx) · frontend · Task filters, editor, completion notes, CSV export and escalation action.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Task CRUD, actor/assignee filters and overdue automation.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Management, teacher, counsellor and forbidden-role DTOs and two-tenant task isolation.
- [scripts/smoke-test.mjs](../../scripts/smoke-test.mjs) · test · Completes a fixture follow-up and verifies timeline and escalation records.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

## AIL-000 · AI and robotics lab operations

Operate AI, ML and robotics education activities, equipment and learner outcomes.

**Institution operations / Lab instruction / AI and Robotics Lab** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/AiLab.jsx](../../src/pages/AiLab.jsx) · frontend · Lab command centre with courses, enrolled learners, equipment and assessments.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Ten mounted AI Lab record families and a summary endpoint.
- [server/db.js](../../server/db.js) · database · AI Lab schema and tenant ownership migration include all lab record types.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · AI Lab dashboard/ownership regression exercises tenant-scoped records, references and mutations on isolated fixtures.

**Related pull requests**

—

### AIL-001 · Lab course and module setup

Record course category, duration and curriculum modules.

**Institution operations / Lab instruction / AI and Robotics Lab** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/AiLab.jsx](../../src/pages/AiLab.jsx) · frontend · Course And Modules form and list.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Course create/update handles nested module state and course deletion.
- [server/db.js](../../server/db.js) · database · ai_lab_courses and ai_lab_modules hold related curriculum records.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · AI Lab dashboard/ownership regression exercises tenant-scoped records, references and mutations on isolated fixtures.

**Related pull requests**

—

### AIL-002 · Lab student enrolment

Associate learner records to courses, cohorts and mentor details.

**Institution operations / Lab instruction / AI and Robotics Lab** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/AiLab.jsx](../../src/pages/AiLab.jsx) · frontend · Student Enrollment form with roster input.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Lab enrolment CRUD validates selected student, teacher and course references.
- [server/db.js](../../server/db.js) · database · ai_lab_students references student and course records.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · AI Lab dashboard/ownership regression exercises tenant-scoped records, references and mutations on isolated fixtures.

**Related pull requests**

—

### AIL-003 · Lab attendance

Capture date, arrival, departure and device use during lab sessions.

**Institution operations / Lab instruction / AI and Robotics Lab** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/AiLab.jsx](../../src/pages/AiLab.jsx) · frontend · Lab Attendance form and list track attendance outcomes.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Lab attendance list, create and delete endpoints.
- [server/db.js](../../server/db.js) · database · ai_lab_attendance associates course and lab student records.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · AI Lab dashboard/ownership regression exercises tenant-scoped records, references and mutations on isolated fixtures.

**Related pull requests**

—

### AIL-004 · Lab device register

Record devices, identifiers, condition and current status.

**Institution operations / Lab instruction / AI and Robotics Lab** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/AiLab.jsx](../../src/pages/AiLab.jsx) · frontend · Device Register form showing equipment status and condition.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Devices list and create/delete endpoints.
- [server/db.js](../../server/db.js) · database · ai_lab_devices stores institution equipment metadata.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · AI Lab dashboard/ownership regression exercises tenant-scoped records, references and mutations on isolated fixtures.

**Related pull requests**

—

### AIL-005 · Lab device allocation

Associate device use to a lab learner and record date, time and condition.

**Institution operations / Lab instruction / AI and Robotics Lab** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/AiLab.jsx](../../src/pages/AiLab.jsx) · frontend · Device Allocation form and usage list.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Allocate/delete and list allocations via the devices route.
- [server/db.js](../../server/db.js) · database · ai_lab_device_allocations references device and lab learner records.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · AI Lab dashboard/ownership regression exercises tenant-scoped records, references and mutations on isolated fixtures.

**Related pull requests**

—

### AIL-006 · Lab project tracking

Track project progress, final demonstrations, repositories and outcomes.

**Institution operations / Lab instruction / AI and Robotics Lab** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/AiLab.jsx](../../src/pages/AiLab.jsx) · frontend · Project Tracking form and progress list.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Project list/create/delete endpoints.
- [server/db.js](../../server/db.js) · database · ai_lab_projects references lab students and course metadata.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · AI Lab dashboard/ownership regression exercises tenant-scoped records, references and mutations on isolated fixtures.

**Related pull requests**

—

### AIL-007 · Lab assignment submissions and grading log

Track assigned work, submission links, scores and due dates.

**Institution operations / Lab instruction / AI and Robotics Lab** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/AiLab.jsx](../../src/pages/AiLab.jsx) · frontend · Assignment Upload Log tracks grades and referenced work.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Assignment list/create/delete endpoints.
- [server/db.js](../../server/db.js) · database · ai_lab_assignments stores submission metadata and scores.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · AI Lab dashboard/ownership regression exercises tenant-scoped records, references and mutations on isolated fixtures.

**Related pull requests**

—

### AIL-008 · Lab mentor feedback

Record rubric values, remarks and aggregate mentor evaluations.

**Institution operations / Lab instruction / AI and Robotics Lab** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/AiLab.jsx](../../src/pages/AiLab.jsx) · frontend · Mentor Feedback form and total score list.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Mentor feedback list/create/delete endpoints.
- [server/db.js](../../server/db.js) · database · ai_lab_mentor_feedback stores ratings and remarks.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · AI Lab dashboard/ownership regression exercises tenant-scoped records, references and mutations on isolated fixtures.

**Related pull requests**

—

### AIL-009 · Lab portfolios

Organize lab learner portfolio references and associated project repository information.

**Institution operations / Lab instruction / AI and Robotics Lab** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/AiLab.jsx](../../src/pages/AiLab.jsx) · frontend · Portfolio Builder captures profile and repository links.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Portfolio list/create/delete endpoints.
- [server/db.js](../../server/db.js) · database · ai_lab_portfolios stores portfolio links and state.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · AI Lab dashboard/ownership regression exercises tenant-scoped records, references and mutations on isolated fixtures.

**Related pull requests**

—

### AIL-010 · Lab certificates

Record certificate identity, qualifying course/learner, issue date and status.

**Institution operations / Lab instruction / AI and Robotics Lab** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/AiLab.jsx](../../src/pages/AiLab.jsx) · frontend · Certificate Control form and record list.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Certificate list/create/delete endpoints.
- [server/db.js](../../server/db.js) · database · ai_lab_certificates stores issue information and association IDs.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · AI Lab dashboard/ownership regression exercises tenant-scoped records, references and mutations on isolated fixtures.

**Related pull requests**

—

### AIL-011 · Lab dashboard

Aggregate lab courses, attendance, devices, projects and activity for staff oversight.

**Institution operations / Lab instruction / AI and Robotics Lab** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/AiLab.jsx](../../src/pages/AiLab.jsx) · frontend · Lab status indicators and totals render learner, device and outcome counts.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · AI Lab dashboard queries tenant-scoped sources.
- [server/db.js](../../server/db.js) · database · Dedicated lab record tables feed aggregate answers.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · AI Lab dashboard/ownership regression exercises tenant-scoped records, references and mutations on isolated fixtures.

**Related pull requests**

—

## ANA-000 · Institute operational intelligence

Summarize attendance, student status, cash, expenses, teaching and intervention signals for allowed audiences.

**Institution operations / Operational intelligence / Dashboards and reporting** · PARTIAL · OBSERVED

**Source evidence**

- [src/App.jsx](../../src/App.jsx) · frontend · Dashboard and reports are separate authenticated routes.
- [src/api.js](../../src/api.js) · integration · Client binds operational metrics to scoped domain endpoints.

**Related pull requests**

—

### ANA-001 · Daily institute dashboard

Show operational totals, follow-ups, attendance risk, cash and quick actions.

**Institution operations / Operational intelligence / Dashboards and reporting** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Dashboard.jsx](../../src/pages/Dashboard.jsx) · frontend · Today's Institute Dashboard, risk lists, quick actions and active items.
- [src/api.js](../../src/api.js) · integration · Dashboard combines current students, admissions, attendance, fees, follow-ups and expense endpoint calls.
- [tests/ui/app.spec.js](../../tests/ui/app.spec.js) · test · Admin login/dashboard navigation is exercised, without numeric KPI acceptance.

**Related pull requests**

—

### ANA-002 · Consolidated operations reports

Filter and summarize finance, student, attendance, payroll and branch results.

**Institution operations / Operational intelligence / Dashboards and reporting** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Reports.jsx](../../src/pages/Reports.jsx) · frontend · Owner/admin reporting page with month, branch and grouped metrics.
- [src/api.js](../../src/api.js) · integration · API client connects finance, attendance, source analytics and student data queries.

**Related pull requests**

—

### ANA-003 · Consolidated report export and print

Export current permitted report summaries as CSV and print operational views.

**Institution operations / Operational intelligence / Dashboards and reporting** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Reports.jsx](../../src/pages/Reports.jsx) · frontend · downloadCsv and browser print actions export the selected aggregate report.

**Related pull requests**

—

### ANA-004 · Advanced analytics and AI assistance

Use governed operational data to support approved advanced analytics or AI workflows.

**Institution operations / Operational intelligence / Dashboards and reporting** · NOT_BUILT · PROPOSED

**Source evidence**

- [src/pages/Dashboard.jsx](../../src/pages/Dashboard.jsx) · frontend · Existing dashboard computes rule-based summaries from application data.
- [src/pages/AiLab.jsx](../../src/pages/AiLab.jsx) · frontend · AI Lab offers educational programme administration. It is independent of institutional analytics.

**Related pull requests**

—

## ATT-000 · Learner attendance and parent alerts

Maintain attendance operations from scheduled lessons through recorded presence, corrections and follow-up.

**Institution operations / Attendance / Attendance** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/Attendance.jsx](../../src/pages/Attendance.jsx) · frontend · Main attendance screen.
- [src/pages/AttendanceOperations.jsx](../../src/pages/AttendanceOperations.jsx) · frontend · Mobile, calendar and attendance reporting surfaces.
- [server/routes/attendanceOperations.routes.js](../../server/routes/attendanceOperations.routes.js) · backend · Current attendance operations mount and session lifecycle endpoints.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Attendance reports, older record actions and alert/call routes remain reachable.
- [server/db.js](../../server/db.js) · database · Sessions, records, correction requests, alert logs and configurable risk tables.
- [scripts/smoke-test.mjs](../../scripts/smoke-test.mjs) · test · Smoke suite exercises real attendance create, mark and report endpoints and teacher deletion denial.

**Related pull requests**

—

### ATT-001 · Attendance session management

Create, open, submit and lock learner attendance sessions with a batch, lesson, teacher and roster.

**Institution operations / Attendance / Attendance** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/AttendanceOperations.jsx](../../src/pages/AttendanceOperations.jsx) · frontend · Session selection, attendance marking and submission.
- [src/pages/Attendance.jsx](../../src/pages/Attendance.jsx) · frontend · Attendance overview and session list.
- [server/routes/attendanceOperations.routes.js](../../server/routes/attendanceOperations.routes.js) · backend · GET/POST sessions, detail, submit and lock operations are mounted.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Legacy attendance session deletion remains separate.
- [server/db.js](../../server/db.js) · database · attendance_sessions and attendance_records store session state and roster marks.
- [scripts/smoke-test.mjs](../../scripts/smoke-test.mjs) · test · Smoke exercises successful owned attendance submission plus role visibility and denied deletion.

**Related pull requests**

—

### ATT-002 · Mobile marking and draft attendance

Toggle student attendance status, apply mark-all-present, save drafts, and submit from the teacher's daily view.

**Institution operations / Attendance / Attendance** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/AttendanceOperations.jsx](../../src/pages/AttendanceOperations.jsx) · frontend · Mobile screen shows daily classes, searchable roster and status controls.
- [server/routes/attendanceOperations.routes.js](../../server/routes/attendanceOperations.routes.js) · backend · Teacher daily schedule, mark-all-present, record updates and draft operations.
- [server/db.js](../../server/db.js) · database · Attendance records carry per-learner status and actor metadata.

**Related pull requests**

—

### ATT-003 · Attendance correction approvals

Accept attendance correction requests and record managerial approval or rejection.

**Institution operations / Attendance / Attendance** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/Attendance.jsx](../../src/pages/Attendance.jsx) · frontend · Attendance screens surface corrective workflow controls.
- [server/routes/attendanceOperations.routes.js](../../server/routes/attendanceOperations.routes.js) · backend · Correction list, request and PATCH approval/rejection.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Additional legacy correction approval and rejection routes.
- [server/db.js](../../server/db.js) · database · attendance_correction_requests stores requested change, evidence and resolution.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Attendance correction and automation log ownership assertions.

**Related pull requests**

—

### ATT-004 · Attendance calendar and summary reports

Display attendance by date, batch or teacher, with period statistics for daily operations.

**Institution operations / Attendance / Attendance** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/AttendanceOperations.jsx](../../src/pages/AttendanceOperations.jsx) · frontend · Calendar and report tabs.
- [src/pages/Attendance.jsx](../../src/pages/Attendance.jsx) · frontend · Summary, attendance dashboards and operational report views.
- [server/routes/attendanceOperations.routes.js](../../server/routes/attendanceOperations.routes.js) · backend · Calendar endpoint filters monthly attendance sessions.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Attendance dashboard and report article endpoints read aggregate session and record data.
- [server/db.js](../../server/db.js) · database · Attendance report sources join sessions and per-student marks.

**Related pull requests**

—

### ATT-005 · Attendance parent absence notifications

Generate parent alerts from recorded attendance and retain delivery or call status.

**Institution operations / Attendance / Attendance** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/AttendanceOperations.jsx](../../src/pages/AttendanceOperations.jsx) · frontend · Attendance marking tools trigger parent alerts or show their state.
- [server/routes/attendanceOperations.routes.js](../../server/routes/attendanceOperations.routes.js) · backend · POST session send-parent-alerts runs an owned session notification flow.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Legacy record-level alert and parent call log entry points remain.
- [server/db.js](../../server/db.js) · database · parent_alert_logs and parent_call_logs persist notification outcomes.
- [server/services/whatsapp-template.service.js](../../server/services/whatsapp-template.service.js) · integration · Provides approved template resolution/sending for absence alerts.

**Related pull requests**

—

### ATT-006 · Attendance risk and automated follow-ups

Compute attendance risk snapshots and create follow-up tasks for agreed at-risk conditions.

**Institution operations / Attendance / Attendance** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/AttendanceOperations.jsx](../../src/pages/AttendanceOperations.jsx) · frontend · Risk report, recalculation and auto-followup controls.
- [server/routes/attendanceOperations.routes.js](../../server/routes/attendanceOperations.routes.js) · backend · Settings, risk recalculation, risk reporting and auto-followup execution endpoints.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Legacy attendance and batch discipline automation remain mounted.
- [server/db.js](../../server/db.js) · database · attendance_settings and attendance_risk_snapshots persist thresholds and calculations.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Legacy batch discipline and attendance automation log scoping is covered.

**Related pull requests**

—

### ATT-007 · Teacher attendance completion metrics

Summarize submitted and outstanding class attendance and support monthly recalculation.

**Institution operations / Attendance / Attendance** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/AttendanceOperations.jsx](../../src/pages/AttendanceOperations.jsx) · frontend · Teacher attendance completion report tab and recalculation action.
- [server/routes/attendanceOperations.routes.js](../../server/routes/attendanceOperations.routes.js) · backend · Recalculate score and report teacher completion with role restrictions.
- [server/db.js](../../server/db.js) · database · teacher_attendance_completion_scores stores per-teacher period snapshots.

**Related pull requests**

—

### ATT-008 · Attendance policy settings

Manage institution-specific definitions used for attendance risk and follow-up calculation.

**Institution operations / Attendance / Attendance** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/AttendanceOperations.jsx](../../src/pages/AttendanceOperations.jsx) · frontend · Attendance operations consumes settings-backed outputs; a full management UI is unverified.
- [server/routes/attendanceOperations.routes.js](../../server/routes/attendanceOperations.routes.js) · backend · Settings read and management-only PUT update.
- [server/db.js](../../server/db.js) · database · attendance_settings stores tenant-specific thresholds and alert options.

**Related pull requests**

—

## COM-000 · Institution communication operations

Coordinate staff-managed parent contact, approved channels and timely follow-up.

**Institution operations / Parent and staff communication / Communication** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/ParentCommunicationCenter.jsx](../../src/pages/ParentCommunicationCenter.jsx) · frontend · Central staff communication screen.
- [server/routes/parentCommunication.routes.js](../../server/routes/parentCommunication.routes.js) · backend · Communication list, detail, sends and staff actions.
- [server/routes/whatsappTemplates.routes.js](../../server/routes/whatsappTemplates.routes.js) · backend · WhatsApp template and history actions.
- [server/db.js](../../server/db.js) · database · communication_events, parent_manual_notes, logs, templates and status tables are present.
- [server/services/communication-timeline.service.js](../../server/services/communication-timeline.service.js) · integration · Normalizes call, template and note events into the communication timeline.

**Related pull requests**

—

### COM-001 · Parent communication center and timelines

Filter event types, statuses, student and guardian records and read case details from authorized staff views.

**Institution operations / Parent and staff communication / Communication** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/ParentCommunicationCenter.jsx](../../src/pages/ParentCommunicationCenter.jsx) · frontend · Parent Communication Center filters rows and opens detail panels.
- [server/routes/parentCommunication.routes.js](../../server/routes/parentCommunication.routes.js) · backend · GET collection and event detail joins owned context and sender/assignee data.
- [server/routes/students.routes.js](../../server/routes/students.routes.js) · backend · Student communications section exposes role-scoped profile events.
- [server/db.js](../../server/db.js) · database · communication_events stores tenant, branch, student, guardian and provider references.
- [server/services/communication-timeline.service.js](../../server/services/communication-timeline.service.js) · integration · Normalizes call, template and note events into the communication timeline.

**Related pull requests**

—

### COM-002 · Manual parent calls and staff notes

Record call dispositions, manual notes and association to learners or guardians.

**Institution operations / Parent and staff communication / Communication** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/ParentCommunicationCenter.jsx](../../src/pages/ParentCommunicationCenter.jsx) · frontend · Staff can log a call or manual note from the center.
- [server/routes/parentCommunication.routes.js](../../server/routes/parentCommunication.routes.js) · backend · Log-call and manual-note endpoints create communication events and audit evidence.
- [server/db.js](../../server/db.js) · database · parent_call_logs and parent_manual_notes are included in timeline migration.
- [server/services/communication-timeline.service.js](../../server/services/communication-timeline.service.js) · integration · Normalizes call, template and note events into the communication timeline.

**Related pull requests**

—

### COM-003 · Parent communication assignment, review and follow-up

Assign a staff member, add related follow-up tasks and mark events reviewed.

**Institution operations / Parent and staff communication / Communication** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/ParentCommunicationCenter.jsx](../../src/pages/ParentCommunicationCenter.jsx) · frontend · Case detail offers related follow-up actions and review state.
- [server/routes/parentCommunication.routes.js](../../server/routes/parentCommunication.routes.js) · backend · Follow-up creation, assignment and mark-reviewed endpoints.
- [server/db.js](../../server/db.js) · database · communication_events has review and assignee fields. follow_up_tasks stores task linkage.
- [server/services/communication-timeline.service.js](../../server/services/communication-timeline.service.js) · integration · Normalizes call, template and note events into the communication timeline.

**Related pull requests**

—

### COM-004 · Official WhatsApp template catalog and settings

Manage provider templates, categories, languages, approval state, opt-in policy and use-case mapping.

**Institution operations / Parent and staff communication / Communication** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/WhatsAppTemplates.jsx](../../src/pages/WhatsAppTemplates.jsx) · frontend · Official templates and settings forms expose provider status and management controls.
- [server/routes/whatsappTemplates.routes.js](../../server/routes/whatsappTemplates.routes.js) · backend · Template CRUD, sync, submit for provider approval, status and settings endpoints.
- [server/db.js](../../server/db.js) · database · whatsapp_official_templates and whatsapp_template_settings persist template content and policy.
- [server/services/whatsapp-provider.service.js](../../server/services/whatsapp-provider.service.js) · integration · Provider adapter services template management and sync.

**Related pull requests**

—

### COM-005 · WhatsApp preview, single and bulk sends

Resolve approved variables and staff-authorized recipients, preview content and send using a selected official template.

**Institution operations / Parent and staff communication / Communication** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/WhatsAppTemplates.jsx](../../src/pages/WhatsAppTemplates.jsx) · frontend · Template preview and sending controls.
- [src/pages/ParentCommunicationCenter.jsx](../../src/pages/ParentCommunicationCenter.jsx) · frontend · Parent contact action uses template workflow.
- [server/routes/whatsappTemplates.routes.js](../../server/routes/whatsappTemplates.routes.js) · backend · Preview, send and send-bulk routes.
- [server/routes/parentCommunication.routes.js](../../server/routes/parentCommunication.routes.js) · backend · Parent Communication Center has a separate send-whatsapp action.
- [server/db.js](../../server/db.js) · database · whatsapp_template_messages stores sender, recipient context, variables and status.
- [server/services/whatsapp-template.service.js](../../server/services/whatsapp-template.service.js) · integration · Validates and resolves template send data.
- [server/services/template-variable-resolver.service.js](../../server/services/template-variable-resolver.service.js) · integration · Resolves selected learner, guardian and payment variables.

**Related pull requests**

—

### COM-006 · WhatsApp history, timelines and event review

Review provider outcomes and inbound or status events, link student/lead history, and reprocess permitted failed events.

**Institution operations / Parent and staff communication / Communication** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/WhatsAppSendHistory.jsx](../../src/pages/WhatsAppSendHistory.jsx) · frontend · Staff history screen lists send outcomes and opens event detail.
- [server/routes/whatsappTemplates.routes.js](../../server/routes/whatsappTemplates.routes.js) · backend · Messages, event details, student/lead timelines and reprocess endpoints.
- [server/db.js](../../server/db.js) · database · whatsapp_template_messages and whatsapp_webhook_events store outcomes and callback history.
- [server/services/whatsapp-status.service.js](../../server/services/whatsapp-status.service.js) · integration · Maps provider status transitions and callback details.

**Related pull requests**

—

### COM-007 · Legacy message templates and automation logs

Maintain generic outbound message text and track generated attendance, fee, discipline and follow-up automation events.

**Institution operations / Parent and staff communication / Communication** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Automation.jsx](../../src/pages/Automation.jsx) · frontend · Shows template editor, triggers and automation history.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Legacy template CRUD and automation event list/status mutation endpoints.
- [server/db.js](../../server/db.js) · database · message_templates and automation_logs carry legacy message and event records.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Selected fee, attendance and follow-up automation ownership checks.

**Related pull requests**

—

## ENQ-001 · Institute website enquiry capture

Show a tenant's public branches and submit an enquiry into that tenant's admissions pipeline.

**Admissions / Enquiry capture / Public enquiry** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/EnquiryPage.jsx](../../src/pages/EnquiryPage.jsx) · frontend · Public form reads tenant, campaign and source and loads the tenant's branches.
- [server/routes/publicEnquiry.routes.js](../../server/routes/publicEnquiry.routes.js) · backend · Mounted branch lookup, honeypot, branch ownership and lead insert.
- [server/index.js](../../server/index.js) · security · Public enquiry rate limit and JSON body size enforcement.
- [server/db.js](../../server/db.js) · database · Admissions and branch tables retain enquiry ownership and attribution.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4); [#5](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/5); [#7](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/7)

### ENQ-002 · Public duplicate response privacy

Warn the submitter about a matching enquiry without returning the matching lead record.

**Admissions / Enquiry capture / Public enquiry** · INCOMPLETE · APPROVED

**Source evidence**

- [server/routes/publicEnquiry.routes.js](../../server/routes/publicEnquiry.routes.js) · security · Conflict JSON contains a boolean, code and warning. Matching lead rows stay server-side.
- [server/services/duplicateLead.service.js](../../server/services/duplicateLead.service.js) · backend · Tenant-scoped matching by normalized phone and name.
- [src/pages/EnquiryPage.jsx](../../src/pages/EnquiryPage.jsx) · frontend · Duplicate confirmation flow currently offers create anyway.
- [server/services/duplicateLead.service.js](../../server/services/duplicateLead.service.js) · security · Public warning formatter incorporates the matching record's creation date when present.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4); [#5](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/5); [#7](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/7)

### ENQ-003 · Consented school website intake contract

Record explicit consent and approved source metadata for website-origin enquiries with a consistent duplicate response.

**Admissions / Enquiry capture / School website bridge** · INCOMPLETE · PROPOSED

**Source evidence**

- [server/routes/publicEnquiry.routes.js](../../server/routes/publicEnquiry.routes.js) · backend · Main accepts source and campaign but its public insert does not record explicit consent.
- [src/pages/EnquiryPage.jsx](../../src/pages/EnquiryPage.jsx) · frontend · Existing standalone public form provides a baseline for aligning website requirements.

**Related pull requests**

[#5](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/5)

### ENQ-004 · SSKEMS server-to-server enquiry bridge

Accept enquiries from the SSKEMS website backend and route them to its configured CRM tenant and branch.

**Admissions / Enquiry capture / School website bridge** · NOT_BUILT · PROPOSED

**Source evidence**

- [server/index.js](../../server/index.js) · backend · Main mounts general public intake only. The keyed school adapter is in open PR #7.
- [server/routes/publicEnquiry.routes.js](../../server/routes/publicEnquiry.routes.js) · backend · Existing shared admissions intake provides the overlap baseline.

**Related pull requests**

[#7](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/7)

## EXM-000 · Assessment and performance operations

Schedule exams, capture results and use performance observations to guide teaching and support.

**Institution operations / Assessment / Exams and performance** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Academic.jsx](../../src/pages/Academic.jsx) · frontend · Class test planning and results.
- [src/pages/TestPerformance.jsx](../../src/pages/TestPerformance.jsx) · frontend · Detailed testing and performance dashboard.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Mounted /api/academic test and /api/test-performance route groups.
- [server/db.js](../../server/db.js) · database · Academic test calendar/result and performance workflow tables.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Checks selected test performance, parent reports, remediation and OMR records for tenant isolation.

**Related pull requests**

—

### EXM-001 · Class test calendar

Schedule tests by date, class and subject with status and marks criteria.

**Institution operations / Assessment / Exams and performance** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Academic.jsx](../../src/pages/Academic.jsx) · frontend · Test Calendar form and results widgets.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Legacy academic test create, list and delete endpoints.
- [server/db.js](../../server/db.js) · database · test_calendars stores teacher/class test schedules.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Checks tenant ownership for legacy academic assessment and result endpoints.

**Related pull requests**

—

### EXM-002 · Class test results

Record learner marks, attempts, accuracy and teacher feedback for class tests.

**Institution operations / Assessment / Exams and performance** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Academic.jsx](../../src/pages/Academic.jsx) · frontend · Performance analysis accepts marks and assessment context.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Academic test-result creation, listing and deletion use tenant predicates.
- [server/db.js](../../server/db.js) · database · student_test_results references test and student rows.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Checks tenant ownership for legacy academic assessment and result endpoints.

**Related pull requests**

—

### EXM-003 · Detailed performance test definitions

Configure tests with duration, subjects, questions, marks, negative marking and result date.

**Institution operations / Assessment / Exams and performance** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/TestPerformance.jsx](../../src/pages/TestPerformance.jsx) · frontend · Detailed test form and test summaries.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Test-performance tests create/list/delete and generate exam codes.
- [server/db.js](../../server/db.js) · database · performance_tests stores richer exam definitions.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Checks selected test performance, parent reports, remediation and OMR records for tenant isolation.

**Related pull requests**

—

### EXM-004 · Detailed exam results, rankings and accuracy

Enter per-subject results and calculate percentages, accuracy and comparative student performance.

**Institution operations / Assessment / Exams and performance** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/TestPerformance.jsx](../../src/pages/TestPerformance.jsx) · frontend · Student Performance form records subject marks and answer counts.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Detailed result entry links approved test and learner, calculates metrics and can add remediation.
- [server/db.js](../../server/db.js) · database · performance_results stores detailed score and accuracy fields.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Checks selected test performance, parent reports, remediation and OMR records for tenant isolation.

**Related pull requests**

—

### EXM-005 · Question-level analysis

Record response outcomes by exam, learner, question, topic and awarded marks.

**Institution operations / Assessment / Exams and performance** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/TestPerformance.jsx](../../src/pages/TestPerformance.jsx) · frontend · Question analysis form and detailed record list.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Question analysis create/list/delete routes.
- [server/db.js](../../server/db.js) · database · question_analysis stores selected options and marks metadata.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Checks selected test performance, parent reports, remediation and OMR records for tenant isolation.

**Related pull requests**

—

### EXM-006 · Exam reports to parents

Record learner exam summaries, responsible sender, intended channel and report state.

**Institution operations / Assessment / Exams and performance** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/TestPerformance.jsx](../../src/pages/TestPerformance.jsx) · frontend · Parent Report form and sent/report logs.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Parent report creation stores report fields and contact information.
- [server/db.js](../../server/db.js) · database · parent_report_logs stores report snapshots and status.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Checks selected test performance, parent reports, remediation and OMR records for tenant isolation.

**Related pull requests**

—

### EXM-007 · Teacher exam impact analysis

Capture before/after exam averages, weak topics, homework and doubt-resolution metrics.

**Institution operations / Assessment / Exams and performance** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/TestPerformance.jsx](../../src/pages/TestPerformance.jsx) · frontend · Teacher impact form and performance dashboard show recorded changes.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Impact create/list/delete computes improvement percentage.
- [server/db.js](../../server/db.js) · database · teacher_result_impact stores exam-linked teacher impact data.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Checks selected test performance, parent reports, remediation and OMR records for tenant isolation.
- [scripts/smoke-test.mjs](../../scripts/smoke-test.mjs) · test · Smoke verifies a teacher impact sample produces the expected 16-point improvement.

**Related pull requests**

—

### EXM-008 · Exam remediation and follow-up

Track weak subjects and chapters, assigned teacher, intervention date and follow-up test.

**Institution operations / Assessment / Exams and performance** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/TestPerformance.jsx](../../src/pages/TestPerformance.jsx) · frontend · Remedial Students form and roster.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Remedial students endpoints and exam results can create intervention records.
- [server/db.js](../../server/db.js) · database · remedial_students stores assessment-specific interventions.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Checks selected test performance, parent reports, remediation and OMR records for tenant isolation.

**Related pull requests**

—

### EXM-009 · OMR intake history

Store OMR file names, processing counters, upload status and notes alongside an exam.

**Institution operations / Assessment / Exams and performance** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/TestPerformance.jsx](../../src/pages/TestPerformance.jsx) · frontend · OMR Upload Log is a metadata form with manually entered counts.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · OMR route inserts metadata and validates the owned test reference.
- [server/db.js](../../server/db.js) · database · omr_uploads stores filenames, counters and status logs.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Checks selected test performance, parent reports, remediation and OMR records for tenant isolation.

**Related pull requests**

—

### EXM-010 · OMR parsing and score reconciliation

Process uploaded machine-readable answer files into reviewed exam scores with error reporting.

**Institution operations / Assessment / Exams and performance** · NOT_BUILT · PROPOSED

**Source evidence**

- [src/pages/TestPerformance.jsx](../../src/pages/TestPerformance.jsx) · frontend · Current form records filename and manual counts.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · The OMR endpoint accepts metadata. Automated parsing was not found in the inspected route.
- [server/db.js](../../server/db.js) · database · omr_uploads is an intake log. It does not establish answer-file storage or parser results.

**Related pull requests**

—

### EXM-011 · Exam performance dashboard

Surface test volumes, score distribution, pass rate, remediation and recorded OMR accuracy.

**Institution operations / Assessment / Exams and performance** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/TestPerformance.jsx](../../src/pages/TestPerformance.jsx) · frontend · Dashboard metrics and cards summarize testing and interventions.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · testPerformanceDashboard aggregates data scoped to tenant.
- [server/db.js](../../server/db.js) · database · Reads performance_tests, performance_results and related summaries.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Checks selected test performance, parent reports, remediation and OMR records for tenant isolation.

**Related pull requests**

—

## FEE-001 · Course fee structures and installment templates

Maintain tenant-owned course pricing templates with installment amounts and due-day offsets.

**Finance / Student fees / Fee structures** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/FeeStructuresPage.jsx](../../src/pages/FeeStructuresPage.jsx) · frontend · Create and archive templates and define installment amounts and due offsets.
- [server/routes/feeStructures.routes.js](../../server/routes/feeStructures.routes.js) · backend · Mounted tenant finance routes validate template and installment totals.
- [server/services/defaultFeeStructures.service.js](../../server/services/defaultFeeStructures.service.js) · backend · Seeds default structures for a tenant.
- [server/migrations/015-fee-structure-templates.js](../../server/migrations/015-fee-structure-templates.js) · database · Creates fee structure installment templates and related columns.
- [scripts/smoke-test.mjs](../../scripts/smoke-test.mjs) · test · Creates a fixture fee template and uses it to build a normalized student plan.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### FEE-002 · Legacy fee plans, components and installments

Create and edit a student invoice with fee components, discounts, due dates and installment schedule.

**Finance / Student fees / Fee planning** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/Fees.jsx](../../src/pages/Fees.jsx) · frontend · Fee plan editor includes components, payment type, manual installment schedule and discounts.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Creates, updates and deletes legacy fee plan and child rows.
- [server/db.js](../../server/db.js) · database · Legacy fee_plans, fee_components and fee_installments tables.
- [scripts/smoke-test.mjs](../../scripts/smoke-test.mjs) · test · Exercises legacy plan creation and balance calculations.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

#### FEE-004 · Manual collection and cancellation

Record cash, bank or other offline payments, compute pending balances and audit cancellations.

**Finance / Collections / Manual payments** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/Fees.jsx](../../src/pages/Fees.jsx) · frontend · Collection form, receipt selection and cancellation controls.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Legacy fee payment post, lookup and soft cancellation with audit and balance recalculation.
- [server/routes/fees.routes.js](../../server/routes/fees.routes.js) · backend · Normalized payment entry route calls the fee ledger.
- [server/services/feeLedger.service.js](../../server/services/feeLedger.service.js) · backend · Transactional normalized payment, installment balance and receipt flow.
- [scripts/smoke-test.mjs](../../scripts/smoke-test.mjs) · test · Fixture collection adds expected paid and due balances.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4); [#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

##### FEE-006 · Legacy printable collection receipt

Render a printable browser receipt from the authorized collected payment.

**Finance / Collections / Receipts** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/Fees.jsx](../../src/pages/Fees.jsx) · frontend · Legacy receipt print view and template logic.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Creates a payment receipt record and returns printable payload.
- [server/db.js](../../server/db.js) · database · Legacy fee_receipts records store receipt number, type and payment ID.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4); [#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

##### FEE-007 · Tenant-bound receipt PDF generation and download

Create and serve PDF receipts scoped to the institution's file namespace and payment record.

**Finance / Collections / Receipts** · PARTIAL · APPROVED

**Source evidence**

- [server/services/receiptPdf.service.js](../../server/services/receiptPdf.service.js) · backend · Random non-overwriting files under tenant directories. Signature inputs constrained to tenant assets.
- [server/routes/fees.routes.js](../../server/routes/fees.routes.js) · security · Authorized tenant record and canonical path required to download.
- [server/tests/receipt-pdf.tenant.test.js](../../server/tests/receipt-pdf.tenant.test.js) · test · Real PostgreSQL and HTTP assertions for authorized downloads, path containment, signature isolation and duplicate number failure.
- [docs/development/a04-tenant-isolation.md](../../docs/development/a04-tenant-isolation.md) · docs · Describes historical PDF restrictions, identifier collision and operational boundaries.

**Related pull requests**

[#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

###### FEE-008 · Independent tenant receipt numbering

Allow separate institutions to issue the same display receipt number without a database conflict or file collision.

**Finance / Collections / Receipts** · INCOMPLETE · APPROVED

**Source evidence**

- [server/db.js](../../server/db.js) · database · fee_receipts still has global receiptNumber uniqueness.
- [server/services/feeLedger.service.js](../../server/services/feeLedger.service.js) · backend · Obtains the tenant's own receipt counter and prefix before inserting receipt.
- [server/tests/receipt-pdf.tenant.test.js](../../server/tests/receipt-pdf.tenant.test.js) · test · Proves the second tenant's conflicting insert rolls back and leaves the first PDF unchanged.
- [docs/development/a04-tenant-isolation.md](../../docs/development/a04-tenant-isolation.md) · docs · Documents distinct prefix mitigation and remaining schema migration.
- [server/services/receiptPdf.service.js](../../server/services/receiptPdf.service.js) · security · Random files isolate tenant PDF data during interrupted issuance.

**Related pull requests**

[#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

##### FEE-012 · Balances, defaulters and aging

Display institution collections, overdue and pending balances, student due lists and installment aging buckets.

**Finance / Collections / Fee reporting** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/Fees.jsx](../../src/pages/Fees.jsx) · frontend · Fee dashboard, reports and collection priorities.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Legacy finance summary and fee reports with tenant-filtered data.
- [server/routes/fees.routes.js](../../server/routes/fees.routes.js) · backend · Normalized defaulter aging endpoint with tenant-qualified installment joins.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Finance report/reminder/automation/audit fixture tenant-scope checks.
- [scripts/smoke-test.mjs](../../scripts/smoke-test.mjs) · test · Assert a fixture payment appears in collected totals.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

###### FEE-013 · Due reminders, promises and collection follow-up

Track reminder history and collection promises and prepare permitted due/overdue notifications.

**Finance / Collections / Fee reminders** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/Fees.jsx](../../src/pages/Fees.jsx) · frontend · Record reminder delivery, collection follow-up and promise dates, copy content and trigger fee automation.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Fee reminder routes, candidate selection, deduplication and fee audit.
- [server/services/whatsapp-template.service.js](../../server/services/whatsapp-template.service.js) · integration · Provider template send path for eligible reminders.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Checks finance reminder and automation data stay in authenticated tenant.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

##### FEE-014 · Fee transaction audit history

Show scoped records of fee plan adjustments, payment posting and cancellation for permitted finance operators.

**Finance / Collections / Fee audits** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Fees.jsx](../../src/pages/Fees.jsx) · frontend · Loads and displays fee audit records.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Writes legacy audit snapshots and restricts audit log reads.
- [server/services/auditLog.service.js](../../server/services/auditLog.service.js) · backend · Normalized fee ledger records state changes through shared audit service.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Finance audit rows stay scoped in synthetic route tests.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

#### FEE-005 · Discount request and approval lifecycle

Request, approve, reject, cancel and apply fixed or percentage discounts with evidence and audit history.

**Finance / Student fees / Discounts** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/Fees.jsx](../../src/pages/Fees.jsx) · frontend · Discount request and action dialogs.
- [server/routes/discountRequests.routes.js](../../server/routes/discountRequests.routes.js) · backend · Scoped discount transitions, invoice apply and audit endpoints.
- [server/db.js](../../server/db.js) · database · Discount request and audit tables.
- [scripts/smoke-test.mjs](../../scripts/smoke-test.mjs) · test · Exercises a request, approval, application, audit link, rejection/cancellation and forbidden roles.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### FEE-003 · Normalized student plans and schedules

Generate tenant-owned student plans and installments from active fee structures through the fee ledger.

**Finance / Student fees / Fee planning** · PARTIAL · APPROVED

**Source evidence**

- [server/routes/fees.routes.js](../../server/routes/fees.routes.js) · backend · Owned student plan creation, list and read APIs.
- [server/services/feeLedger.service.js](../../server/services/feeLedger.service.js) · backend · Builds installment schedule and persists plan and lines in a transaction.
- [server/services/installmentSchedule.service.js](../../server/services/installmentSchedule.service.js) · backend · Generates payable amounts and due dates.
- [server/db.js](../../server/db.js) · database · student_fee_plans and student_fee_installments tables.
- [src/pages/Admissions.jsx](../../src/pages/Admissions.jsx) · frontend · Current conversion creates a legacy fee plan.
- [server/tests/payment-webhook.tenant.test.js](../../server/tests/payment-webhook.tenant.test.js) · test · Uses normalized plans to verify payment posting on disposable PostgreSQL.
- [scripts/smoke-test.mjs](../../scripts/smoke-test.mjs) · test · Creates a three-installment normalized student plan and asserts that amounts sum to its fixture fee.

**Related pull requests**

[#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

#### FEE-010 · Razorpay payment link generation, delivery and cancellation

Create or reuse a payment link for a tenant's installment, send it and cancel it through permitted controls.

**Finance / Collections / Provider payment links** · PARTIAL · OBSERVED

**Source evidence**

- [server/routes/paymentLinks.routes.js](../../server/routes/paymentLinks.routes.js) · backend · Finance/nonpublic link list, issue, send and cancel operations.
- [server/services/razorpay.service.js](../../server/services/razorpay.service.js) · integration · Creates provider links using configured Razorpay client credentials.
- [server/db.js](../../server/db.js) · database · Persists link, installment, provider handle, amount and status.

**Related pull requests**

—

##### FEE-011 · Signed Razorpay callbacks and ledger posting

Accept signed link, capture and refund events bound to the locally registered payment target and tenant.

**Finance / Collections / Provider payment links** · PARTIAL · APPROVED

**Source evidence**

- [server/routes/razorpayWebhook.routes.js](../../server/routes/razorpayWebhook.routes.js) · security · Selects verification credentials by registered target, checks signatures and isolates mutations/event IDs.
- [server/services/feeLedger.service.js](../../server/services/feeLedger.service.js) · backend · Owned payment duplicate lookup and transactional receipt posting.
- [server/tests/payment-webhook.tenant.test.js](../../server/tests/payment-webhook.tenant.test.js) · test · Exercise positive and denied callback cases, tenant event IDs, payment and refund updates on disposable PostgreSQL.
- [docs/development/a04-tenant-isolation.md](../../docs/development/a04-tenant-isolation.md) · docs · Records account and operator credential requirements and residual risks.

**Related pull requests**

[#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

### FEE-009 · Tenant fee preferences and Razorpay credential storage

Store per-tenant fees, numbering, installment defaults, discount thresholds and encrypted provider secrets.

**Finance / Collections / Provider settings** · PARTIAL · OBSERVED

**Source evidence**

- [server/routes/tenantFeeSettings.routes.js](../../server/routes/tenantFeeSettings.routes.js) · backend · Read and update tenant fee settings through guarded API.
- [server/services/tenantFeeSettings.service.js](../../server/services/tenantFeeSettings.service.js) · security · Encrypts configured provider secret data and returns public flags rather than secret fields.
- [server/db.js](../../server/db.js) · database · Tenant fee settings and encrypted credential columns.
- [server/tests/payment-webhook.tenant.test.js](../../server/tests/payment-webhook.tenant.test.js) · test · Uses isolated settings and keys for two tenants.

**Related pull requests**

[#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

## FIN-001 · Expense request, approval and payment

Enter business expenses, record bills and approve, reject or pay them through role-based actions.

**Finance / Expenses and accounting / Expenses** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Expenses.jsx](../../src/pages/Expenses.jsx) · frontend · Expense entry and status controls.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Active mounted expense and approval routes.
- [server/db.js](../../server/db.js) · database · Vendor, expense, recurring template and petty cash tables.
- [scripts/smoke-test.mjs](../../scripts/smoke-test.mjs) · test · Creates, approves and pays a fixture expense and denies selected roles.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### FIN-002 · Vendor directory

Maintain institutional vendor contacts and connect expenses to those records.

**Finance / Expenses and accounting / Vendor records** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Expenses.jsx](../../src/pages/Expenses.jsx) · frontend · Vendor list and editor used by expense forms.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Vendor CRUD and joins into expense and expense reports.
- [server/db.js](../../server/db.js) · database · Vendors carry tenant ownership and expenses carry optional vendor ID.

**Related pull requests**

—

### FIN-003 · Recurring expense templates and period generation

Create recurring templates and generate due expense entries for a selected month.

**Finance / Expenses and accounting / Recurring expenses** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Expenses.jsx](../../src/pages/Expenses.jsx) · frontend · Recurring expense editor and month generation controls.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Template CRUD and generate recurring expenses operation.
- [server/db.js](../../server/db.js) · database · Recurring expense template and generated expense metadata.
- [scripts/smoke-test.mjs](../../scripts/smoke-test.mjs) · test · Creates a recurring salary fixture template and verifies period generation.

**Related pull requests**

—

### FIN-004 · Petty cash entries and cash expense linkage

Record incoming/outgoing petty cash and link eligible paid expenses to the cash ledger.

**Finance / Expenses and accounting / Petty cash** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Expenses.jsx](../../src/pages/Expenses.jsx) · frontend · Petty cash form and balance display.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Petty cash entries and linked expense side effects.
- [server/db.js](../../server/db.js) · database · petty_cash_entries keeps institution and expense references.
- [scripts/smoke-test.mjs](../../scripts/smoke-test.mjs) · test · Records cash fixture entries alongside expense creation.

**Related pull requests**

—

### FIN-005 · Expense, income and profit reporting

Report expenditure, branch and vendor breakdowns, liabilities and course fee income for selected periods.

**Finance / Expenses and accounting / Financial reports** · INCOMPLETE · OBSERVED

**Source evidence**

- [src/pages/Expenses.jsx](../../src/pages/Expenses.jsx) · frontend · Expense report cards, category and vendor tables, salary and marketing views.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Month reports derive paid expenses and fee income and attach vendor details.
- [scripts/smoke-test.mjs](../../scripts/smoke-test.mjs) · test · Checks the fixture month report contains the expected baseline expense amount.
- [src/pages/Reports.jsx](../../src/pages/Reports.jsx) · frontend · Cross-module finance summaries consume existing fee and expense reports.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### FIN-006 · Double-entry accounting and reconciliation

Future integrated chart of accounts, balanced postings, journal history and bank reconciliation.

**Finance / Expenses and accounting / Accounting expansion** · NOT_BUILT · PROPOSED

**Source evidence**

- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Existing financial report and paid expense paths are candidates for input to a future approved accounting model.

**Related pull requests**

—

## GOV-001 · Canonical feature registry and review gate

Track approved requirements, observed implementation, verified acceptance and release gates on permanent feature IDs.

**Platform foundation / Product governance / Feature governance** · PARTIAL · APPROVED

**Source evidence**

- [docs/product/feature-registry.schema.json](../../docs/product/feature-registry.schema.json) · docs · Defines mandatory feature and history fields.
- [scripts/generate-feature-reports.mjs](../../scripts/generate-feature-reports.mjs) · ops · Derives Markdown reports and Excel matrix from the registry.
- [scripts/validate-feature-registry.mjs](../../scripts/validate-feature-registry.mjs) · test · Checks schema, evidence, required relationships and history consistency.
- [scripts/product-governance.test.mjs](../../scripts/product-governance.test.mjs) · test · Tests status assertions, PR declaration validation, and deterministic report generation.
- [scripts/check-feature-coverage.mjs](../../scripts/check-feature-coverage.mjs) · ops · Compares PR declarations and appended history with the base registry.
- [.github/workflows/verify.yml](../../.github/workflows/verify.yml) · ci · Runs product checks within the required integration job.
- [.github/workflows/feature-governance.yml](../../.github/workflows/feature-governance.yml) · ci · Records the validated registry digest and revision on main.
- [AGENTS.md](../../AGENTS.md) · docs · Makes registry consultation part of future feature implementation.

**Related pull requests**

[#8](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/8)

## HR-000 · Staff operations and compensation

Track staff attendance, leave and teacher compensation operations.

**Institution operations / Human resources / HR and payroll** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Attendance.jsx](../../src/pages/Attendance.jsx) · frontend · Staff attendance and leave workflow.
- [src/pages/Expenses.jsx](../../src/pages/Expenses.jsx) · frontend · Teacher salary generation and payment controls.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Staff attendance, leave requests, recurring expenses and expense updates provide backend operations.
- [server/db.js](../../server/db.js) · database · Staff attendance, leave, and expense-related salary fields.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Role and tenant regressions exercise teacher operations, staff attendance and leave isolation.

**Related pull requests**

—

### HR-001 · Staff attendance check-in and checkout

Capture classroom staff arrival and departure, lateness and daily/monthly summaries.

**Institution operations / Human resources / HR and payroll** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Attendance.jsx](../../src/pages/Attendance.jsx) · frontend · Staff attendance panel includes check-in/out and monthly summaries.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Staff attendance check-in, check-out, today and monthly report routes.
- [server/db.js](../../server/db.js) · database · staff_attendance_records includes check-in/out, timestamps, actor and flags.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Role and tenant regressions exercise teacher operations, staff attendance and leave isolation.

**Related pull requests**

—

### HR-002 · Staff leave requests and decisions

Capture date-range leave requests, reasons, required manager decisions and history.

**Institution operations / Human resources / HR and payroll** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Attendance.jsx](../../src/pages/Attendance.jsx) · frontend · Attendance page supports leave workflows.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Leave request list/create/approve/reject endpoints.
- [server/db.js](../../server/db.js) · database · leave_requests stores dates, reason, requester and decision details.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Role and tenant regressions exercise teacher operations, staff attendance and leave isolation.

**Related pull requests**

—

### HR-003 · Teacher salary expense templates and generation

Create recurring teacher salary templates and generate monthly salary expenses.

**Institution operations / Human resources / HR and payroll** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Expenses.jsx](../../src/pages/Expenses.jsx) · frontend · Salary template seed and generation actions create monthly salary expenses.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Legacy recurring expense and expense create/update endpoints underlie generation.
- [server/db.js](../../server/db.js) · database · recurring_expense_templates and expenses store salary records and metadata.

**Related pull requests**

—

### HR-004 · Attendance deductions, salary payment and print slip

Suggest attendance-based deductions, record bonuses and payment details, and issue a printable salary slip.

**Institution operations / Human resources / HR and payroll** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Expenses.jsx](../../src/pages/Expenses.jsx) · frontend · Salary edit, deduction suggestions and printSalarySlip are implemented in the expenses page.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Staff monthly attendance and expense update routes provide data for salary edits.
- [server/db.js](../../server/db.js) · database · Expense fields store salary gross, deductions, bonus, net paid and payment metadata.

**Related pull requests**

—

### HR-005 · Managed payroll cycle and employee self-service

Coordinate approved payroll cycles with auditable finalization and individual access to payslips.

**Institution operations / Human resources / HR and payroll** · NOT_BUILT · PROPOSED

**Source evidence**

- [src/pages/Expenses.jsx](../../src/pages/Expenses.jsx) · frontend · Existing action creates a client-rendered teacher salary slip.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Legacy expense and staff attendance operations provide input records. A managed payroll-cycle lifecycle was not observed.

**Related pull requests**

—

## IAM-001 · Institute identity lifecycle

Manage institute authentication, sessions, verification, recovery and server roles.

**Platform foundation / Identity and access / Identity and RBAC** · PARTIAL · APPROVED

**Source evidence**

- [src/components/AuthBar.jsx](../../src/components/AuthBar.jsx) · frontend · Institute login, registration visibility, account controls and password change.
- [server/routes/auth.routes.js](../../server/routes/auth.routes.js) · backend · Institute authentication, credential changes, verification and one-time token acceptance.
- [server/middleware/auth.js](../../server/middleware/auth.js) · security · Verifies bearer JWT and carries role, tenant and session claims.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### IAM-002 · Institute login, refresh and logout

Sign in tenant users, refresh short-lived JWT access through stored sessions and revoke refresh sessions on logout.

**Platform foundation / Identity and access / Identity and RBAC** · PARTIAL · APPROVED

**Source evidence**

- [src/components/AuthBar.jsx](../../src/components/AuthBar.jsx) · frontend · Logs in and out and exposes current authenticated identity.
- [src/api.js](../../src/api.js) · frontend · Implements tenant API token handling and authentication functions.
- [server/routes/auth.routes.js](../../server/routes/auth.routes.js) · backend · Login, refresh and logout handlers validate tenant access and persist or revoke session rows.
- [server/db.js](../../server/db.js) · database · Defines user_sessions, tenant_subscriptions and user lifecycle metadata.
- [tests/ui/app.spec.js](../../tests/ui/app.spec.js) · test · Admin login, dashboard and logout browser path.
- [server/services/token.service.js](../../server/services/token.service.js) · security · Signs access tokens and implements opaque token primitives.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### IAM-003 · Active-session authorization and revocation

Recheck account and session state when supplied credentials may be stale.

**Platform foundation / Identity and access / Identity and RBAC** · INCOMPLETE · APPROVED

**Source evidence**

- [server/middleware/auth.js](../../server/middleware/auth.js) · security · Bearer middleware reads role and email verification from signed access token claims.
- [server/routes/auth.routes.js](../../server/routes/auth.routes.js) · backend · Refresh and credential changes inspect or revoke stored sessions.
- [server/db.js](../../server/db.js) · database · User session rows include expiry and revocation metadata.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### IAM-004 · Password change and recovery

Change authenticated passwords and use expiring one-time email reset tokens for forgotten credentials.

**Platform foundation / Identity and access / Identity and RBAC** · PARTIAL · APPROVED

**Source evidence**

- [src/components/AuthBar.jsx](../../src/components/AuthBar.jsx) · frontend · Provides signed-in password change.
- [server/routes/auth.routes.js](../../server/routes/auth.routes.js) · backend · Implements change-password, forgot-password and reset-password endpoints.
- [server/db.js](../../server/db.js) · database · Stores password reset tokens and session revocation fields.
- [server/services/password.service.js](../../server/services/password.service.js) · backend · Password hashing and validation helpers.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### IAM-005 · Staff user and role management

List institute users, create staff and update roles under tenant and management guards.

**Platform foundation / Identity and access / Identity and RBAC** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/Ontology.jsx](../../src/pages/Ontology.jsx) · frontend · Includes user list, create and role-management UI.
- [server/routes/users.routes.js](../../server/routes/users.routes.js) · backend · Tenant-owned user listing, counsellor selection, creation and role updates.
- [server/config/roles.js](../../server/config/roles.js) · security · Defines accepted tenant roles and role groups.
- [server/middleware/verified-email.js](../../server/middleware/verified-email.js) · security · Sensitive user mutations require verified email.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### IAM-006 · Server RBAC and field-level student privacy

Enforce server roles and data minimization for students, guardians, fees, documents and communications.

**Platform foundation / Identity and access / Identity and RBAC** · PARTIAL · APPROVED

**Source evidence**

- [server/middleware/rbac.js](../../server/middleware/rbac.js) · security · Role group checks run on protected endpoints.
- [server/middleware/student-data-access.js](../../server/middleware/student-data-access.js) · security · Defines role-specific access policy for student payloads and routes.
- [server/routes/students.routes.js](../../server/routes/students.routes.js) · backend · Adds role-aware student and follow-up serialization.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Role and assignment-specific denial and reduced DTO regressions.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4); [#10](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/10); [#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

### IAM-007 · Expiring staff invitation

Queue a tenant-bound role invitation and accept it once using an expiring email token.

**Platform foundation / Identity and access / Identity and RBAC** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/AcceptInvitePage.jsx](../../src/pages/AcceptInvitePage.jsx) · frontend · Accepts an invite through the link flow.
- [server/routes/invites.routes.js](../../server/routes/invites.routes.js) · backend · Verified management actors create role-limited invites with durable outbox records.
- [server/routes/auth.routes.js](../../server/routes/auth.routes.js) · backend · Transactional acceptance claims only an unused, eligible invite.
- [server/db.js](../../server/db.js) · database · Stores hashed staff invitation tokens and lifecycle data.
- [server/tests/email-outbox.lifecycle.test.js](../../server/tests/email-outbox.lifecycle.test.js) · test · Revoked invite delivery and owner role exclusion covered in lifecycle suite.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### IAM-008 · Legacy registration and bootstrap controls

Contain default-tenant registration and one-time administrator bootstrap paths.

**Platform foundation / Identity and access / Identity and RBAC** · PARTIAL · APPROVED

**Source evidence**

- [src/components/AuthBar.jsx](../../src/components/AuthBar.jsx) · frontend · Shows registration only when the configuration enables it.
- [server/routes/auth.routes.js](../../server/routes/auth.routes.js) · backend · Register remains gated by configuration and bootstrap is protected by deployment secret and tenant-admin checks.
- [server/config/env.js](../../server/config/env.js) · security · Validates bootstrap secret and registration settings.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Exposes configuration for legacy registration visibility.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

## MKT-001 · Lead source and campaign attribution

Capture website or operator-entered source and campaign values on leads and preserve them through conversion.

**Admissions / Growth and attribution / Campaign attribution** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/EnquiryPage.jsx](../../src/pages/EnquiryPage.jsx) · frontend · Public form passes source and campaign query inputs.
- [src/pages/Admissions.jsx](../../src/pages/Admissions.jsx) · frontend · Staff can set campaign and source and conversion includes admission source.
- [server/routes/admissions.routes.js](../../server/routes/admissions.routes.js) · backend · Persists source and campaign on admission create/update.
- [server/migrations/014-admission-assignment-duplicates-campaigns.js](../../server/migrations/014-admission-assignment-duplicates-campaigns.js) · database · Adds normalized lead source fields and campaign table.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4); [#5](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/5); [#7](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/7)

### MKT-002 · Marketing campaign budget records

Create and list tenant marketing campaigns with branch, source, dates and spend inputs.

**Admissions / Growth and attribution / Campaign management** · PARTIAL · OBSERVED

**Source evidence**

- [server/routes/sourceAnalytics.routes.js](../../server/routes/sourceAnalytics.routes.js) · backend · Marketing campaign list and create routes scoped to the current tenant.
- [server/db.js](../../server/db.js) · database · marketing_campaigns stores source, branch, dates, active flag and spend.

**Related pull requests**

—

### MKT-003 · Source conversion and acquisition report

Report leads, conversion, estimated revenue, campaign spend and cost per admission by source.

**Admissions / Growth and attribution / Source analytics** · INCOMPLETE · OBSERVED

**Source evidence**

- [server/routes/sourceAnalytics.routes.js](../../server/routes/sourceAnalytics.routes.js) · backend · Date- and branch-filtered source aggregate with tenant-correlated campaign join.
- [server/db.js](../../server/db.js) · database · Admissions and marketing campaign tables provide aggregates.
- [src/pages/Reports.jsx](../../src/pages/Reports.jsx) · frontend · Source analytics page displays conversion rate, spend and cost per admission.

**Related pull requests**

—

## MSG-001 · Messaging delivery infrastructure

Provide durable system email and authenticated WhatsApp transport for enrolled institutes.

**Platform foundation / Delivery infrastructure / Messaging infrastructure** · PARTIAL · APPROVED

**Source evidence**

- [server/services/mail.service.js](../../server/services/mail.service.js) · integration · Nodemailer delivery and template mail methods.
- [server/services/email-outbox.service.js](../../server/services/email-outbox.service.js) · backend · Durable queue state with retries and lifecycle validation.
- [server/services/whatsapp-provider.service.js](../../server/services/whatsapp-provider.service.js) · integration · Meta Graph API transport for official templates.
- [server/routes/whatsappWebhook.routes.js](../../server/routes/whatsappWebhook.routes.js) · integration · Challenge and signed callbacks.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### MSG-002 · SMTP email transport

Send transactional verification, password reset, invitation and recovery email over configured Nodemailer SMTP.

**Platform foundation / Delivery infrastructure / Messaging infrastructure** · PARTIAL · APPROVED

**Source evidence**

- [server/services/mail.service.js](../../server/services/mail.service.js) · integration · Validates SMTP config, constructs transactional emails and checks recipient acceptance.
- [server/config/env.js](../../server/config/env.js) · security · Canonical delivery configuration for transport host, port, secure mode and credentials.
- [server/tests/mail.service.integration.test.js](../../server/tests/mail.service.integration.test.js) · test · Includes actual Nodemailer SMTP transport against a mock server.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### MSG-003 · Durable email outbox and retries

Persist transactional emails and process temporary failures, job claims, redaction and stale-lock recovery.

**Platform foundation / Delivery infrastructure / Messaging infrastructure** · PARTIAL · APPROVED

**Source evidence**

- [server/services/email-outbox.service.js](../../server/services/email-outbox.service.js) · backend · Claims messages, validates sendability, retries or cancels, mirrors delivery state and removes sensitive payload where appropriate.
- [scripts/process-email-outbox.mjs](../../scripts/process-email-outbox.mjs) · ops · Runs a due-job processing pass.
- [server/index.js](../../server/index.js) · backend · Starts configurable in-process outbox worker.
- [server/db.js](../../server/db.js) · database · Email outbox retry, processing, payload, failure and delivery fields.
- [server/tests/email-outbox.lifecycle.test.js](../../server/tests/email-outbox.lifecycle.test.js) · test · Retry, stale processing, concurrency and sensitive payload cleanup tests.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### MSG-004 · Delivery queue lifecycle observability

Inspect transactional message delivery state, retry exhaustion and stale work using operational tooling.

**Platform foundation / Delivery infrastructure / Messaging infrastructure** · PARTIAL · APPROVED

**Source evidence**

- [scripts/audit-onboarding-lifecycle.mjs](../../scripts/audit-onboarding-lifecycle.mjs) · ops · Reports onboarding lifecycle record consistency.
- [scripts/process-email-outbox.mjs](../../scripts/process-email-outbox.mjs) · ops · Runs operator-controlled outbox job processing.
- [server/services/email-outbox.service.js](../../server/services/email-outbox.service.js) · backend · Delivery statuses, error classification and linked record updates.
- [server/tests/email-outbox.lifecycle.test.js](../../server/tests/email-outbox.lifecycle.test.js) · test · Permanent failure, fifth-attempt exhaustion and stale-job recovery cases.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### MSG-005 · WhatsApp provider transport

Send approved official WhatsApp templates through the provider and store delivery identifiers.

**Platform foundation / Delivery infrastructure / Messaging infrastructure** · PARTIAL · APPROVED

**Source evidence**

- [server/services/whatsapp-provider.service.js](../../server/services/whatsapp-provider.service.js) · integration · Posts templates to Graph API using configured phone number identifier and token.
- [server/services/whatsapp-template.service.js](../../server/services/whatsapp-template.service.js) · integration · Coordinates official template dispatch and message records.
- [server/config/env.js](../../server/config/env.js) · security · Defines provider access and webhook environment contract.
- [server/db.js](../../server/db.js) · database · Official template message and status fields.
- [server/services/whatsapp.service.js](../../server/services/whatsapp.service.js) · integration · Implements the legacy WhatsApp provider transport.

**Related pull requests**

—

### MSG-006 · Signed WhatsApp callbacks

Verify provider challenges and callbacks, deduplicate delivery events and assign owned status and replies.

**Platform foundation / Delivery infrastructure / Messaging infrastructure** · PARTIAL · APPROVED

**Source evidence**

- [server/routes/whatsappWebhook.routes.js](../../server/routes/whatsappWebhook.routes.js) · integration · Handles verification challenge, request signature and raw callback body.
- [server/services/whatsapp-webhook.service.js](../../server/services/whatsapp-webhook.service.js) · integration · Stores idempotent events, invokes status and inbound processing, and supports reprocessing.
- [server/services/whatsapp-status.service.js](../../server/services/whatsapp-status.service.js) · integration · Matches provider statuses to outbound records.
- [server/services/whatsapp-inbound.service.js](../../server/services/whatsapp-inbound.service.js) · integration · Resolves inbound sender and conversation ownership.
- [server/db.js](../../server/db.js) · database · Stores webhook events and WhatsApp message ownership.

**Related pull requests**

—

## ONB-001 · Institution onboarding workflow

Provision institute resources and activate the verified owner and subscription through a repeatable startup workflow.

**Platform foundation / Tenant lifecycle / Institute onboarding** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/LandingPage.jsx](../../src/pages/LandingPage.jsx) · frontend · Public institute onboarding form.
- [server/services/tenant-onboarding.service.js](../../server/services/tenant-onboarding.service.js) · backend · Creates tenant, owner, branch, defaults, tokens, subscription and checklist.
- [server/tests/email-outbox.lifecycle.test.js](../../server/tests/email-outbox.lifecycle.test.js) · test · Pending onboarding resume and exactly-once verified activation covered in fixtures.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4); [#11](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/11)

### ONB-002 · Atomic pending institute provisioning

Create the pending tenant, owner, initial resources, subscription and verification outbox state in one transaction.

**Platform foundation / Tenant lifecycle / Institute onboarding** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/LandingPage.jsx](../../src/pages/LandingPage.jsx) · frontend · Calls institute onboarding with owner contact and institute fields.
- [server/routes/onboarding.routes.js](../../server/routes/onboarding.routes.js) · backend · Publishes institute onboarding endpoint with validation/service error handling.
- [server/services/tenant-onboarding.service.js](../../server/services/tenant-onboarding.service.js) · backend · Transactional createNewPendingOnboarding and pending-owner resume logic.
- [server/db.js](../../server/db.js) · database · Tenant, user, branch, role, subscription and checklist records.
- [server/tests/email-outbox.lifecycle.test.js](../../server/tests/email-outbox.lifecycle.test.js) · test · Repeated requests resume pending verified-owner onboarding.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### ONB-003 · Verified-owner activation and resend

Validate the owner email token, supersede queued replacements and activate the tenant trial once.

**Platform foundation / Tenant lifecycle / Institute onboarding** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/VerifyEmailPage.jsx](../../src/pages/VerifyEmailPage.jsx) · frontend · Browser link submission and verification outcome.
- [server/routes/auth.routes.js](../../server/routes/auth.routes.js) · backend · Verification transaction claims token and activates pending tenant and subscription.
- [server/db.js](../../server/db.js) · database · Verification token lifecycle and one-current-subscription invariant.
- [server/tests/email-outbox.lifecycle.test.js](../../server/tests/email-outbox.lifecycle.test.js) · test · Resend, old-link race, successful verification and subscription invariants exercised.
- [tests/ui/app.spec.js](../../tests/ui/app.spec.js) · test · Browser verification submits the email verification token.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### ONB-004 · Onboarding checklist and starter data

Display initial institute setup progress and tenant-owned seeded defaults.

**Platform foundation / Tenant lifecycle / Institute onboarding** · INCOMPLETE · APPROVED

**Source evidence**

- [src/pages/LandingPage.jsx](../../src/pages/LandingPage.jsx) · frontend · Illustrates the starter checklist on the landing page. No active checklist API consumer was identified.
- [server/routes/onboarding.routes.js](../../server/routes/onboarding.routes.js) · backend · Dashboard summary, checklist retrieval and demo cleanup.
- [server/services/tenant-onboarding.service.js](../../server/services/tenant-onboarding.service.js) · backend · Seeds branch, roles, setup checklist and defaults.
- [server/db.js](../../server/db.js) · database · Defines onboarding checklist and seeded default metadata.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4); [#11](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/11)

### ONB-005 · Platform-managed owner recovery

Allow an authorized platform operator to issue or revoke owner recovery for an ownerless institution.

**Platform foundation / Tenant lifecycle / Institute onboarding** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/super-admin/InstitutesPage.jsx](../../src/pages/super-admin/InstitutesPage.jsx) · frontend · Operator workflow exposes owner recovery controls.
- [src/pages/AcceptInvitePage.jsx](../../src/pages/AcceptInvitePage.jsx) · frontend · Handles the owner recovery acceptance variant.
- [server/routes/super-admin.routes.js](../../server/routes/super-admin.routes.js) · backend · Privileged operator creates/revokes recovery requests with a reason and audit.
- [server/routes/auth.routes.js](../../server/routes/auth.routes.js) · backend · Recovery acceptance claims token and creates the verified owner transactionally.
- [server/tests/email-outbox.lifecycle.test.js](../../server/tests/email-outbox.lifecycle.test.js) · test · Active/inactive platform and recovery acceptance with tenant and platform audits.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

## ONT-000 · Institution ontology management

Maintain schema descriptors, attributes, relations and classification records.

**Institution operations / Metadata management / Ontology** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Ontology.jsx](../../src/pages/Ontology.jsx) · frontend · Administrative ontology editor is registered.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Ontology management endpoints have a management role gate; historical metadata ownership remains open.
- [server/db.js](../../server/db.js) · database · Four ontology tables are created and seeded.

**Related pull requests**

[#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

### ONT-001 · Ontology entities and schema attributes

Manage entity definitions, icon metadata, attributes and field validation hints.

**Institution operations / Metadata management / Ontology** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Ontology.jsx](../../src/pages/Ontology.jsx) · frontend · Entity and attribute editor includes validation and field controls.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Entity and nested attribute endpoints operate on legacy global records.
- [server/db.js](../../server/db.js) · database · ontology_entities and ontology_attributes store schema names and metadata.

**Related pull requests**

[#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

### ONT-002 · Ontology relations

Describe relationships, source and destination entity IDs, and cardinality.

**Institution operations / Metadata management / Ontology** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Ontology.jsx](../../src/pages/Ontology.jsx) · frontend · Relation editor accepts source/target and cardinality.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Relations CRUD works on the legacy shared ontology structures.
- [server/db.js](../../server/db.js) · database · ontology_relations references source and target ontology_entities.

**Related pull requests**

[#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

### ONT-003 · Ontology classifications

Maintain labels and classification structures for institution metadata.

**Institution operations / Metadata management / Ontology** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Ontology.jsx](../../src/pages/Ontology.jsx) · frontend · Classification add/edit/remove section.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Classification CRUD lacks an explicit ownership boundary.
- [server/db.js](../../server/db.js) · database · ontology_classifications tracks class name, description and entity relation metadata.

**Related pull requests**

[#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

## OPS-001 · Operational security and release gates

Keep deployment configuration, recovery evidence and release verification tied to the validated repository revision.

**Platform foundation / Operational readiness / Release operations** · PARTIAL · APPROVED

**Source evidence**

- [.github/workflows/verify.yml](../../.github/workflows/verify.yml) · ci · Required integrated verification with disposable PostgreSQL.
- [scripts/pilot-readiness.mjs](../../scripts/pilot-readiness.mjs) · ops · Checks selected tenant lifecycle, database integrity, backup and proof freshness.
- [README.md](../../README.md) · docs · Documents local and production environment contract and verification.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4); [#9](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/9); [#11](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/11); [#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

### OPS-002 · HTTPS, CORS and response hardening

Set allowed origins, browser security headers, body limits and the HTTPS/proxy contract.

**Platform foundation / Operational readiness / Release operations** · PARTIAL · APPROVED

**Source evidence**

- [server/index.js](../../server/index.js) · security · Uses Helmet, explicit CORS origins, disabled X-Powered-By and request parser limits.
- [server/config/env.js](../../server/config/env.js) · security · Validates canonical app/API URLs and environment values.
- [scripts/check-security-baseline.mjs](../../scripts/check-security-baseline.mjs) · ci · Static baseline confirms several required middleware and rate limits.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### OPS-003 · Rate limiting and abuse controls

Limit sensitive auth/onboarding and public enquiry requests using configured windows and response headers.

**Platform foundation / Operational readiness / Release operations** · PARTIAL · APPROVED

**Source evidence**

- [server/middleware/rate-limit.js](../../server/middleware/rate-limit.js) · security · In-process keyed request counts and 429 response metadata.
- [server/index.js](../../server/index.js) · security · Attaches limits to selected login, reset, verification, onboarding and enquiry endpoints.
- [scripts/check-security-baseline.mjs](../../scripts/check-security-baseline.mjs) · ci · Required presence of selected rate-limit mounts.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### OPS-004 · Secure environment and database transport

Validate deployment configuration, protect credentials and verify PostgreSQL and SMTP TLS trust.

**Platform foundation / Operational readiness / Release operations** · PARTIAL · APPROVED

**Source evidence**

- [server/config/env.js](../../server/config/env.js) · security · Fail-fast contract for production integrations and secret values.
- [server/db.js](../../server/db.js) · database · PostgreSQL connection SSL configuration retains compatibility rejectUnauthorized behavior.
- [scripts/check-environment-contract.mjs](../../scripts/check-environment-contract.mjs) · ci · Checks configuration keys against repository contract.
- [server/services/mail.service.js](../../server/services/mail.service.js) · integration · Selects Nodemailer transport and secure mode.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4); [#11](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/11)

### OPS-005 · PostgreSQL backup and restore verification tools

Create checksummed backups and run restoration verification against an isolated target.

**Platform foundation / Operational readiness / Release operations** · PARTIAL · APPROVED

**Source evidence**

- [scripts/postgres-data-safety.mjs](../../scripts/postgres-data-safety.mjs) · ops · Implements dump manifest, target confirmation, restore and verification proof.
- [scripts/sqlite-data-safety.mjs](../../scripts/sqlite-data-safety.mjs) · ops · Local SQLite backup and restoration fixture.
- [scripts/verify.mjs](../../scripts/verify.mjs) · ci · Data-safety stage exercises SQLite restore and PostgreSQL guardrails.
- [scripts/pilot-readiness.mjs](../../scripts/pilot-readiness.mjs) · ops · Matches backup checksum and restore evidence and enforces freshness.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4); [#11](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/11)

### OPS-006 · Scheduled backups and recovery monitoring

Schedule encrypted retained backups with monitored job outcomes and recurring restore drills.

**Platform foundation / Operational readiness / Release operations** · NOT_BUILT · APPROVED

**Source evidence**

- [scripts/postgres-data-safety.mjs](../../scripts/postgres-data-safety.mjs) · ops · Manual commands are prerequisites for a scheduler.
- [scripts/pilot-readiness.mjs](../../scripts/pilot-readiness.mjs) · ops · Requires recent checksum-valid backup and matching restore proof.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### OPS-007 · Two-institute staging release acceptance

Use release-ready staging to confirm separately provisioned verified owners and concurrent tenant isolation.

**Platform foundation / Operational readiness / Release operations** · UNVERIFIED · APPROVED

**Source evidence**

- [scripts/pilot-readiness.mjs](../../scripts/pilot-readiness.mjs) · ops · Checks verified owner, tenant lifecycle, audit trail and data-safety/verification evidence.
- [docs/development/a04-tenant-isolation.md](../../docs/development/a04-tenant-isolation.md) · docs · Final acceptance requires a confirmed deployment and isolated persistent PostgreSQL.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4); [#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

### OPS-008 · Revision-linked CI verification

Run the integration suite on pull requests and main and keep a downloadable verification artifact tied to the tested commit.

**Platform foundation / Operational readiness / Release operations** · COMPLETE · APPROVED

**Source evidence**

- [.github/workflows/verify.yml](../../.github/workflows/verify.yml) · ci · Pinned Ubuntu runner and PostgreSQL service; validates all stage names before uploading evidence.
- [ops/github-main-protection.json](../../ops/github-main-protection.json) · ops · Defines strict required integration check and administrator enforcement settings.
- [scripts/verify.mjs](../../scripts/verify.mjs) · ci · Runs the 13 stage integration suite and writes verification proof.
- [docs/development/a02-verification.md](../../docs/development/a02-verification.md) · docs · Defines evidence artifact and required merge check.

**Related pull requests**

[#9](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/9); [#11](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/11); [#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

### OPS-009 · API environment health and startup diagnostics

Expose minimal API health status and startup validation with consistent environment defaults.

**Platform foundation / Operational readiness / Release operations** · PARTIAL · OBSERVED

**Source evidence**

- [server/index.js](../../server/index.js) · backend · Health endpoint returns service and environment state after migration succeeds.
- [server/config/env.js](../../server/config/env.js) · security · Validates environment before API startup.
- [scripts/smoke-test.mjs](../../scripts/smoke-test.mjs) · test · Uses API health for start/reuse verification.
- [scripts/check-environment-contract.mjs](../../scripts/check-environment-contract.mjs) · ci · Checks canonical configuration contract.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4); [#11](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/11)

### OPS-010 · Dependency security maintenance

Identify and remediate runtime and toolchain dependency advisories without silently widening deployment scope.

**Platform foundation / Operational readiness / Release operations** · INCOMPLETE · APPROVED

**Source evidence**

- [docs/development/a02-verification.md](../../docs/development/a02-verification.md) · docs · Records outstanding dependency advisory snapshot when the verification gate was created.
- [.github/workflows/verify.yml](../../.github/workflows/verify.yml) · ci · Installs from lockfile and runs deterministic tests.
- [package-lock.json](../../package-lock.json) · ops · Pins authentication, API, UI and test dependencies.

**Related pull requests**

[#9](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/9)

## PLAT-001 · Platform administration console

Operate institute records, status, support and audit views with a distinct platform identity.

**Platform administration / Operator controls / Administration console** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/super-admin/SuperAdminLayout.jsx](../../src/pages/super-admin/SuperAdminLayout.jsx) · frontend · Separate Super Admin entry point and views.
- [server/routes/super-admin.routes.js](../../server/routes/super-admin.routes.js) · backend · Platform-only institute, recovery, usage, revenue, support and audit endpoints.
- [server/middleware/platform-auth.js](../../server/middleware/platform-auth.js) · security · Checks platform token type and current active operator record.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### PLAT-002 · Platform authentication and operator roles

Authenticate platform admins separately and authorize operator roles using their current database record.

**Platform administration / Operator controls / Administration console** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/super-admin/SuperAdminLayout.jsx](../../src/pages/super-admin/SuperAdminLayout.jsx) · frontend · Operator login and platform token flow.
- [server/routes/platform-auth.routes.js](../../server/routes/platform-auth.routes.js) · backend · Verifies platform credentials, issues typed JWT and updates last login.
- [server/middleware/platform-auth.js](../../server/middleware/platform-auth.js) · security · Loads active platform operator and authoritative role.
- [server/middleware/platform-rbac.js](../../server/middleware/platform-rbac.js) · security · Checks permitted platform role groups.
- [server/db.js](../../server/db.js) · database · Platform admin identity and status table.
- [server/tests/email-outbox.lifecycle.test.js](../../server/tests/email-outbox.lifecycle.test.js) · test · Inactive operator rejection in recovery controls.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### PLAT-003 · Institute directory and account status management

List, filter and inspect institutes and manage tenant status through privileged operator controls.

**Platform administration / Operator controls / Administration console** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/super-admin/InstitutesPage.jsx](../../src/pages/super-admin/InstitutesPage.jsx) · frontend · Displays institute list/detail and account status controls.
- [src/pages/super-admin/OverviewPage.jsx](../../src/pages/super-admin/OverviewPage.jsx) · frontend · Renders summary metrics.
- [server/routes/super-admin.routes.js](../../server/routes/super-admin.routes.js) · backend · Institute directory, detail and status mutation handlers.
- [server/services/super-admin.service.js](../../server/services/super-admin.service.js) · backend · Reads institute/subscription records and changes tenant status.
- [src/pages/super-admin/SuspendedTenantsPage.jsx](../../src/pages/super-admin/SuspendedTenantsPage.jsx) · frontend · Opens the institute-management view filtered to suspended tenants.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### PLAT-004 · Support session tracking

Record, list and revoke expiring support access requests with documented reason and access type.

**Platform administration / Operator controls / Administration console** · INCOMPLETE · OBSERVED

**Source evidence**

- [src/pages/super-admin/SupportAccessPage.jsx](../../src/pages/super-admin/SupportAccessPage.jsx) · frontend · Support session creation, listing and revocation UI.
- [server/routes/super-admin.routes.js](../../server/routes/super-admin.routes.js) · backend · Role-guarded support session endpoints and platform audits.
- [server/services/support-access.service.js](../../server/services/support-access.service.js) · backend · Validates target tenant and persists one-hour access session metadata.
- [server/db.js](../../server/db.js) · database · Support session owner, tenant, reason, expiry and revocation schema.

**Related pull requests**

—

### PLAT-005 · Platform administrative audit log

Record operator identity, action and target for sensitive platform changes, and present a protected history.

**Platform administration / Operator controls / Administration console** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/super-admin/AuditLogsPage.jsx](../../src/pages/super-admin/AuditLogsPage.jsx) · frontend · Operator audit log viewer.
- [server/routes/super-admin.routes.js](../../server/routes/super-admin.routes.js) · backend · Audit log endpoint and examples of logged state changes.
- [server/services/platform-audit.service.js](../../server/services/platform-audit.service.js) · backend · Persists platform audit events.
- [server/db.js](../../server/db.js) · database · Platform audit log table.
- [server/tests/email-outbox.lifecycle.test.js](../../server/tests/email-outbox.lifecycle.test.js) · test · Owner recovery acceptance verifies both audit streams.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### PLAT-006 · Tenant activity audit

Persist tenant-scoped activity for business and identity actions and restrict audit reads to the owning tenant.

**Platform administration / Operator controls / Administration console** · PARTIAL · APPROVED

**Source evidence**

- [server/services/auditLog.service.js](../../server/services/auditLog.service.js) · backend · Writes audit action, actor, tenant, entity and changed data fields.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Tenant-protected legacy audit log routes.
- [server/db.js](../../server/db.js) · database · Defines audit_logs and tenant index metadata.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Tenant scoping for finance report and audit outputs.
- [scripts/pilot-readiness.mjs](../../scripts/pilot-readiness.mjs) · ops · Requires visible history for the chosen tenant.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

## POR-000 · Parent and student self-service

Provide approved learners and guardians with role-specific access to their records and notifications.

**Institution operations / Self-service portals / Parent and Student Portals** · INCOMPLETE · PROPOSED

**Source evidence**

- [src/pages/ParentPortal.jsx](../../src/pages/ParentPortal.jsx) · frontend · Active UI shows portal unavailable and removes student ID plus phone lookup.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Legacy parent lookup is actively closed.
- [server/db.js](../../server/db.js) · database · Guardian records exist for staff use. Portal ownership, identity verifier and student-facing sessions are unproven.

**Related pull requests**

[#10](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/10)

### POR-001 · Verified parent access

Authenticate a guardian and bind the verified session to approved student relationships and allowed data views.

**Institution operations / Self-service portals / Parent and Student Portals** · NOT_BUILT · APPROVED

**Source evidence**

- [src/pages/ParentPortal.jsx](../../src/pages/ParentPortal.jsx) · frontend · Active UI shows portal unavailable and removes student ID plus phone lookup.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Public /api/parent-portal/lookup returns an unavailable response unconditionally.
- [server/db.js](../../server/db.js) · database · student_guardians models staff-entered relationships; parent session provisioning is not shown.

**Related pull requests**

[#10](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/10)

### POR-002 · Legacy public parent lookup containment

Keep the retired public lookup closed and free of personal data while verified access is built.

**Institution operations / Self-service portals / Parent and Student Portals** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/ParentPortal.jsx](../../src/pages/ParentPortal.jsx) · frontend · Active UI shows portal unavailable and removes student ID plus phone lookup.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Public lookup returns HTTP 403 with PARENT_PORTAL_UNAVAILABLE and a fixed response body.
- [server/tests/legacy-academic.tenant.test.js](../../server/tests/legacy-academic.tenant.test.js) · test · Real PostgreSQL HTTP suite confirms that legacy lookup denial discloses no learner records.
- [scripts/smoke-test.mjs](../../scripts/smoke-test.mjs) · test · Asserts HTTP 403, PARENT_PORTAL_UNAVAILABLE and exact allowed response keys.

**Related pull requests**

[#10](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/10); [#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

### POR-003 · Student self-service portal

Let learners access their own authorized academic and operational information with a student session.

**Institution operations / Self-service portals / Parent and Student Portals** · NOT_BUILT · PROPOSED

**Source evidence**

- [src/App.jsx](../../src/App.jsx) · frontend · Registered student screens are staff CRM surfaces. No student-authenticated portal is registered.
- [server/index.js](../../server/index.js) · backend · Student endpoints mount staff and tenant-access middleware. No self-service router was observed.

**Related pull requests**

—

## SAAS-001 · SaaS subscription management

Manage institute trials, subscriptions, invoicing, usage and recurring collection through an approved commercialization workflow.

**Platform administration / Commercial operations / SaaS administration** · PARTIAL · PROPOSED

**Source evidence**

- [server/db.js](../../server/db.js) · database · Includes subscriptions, tenant payments and usage records.
- [server/services/super-admin.service.js](../../server/services/super-admin.service.js) · backend · Reads institution and subscription status and counts.
- [server/services/billing-analytics.service.js](../../server/services/billing-analytics.service.js) · backend · Reads subscription revenue metrics and recorded payments.

**Related pull requests**

—

### SAAS-002 · Trial and subscription state views

Show trial/paid/expired/suspended lists and manage access state tied to the current subscription.

**Platform administration / Commercial operations / SaaS administration** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/super-admin/TrialsPage.jsx](../../src/pages/super-admin/TrialsPage.jsx) · frontend · Trial status list.
- [src/pages/super-admin/ExpiredTrialsPage.jsx](../../src/pages/super-admin/ExpiredTrialsPage.jsx) · frontend · Expired trial view.
- [src/pages/super-admin/PaidCustomersPage.jsx](../../src/pages/super-admin/PaidCustomersPage.jsx) · frontend · Paid customer view.
- [server/middleware/tenant-status.js](../../server/middleware/tenant-status.js) · security · Checks current subscription access.
- [server/db.js](../../server/db.js) · database · Stores trial and subscription dates and unique current subscription.
- [server/tests/email-outbox.lifecycle.test.js](../../server/tests/email-outbox.lifecycle.test.js) · test · Tests one current subscription and verified trial activation.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### SAAS-003 · Subscription revenue and payment reporting

Show stored subscription MRR, paid customer counts, overdue state and recent payments to platform operators.

**Platform administration / Commercial operations / SaaS administration** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/super-admin/RevenuePage.jsx](../../src/pages/super-admin/RevenuePage.jsx) · frontend · Renders subscription KPIs and recent payments.
- [server/services/billing-analytics.service.js](../../server/services/billing-analytics.service.js) · backend · Aggregates active subscription amounts and reads tenant payment records.
- [server/routes/super-admin.routes.js](../../server/routes/super-admin.routes.js) · backend · Revenue summary API guarded by platform role.
- [server/db.js](../../server/db.js) · database · Stores subscription monthly amount and platform payments.

**Related pull requests**

—

### SAAS-004 · Platform usage records and reporting

Show recorded institute usage by tenant, metric and period.

**Platform administration / Commercial operations / SaaS administration** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/super-admin/UsagePage.jsx](../../src/pages/super-admin/UsagePage.jsx) · frontend · Renders stored usage by tenant and metric.
- [server/services/usage.service.js](../../server/services/usage.service.js) · backend · Queries usage records with optional tenant filtering and a limit.
- [server/routes/super-admin.routes.js](../../server/routes/super-admin.routes.js) · backend · Platform usage list endpoint.
- [server/db.js](../../server/db.js) · database · Defines tenant_usage_records dimension and timestamps.

**Related pull requests**

—

### SAAS-005 · Recurring subscription collection and invoicing

Collect SaaS subscription charges and reconcile invoices, renewals, refunds and failed charges.

**Platform administration / Commercial operations / SaaS administration** · NOT_BUILT · PROPOSED

**Source evidence**

- [server/db.js](../../server/db.js) · database · Platform subscription and payment record schema foundation.
- [server/services/billing-analytics.service.js](../../server/services/billing-analytics.service.js) · backend · Existing reporting reads stored payments.

**Related pull requests**

—

### SAAS-006 · Plan entitlements and usage limits

Apply approved feature and resource entitlements across plans and subscription changes.

**Platform administration / Commercial operations / SaaS administration** · NOT_BUILT · PROPOSED

**Source evidence**

- [server/middleware/tenant-status.js](../../server/middleware/tenant-status.js) · security · Current guard checks subscription access by status.
- [server/db.js](../../server/db.js) · database · Stores subscription plan and usage metadata for future entitlement rules.

**Related pull requests**

—

## STU-000 · Student information and enrolment

Manage institutional learner records from enrolment through academic and operational follow-up.

**Institution operations / Student information / Students** · PARTIAL · APPROVED

**Source evidence**

- [src/App.jsx](../../src/App.jsx) · frontend · Student roster, import and individual profile screens are registered.
- [server/routes/students.routes.js](../../server/routes/students.routes.js) · backend · Mounted student collection, detail and profile subresources.
- [server/db.js](../../server/db.js) · database · Base students table and migrateStudentProfiles enrich learner and relationship storage.
- [server/middleware/student-data-access.js](../../server/middleware/student-data-access.js) · security · Evaluates visibility and serializes role-restricted student fields.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Teacher assignment and minimal disclosure assertions cover student and follow-up views.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### STU-001 · Student directory and profile editing

Search, create and update student identity and enrolment details.

**Institution operations / Student information / Students** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/Students.jsx](../../src/pages/Students.jsx) · frontend · Renders the roster with forms, search and profile navigation.
- [server/routes/students.routes.js](../../server/routes/students.routes.js) · backend · GET/POST /, GET/PUT/PATCH /:id expose roster and profile writes.
- [server/db.js](../../server/db.js) · database · students carries relational academic fields alongside imported legacy data.
- [server/middleware/student-data-access.js](../../server/middleware/student-data-access.js) · security · Evaluates visibility and serializes role-restricted student fields.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Teacher visibility, reduced results and unassigned student 404 are covered.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### STU-002 · Student 360 and profile sections

Retrieve summary, academic, fees, attendance, tests, follow-ups and communications for one student.

**Institution operations / Student information / Students** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/StudentProfile.jsx](../../src/pages/StudentProfile.jsx) · frontend · Tabbed profile loads fields and sections through their endpoints.
- [server/routes/students.routes.js](../../server/routes/students.routes.js) · backend · GET /:id/profile and section routes construct role-scoped profile payloads.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · GET /api/students/:id/360 remains a separate aggregate entry point.
- [server/db.js](../../server/db.js) · database · Student profile joins batch, fee, attendance, result, communication and guardian data.
- [server/middleware/student-data-access.js](../../server/middleware/student-data-access.js) · security · Evaluates visibility and serializes role-restricted student fields.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Teacher profile and attendance do not reintroduce full follow-up rows.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### STU-003 · Guardian records and notification permissions

Store guardian relationships, primary and emergency contacts, and notification preferences.

**Institution operations / Student information / Students** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/StudentProfile.jsx](../../src/pages/StudentProfile.jsx) · frontend · Guardian cards and create form belong to the profile overview.
- [server/routes/students.routes.js](../../server/routes/students.routes.js) · backend · GET/POST /:id/guardians and PATCH /:id/guardians/:guardianId.
- [server/db.js](../../server/db.js) · database · student_guardians stores relationship and contact flags.
- [server/middleware/student-data-access.js](../../server/middleware/student-data-access.js) · security · Evaluates visibility and serializes role-restricted student fields.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### STU-004 · Student document records and review

Register student document metadata and record verification or rejection decisions.

**Institution operations / Student information / Students** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/StudentProfile.jsx](../../src/pages/StudentProfile.jsx) · frontend · Documents tab accepts a file URL and exposes Verify and Reject actions.
- [server/routes/students.routes.js](../../server/routes/students.routes.js) · backend · GET/POST /:id/documents and PATCH /:id/documents/:documentId.
- [server/db.js](../../server/db.js) · database · student_documents stores file metadata and verification state.
- [server/middleware/student-data-access.js](../../server/middleware/student-data-access.js) · security · Evaluates visibility and serializes role-restricted student fields.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### STU-005 · Student status, archive and history

Track lifecycle changes, archive/remove profiles, and retain history and change reasons.

**Institution operations / Student information / Students** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/StudentProfile.jsx](../../src/pages/StudentProfile.jsx) · frontend · History and settings tabs expose lifecycle actions.
- [server/routes/students.routes.js](../../server/routes/students.routes.js) · backend · Status, archive, delete and history routes record lifecycle events.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Legacy student-history routes still coexist.
- [server/db.js](../../server/db.js) · database · students status and deletion fields plus student_history.
- [server/middleware/student-data-access.js](../../server/middleware/student-data-access.js) · security · Evaluates visibility and serializes role-restricted student fields.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Cross-tenant history reads and mutations deny and preserve rows.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### STU-006 · Student roster import

Validate formatted learner rows, preview changes, commit accepted records, and roll back a batch.

**Institution operations / Student information / Students** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/StudentImport.jsx](../../src/pages/StudentImport.jsx) · frontend · Roster import parses rows, previews results and commits or reverses imports.
- [server/routes/imports.routes.js](../../server/routes/imports.routes.js) · backend · POST /students/dry-run and shared batch commit/rollback entry points.
- [server/db.js](../../server/db.js) · database · data_import_batches and data_import_rows track dry-run, apply and rollback.
- [server/middleware/student-data-access.js](../../server/middleware/student-data-access.js) · security · Evaluates visibility and serializes role-restricted student fields.
- [server/tests/imports.transaction.test.js](../../server/tests/imports.transaction.test.js) · test · Student import commit and business rollback are atomic in the isolated fixture.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### STU-007 · Guardian import

Validate and associate guardian rows with existing students through the import workflow.

**Institution operations / Student information / Students** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/StudentImport.jsx](../../src/pages/StudentImport.jsx) · frontend · Guardian import shares preview, commit and rollback controls.
- [server/routes/imports.routes.js](../../server/routes/imports.routes.js) · backend · POST /guardians/dry-run resolves student matches before batch apply.
- [server/db.js](../../server/db.js) · database · Guardian rows and import history are stored separately.
- [server/middleware/student-data-access.js](../../server/middleware/student-data-access.js) · security · Evaluates visibility and serializes role-restricted student fields.
- [server/tests/imports.transaction.test.js](../../server/tests/imports.transaction.test.js) · test · Guardian commit and business rollback are atomic in the isolated fixture.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

### STU-008 · Student batch placement and transfers

Add, remove and transfer learners while retaining academic membership history.

**Institution operations / Student information / Students** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/AcademicMasters.jsx](../../src/pages/AcademicMasters.jsx) · frontend · Batch detail renders learner placement and transfer controls.
- [src/pages/StudentProfile.jsx](../../src/pages/StudentProfile.jsx) · frontend · Academic tab exposes current and past memberships.
- [server/routes/academicMaster.routes.js](../../server/routes/academicMaster.routes.js) · backend · Batch student assignment, removal and transfer endpoints validate referenced records.
- [server/routes/students.routes.js](../../server/routes/students.routes.js) · backend · GET /:id/academic reads memberships and teacher associations.
- [server/db.js](../../server/db.js) · database · batch_students stores joined, left and active membership fields.
- [server/middleware/student-data-access.js](../../server/middleware/student-data-access.js) · security · Evaluates visibility and serializes role-restricted student fields.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4)

## TCH-000 · Faculty management and performance

Maintain teacher identity, supervision records and evidence-backed instructional performance measures.

**Institution operations / Faculty management / Teachers and TeacherScore** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/TeacherPerformance.jsx](../../src/pages/TeacherPerformance.jsx) · frontend · Management screen tracks monthly teacher performance.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Teacher directory and review workflow.
- [server/routes/teacherScore.routes.js](../../server/routes/teacherScore.routes.js) · backend · TeacherScore adds structured scorecards and evidence workflows.
- [server/db.js](../../server/db.js) · database · teachers, reviews, controls, actions, snapshots and components.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Role and tenant regressions exercise teacher operations, staff attendance and leave isolation.

**Related pull requests**

—

### TCH-001 · Teacher directory

Create, search, edit and retire tenant-owned teacher records.

**Institution operations / Faculty management / Teachers and TeacherScore** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/Teachers.jsx](../../src/pages/Teachers.jsx) · frontend · Directory shows teacher registration and editing controls.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · GET/POST/PUT/DELETE /api/teachers routes.
- [server/db.js](../../server/db.js) · database · teachers stores name, role/team fields and tenant ownership.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Role and tenant regressions exercise teacher operations, staff attendance and leave isolation.

**Related pull requests**

—

### TCH-002 · Teacher manual reviews

Capture monthly teacher ratings, evidence, decisions and review history.

**Institution operations / Faculty management / Teachers and TeacherScore** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/TeacherPerformance.jsx](../../src/pages/TeacherPerformance.jsx) · frontend · Monthly Score Summary, reviewed items and Monthly Review Decision controls.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Teacher reviews list, create, edit, delete and teacher-specific history.
- [server/db.js](../../server/db.js) · database · teacher_reviews stores period and JSON review inputs.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Role and tenant regressions exercise teacher operations, staff attendance and leave isolation.

**Related pull requests**

—

### TCH-003 · Teacher work controls

Set and maintain recurring instructional expectations and evidence due dates.

**Institution operations / Faculty management / Teachers and TeacherScore** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/TeacherPerformance.jsx](../../src/pages/TeacherPerformance.jsx) · frontend · Teacher operations manages assigned work controls.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Work control list/write/delete and teacher-specific retrieval.
- [server/db.js](../../server/db.js) · database · teacher_work_controls records criteria, due cadence and status.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Role and tenant regressions exercise teacher operations, staff attendance and leave isolation.

**Related pull requests**

—

### TCH-004 · Teacher management actions

Record decisions, improvement actions, consequences and follow-up state.

**Institution operations / Faculty management / Teachers and TeacherScore** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/TeacherPerformance.jsx](../../src/pages/TeacherPerformance.jsx) · frontend · Review decision actions and historical context are presented in management UI.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Management action list/write/delete and per-teacher detail endpoints.
- [server/db.js](../../server/db.js) · database · teacher_management_actions stores action tracking for owned teachers.
- [server/tests/student-followups.authorization.test.js](../../server/tests/student-followups.authorization.test.js) · test · Role and tenant regressions exercise teacher operations, staff attendance and leave isolation.

**Related pull requests**

—

### TCH-005 · TeacherScore weights, thresholds and periods

Configure criteria weights, targets, minimum evidence thresholds and authorised recalculation.

**Institution operations / Faculty management / Teachers and TeacherScore** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/TeacherScoreDashboard.jsx](../../src/pages/TeacherScoreDashboard.jsx) · frontend · Score settings and recalculation from the dashboard.
- [server/routes/teacherScore.routes.js](../../server/routes/teacherScore.routes.js) · backend · Config read/update plus institution and teacher recalculation.
- [server/services/teacher-score.service.js](../../server/services/teacher-score.service.js) · backend · Loads tenant policy and evaluates weighted component evidence.
- [server/db.js](../../server/db.js) · database · teacher_score_configs stores tenant-specific score policies.

**Related pull requests**

—

### TCH-006 · TeacherScore snapshots, evidence and alerts

Compute, review and lock evidence-based teacher score snapshots, components and warnings.

**Institution operations / Faculty management / Teachers and TeacherScore** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/TeacherScoreDashboard.jsx](../../src/pages/TeacherScoreDashboard.jsx) · frontend · Monthly teacher score table, filters and alerts.
- [src/pages/TeacherScoreDetail.jsx](../../src/pages/TeacherScoreDetail.jsx) · frontend · Detail shows evidence, history, configured calculations and locking.
- [server/routes/teacherScore.routes.js](../../server/routes/teacherScore.routes.js) · backend · Scorecard list, detail, component, history, lock and audit routes.
- [server/services/teacher-score.service.js](../../server/services/teacher-score.service.js) · backend · Computes evidence components, confidence and alerts.
- [server/db.js](../../server/db.js) · database · teacher_score_snapshots, components and alerts persist period output.

**Related pull requests**

—

### TCH-007 · TeacherScore progress and homework evidence

Capture syllabus completion and homework checking records as teacher-score evidence.

**Institution operations / Faculty management / Teachers and TeacherScore** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/TeacherScoreDetail.jsx](../../src/pages/TeacherScoreDetail.jsx) · frontend · Score detail uses source evidence to explain performance components.
- [server/routes/teacherScore.routes.js](../../server/routes/teacherScore.routes.js) · backend · Syllabus progress list/add/update and homework-check creation.
- [server/db.js](../../server/db.js) · database · batch_syllabus_progress and homework_checks store source detail.

**Related pull requests**

—

### TCH-008 · TeacherScore complaints and feedback surveys

Capture staff or guardian feedback and complaint status for permitted performance review.

**Institution operations / Faculty management / Teachers and TeacherScore** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/TeacherScoreDetail.jsx](../../src/pages/TeacherScoreDetail.jsx) · frontend · TeacherScore detail includes new complaint and survey actions.
- [server/routes/teacherScore.routes.js](../../server/routes/teacherScore.routes.js) · backend · Complaint create/update and feedback survey creation endpoints.
- [server/db.js](../../server/db.js) · database · teacher_complaints and feedback survey/response tables.

**Related pull requests**

—

### TCH-009 · TeacherScore improvement plans and review notes

Assign follow-up plans, capture review notes and track planned improvement outcomes.

**Institution operations / Faculty management / Teachers and TeacherScore** · PARTIAL · OBSERVED

**Source evidence**

- [src/pages/TeacherScoreDetail.jsx](../../src/pages/TeacherScoreDetail.jsx) · frontend · Plan and review notes interface provides evidence for action.
- [server/routes/teacherScore.routes.js](../../server/routes/teacherScore.routes.js) · backend · Create/update plans and record review notes with audit context.
- [server/db.js](../../server/db.js) · database · Teacher improvement plan and review note tables store phase and authorship.

**Related pull requests**

—

## TEN-001 · Institution data isolation

Keep institutional data, users, permissions and operations isolated across the API, legacy SQL, services and storage.

**Platform foundation / Tenant isolation / Multi-tenant foundation** · PARTIAL · APPROVED

**Source evidence**

- [server/middleware/tenant.js](../../server/middleware/tenant.js) · security · Authenticated tenant context is normalized and checked for active access.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Tenant filters exist in reviewed academic operations alongside remaining legacy route families.
- [docs/development/a04-tenant-isolation.md](../../docs/development/a04-tenant-isolation.md) · docs · Documents the bounded academic, payment and receipt containment scope and outstanding relationship audit.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4); [#10](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/10); [#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

### TEN-002 · Tenant and subscription request gate

Require authenticated institution context and an enabled current subscription for protected tenant requests.

**Platform foundation / Tenant isolation / Multi-tenant foundation** · PARTIAL · APPROVED

**Source evidence**

- [server/middleware/tenant.js](../../server/middleware/tenant.js) · security · Normalizes tenant context from authenticated request user.
- [server/middleware/tenant-status.js](../../server/middleware/tenant-status.js) · security · Checks tenant status and non-deleted active or trialing subscription from database.
- [scripts/check-tenant-enforcement.mjs](../../scripts/check-tenant-enforcement.mjs) · ci · Static scanner identifies missing middleware in declared authenticated routes.
- [server/tests/legacy-academic.tenant.test.js](../../server/tests/legacy-academic.tenant.test.js) · test · Real PostgreSQL API exercises authenticated tenant selection despite payload, query and header IDs.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4); [#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

### TEN-003 · Legacy route and SQL reconciliation

Audit the compatibility router and legacy data access for stale aliases, duplicate mounts and tenant-sensitive queries.

**Platform foundation / Tenant isolation / Multi-tenant foundation** · PARTIAL · APPROVED

**Source evidence**

- [server/index.js](../../server/index.js) · backend · Feature routers are mounted before the legacy compatibility router.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Large compatibility surface still owns a mixture of legacy academic, reporting and other application routes.
- [scripts/check-legacy-freeze.mjs](../../scripts/check-legacy-freeze.mjs) · ci · Checks placement of the existing fallback route set.
- [docs/development/a04-tenant-isolation.md](../../docs/development/a04-tenant-isolation.md) · docs · Lists unreviewed legacy domains and relationship checks.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4); [#10](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/10); [#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

### TEN-004 · Atomic PostgreSQL startup migration

Initialize and upgrade the canonical PostgreSQL schema on a dedicated transactional client with serialization and rollback.

**Platform foundation / Tenant isolation / Multi-tenant foundation** · COMPLETE · APPROVED

**Source evidence**

- [server/db.js](../../server/db.js) · database · Canonical migrate wraps schema and seeds on an AsyncLocalStorage-bound PostgreSQL client with transaction advisory lock.
- [server/tests/postgres-migrations.test.js](../../server/tests/postgres-migrations.test.js) · test · Five real PostgreSQL cases exercise idempotence, concurrent initialization, legacy preservation and rollback/retry.
- [docs/development/a03-postgres-migrations.md](../../docs/development/a03-postgres-migrations.md) · docs · Defines canonical startup scope, supported fixture and migration boundaries.
- [.github/workflows/verify.yml](../../.github/workflows/verify.yml) · ci · Uses PostgreSQL 18 service for verification.

**Related pull requests**

[#11](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/11)

### TEN-005 · Request-scoped transactions

Keep each transactional business operation on the owning PostgreSQL client and serialize SQLite transaction access.

**Platform foundation / Tenant isolation / Multi-tenant foundation** · PARTIAL · APPROVED

**Source evidence**

- [server/services/db.service.js](../../server/services/db.service.js) · backend · AsyncLocalStorage stores each transaction client; SQLite wrapper serializes operations with a queue.
- [server/routes/legacy.routes.js](../../server/routes/legacy.routes.js) · backend · Several operations still use the raw db import rather than the transaction wrapper.
- [server/tests/imports.transaction.test.js](../../server/tests/imports.transaction.test.js) · test · Student, guardian and fee import transactions have rollback regressions.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4); [#11](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/11)

### TEN-006 · Tenant ownership schema and backfills

Attach tenant keys and indexes to legacy and operational data while preserving provable ownership.

**Platform foundation / Tenant isolation / Multi-tenant foundation** · PARTIAL · APPROVED

**Source evidence**

- [server/db.js](../../server/db.js) · database · Startup performs tenant metadata/index migrations, legacy backfill and default-tenant initialization.
- [server/migrations/add-tenant-columns.js](../../server/migrations/add-tenant-columns.js) · database · Standalone legacy migration entry point.
- [server/tests/postgres-migrations.test.js](../../server/tests/postgres-migrations.test.js) · test · Legacy fixture preserves explicit tenant ownership and assigned student IDs.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4); [#11](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/11)

### TEN-007 · Scoped regression coverage

Exercise distinct verified test owners, legitimate tenant operations and denial of foreign references or mutations.

**Platform foundation / Tenant isolation / Multi-tenant foundation** · PARTIAL · APPROVED

**Source evidence**

- [server/tests/legacy-academic.tenant.test.js](../../server/tests/legacy-academic.tenant.test.js) · test · Two synthetic active owners exercise academic records and aggregates.
- [server/tests/payment-webhook.tenant.test.js](../../server/tests/payment-webhook.tenant.test.js) · test · Two synthetic providers exercise payment ownership, credentials and independent event IDs.
- [server/tests/receipt-pdf.tenant.test.js](../../server/tests/receipt-pdf.tenant.test.js) · test · Verifies tenant-scoped PDF delivery and containment.
- [scripts/verify.mjs](../../scripts/verify.mjs) · ci · Runs mandatory tenant-isolation stage.

**Related pull requests**

[#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)

## WFL-001 · Admission-to-Enrolment workflow

Connect website and manual enquiries to counselling, verified admission, enrolment, fees, attendance and permitted parent access.

**Admissions and enrolment / End-to-end workflows / Admission to Enrolment** · PARTIAL · APPROVED

**Source evidence**

- [src/pages/Admissions.jsx](../../src/pages/Admissions.jsx) · frontend · Existing admissions and conversion interface.
- [server/routes/publicEnquiry.routes.js](../../server/routes/publicEnquiry.routes.js) · backend · Public enquiry capture.
- [server/routes/admissions.routes.js](../../server/routes/admissions.routes.js) · backend · Admissions lead and follow-up APIs.
- [server/routes/attendanceOperations.routes.js](../../server/routes/attendanceOperations.routes.js) · backend · Attendance sessions and operational actions.
- [server/services/feeLedger.service.js](../../server/services/feeLedger.service.js) · backend · Normalized fee plans and payments.
- [scripts/smoke-test.mjs](../../scripts/smoke-test.mjs) · test · Exercises individual application routes with synthetic fixtures.

**Related pull requests**

[#4](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/4); [#5](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/5); [#7](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/7); [#10](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/10); [#12](https://github.com/jameskeziah/coaching_institue_crm_erp/pull/12)
