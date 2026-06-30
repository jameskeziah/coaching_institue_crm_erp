const { env } = require('./config/env');
const express = require('express');
const cors = require('cors');
const { migrate } = require('./db');

const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const invitesRoutes = require('./routes/invites.routes');
const onboardingRoutes = require('./routes/onboarding.routes');
const platformAuthRoutes = require('./routes/platform-auth.routes');
const superAdminRoutes = require('./routes/super-admin.routes');
const admissionsRoutes = require('./routes/admissions.routes');
const leadActivitiesRoutes = require('./routes/leadActivities.routes');
const leadManagementRoutes = require('./routes/leadManagement.routes');
const sourceAnalyticsRoutes = require('./routes/sourceAnalytics.routes');
const publicEnquiryRoutes = require('./routes/publicEnquiry.routes');
const studentsRoutes = require('./routes/students.routes');
const feeStructuresRoutes = require('./routes/feeStructures.routes');
const academicMasterRoutes = require('./routes/academicMaster.routes');
const attendanceOperationsRoutes = require('./routes/attendanceOperations.routes');
const whatsappTemplatesRoutes = require('./routes/whatsappTemplates.routes');
const parentCommunicationRoutes = require('./routes/parentCommunication.routes');
const teacherScoreRoutes = require('./routes/teacherScore.routes');
const whatsappWebhookRoutes = require('./routes/whatsappWebhook.routes');
const tenantFeeSettingsRoutes = require('./routes/tenantFeeSettings.routes');
const feesRoutes = require('./routes/fees.routes');
const paymentLinksRoutes = require('./routes/paymentLinks.routes');
const discountRequestsRoutes = require('./routes/discountRequests.routes');
const razorpayWebhookRoutes = require('./routes/razorpayWebhook.routes');
const legacyRoutes = require('./routes/legacy.routes');

const app = express();

app.use(cors());
app.use('/api/webhooks/razorpay', razorpayWebhookRoutes);
app.use('/api/webhooks/whatsapp', whatsappWebhookRoutes);
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ProTrack Institute OS API',
    environment: env.NODE_ENV,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/invites', invitesRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/platform-auth', platformAuthRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/admissions', admissionsRoutes);
app.use('/api', leadActivitiesRoutes);
app.use('/api', leadManagementRoutes);
app.use('/api', sourceAnalyticsRoutes);
app.use('/api', publicEnquiryRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api', feeStructuresRoutes);
app.use('/api', academicMasterRoutes);
app.use('/api', attendanceOperationsRoutes);
app.use('/api', whatsappTemplatesRoutes);
app.use('/api', parentCommunicationRoutes);
app.use('/api', teacherScoreRoutes);
app.use('/api', tenantFeeSettingsRoutes);
app.use('/api', feesRoutes);
app.use('/api', paymentLinksRoutes);
app.use('/api', discountRequestsRoutes);

// Remaining routes are migrated module by module while preserving frontend URLs.
app.use(legacyRoutes);

(async () => {
  await migrate();
  app.listen(env.PORT, () => {
    console.log(`Server listening on http://localhost:${env.PORT}`);
  });
})();
