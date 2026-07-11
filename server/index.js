const { env } = require('./config/env');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { migrate } = require('./db');
const authMiddleware = require('./middleware/auth');
const { requireTenant } = require('./middleware/tenant');
const { studentDataAccess } = require('./middleware/student-data-access');
const {
  loginRateLimit,
  platformLoginRateLimit,
  passwordResetRateLimit,
  onboardingRateLimit,
  publicEnquiryRateLimit,
} = require('./middleware/rate-limit');

const emailVerificationRoutes = require('./routes/email-verification.routes');
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
const allowedOrigins = new Set(env.CORS_ORIGINS);

if (env.TRUST_PROXY) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    const error = new Error('Origin is not allowed by CORS policy');
    error.code = 'CORS_ORIGIN_DENIED';
    return callback(error);
  },
}));

app.use('/api/webhooks/razorpay', razorpayWebhookRoutes);
app.use('/api/webhooks/whatsapp', whatsappWebhookRoutes);
app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: false, limit: env.URLENCODED_BODY_LIMIT }));

app.post('/api/auth/login', loginRateLimit);
app.post('/api/platform-auth/login', platformLoginRateLimit);
app.post('/api/auth/forgot-password', passwordResetRateLimit);
app.post('/api/auth/reset-password', passwordResetRateLimit);
app.post('/api/auth/resend-trial-verification', passwordResetRateLimit);
app.post('/api/onboarding/institute', onboardingRateLimit);
app.post('/api/public/enquiries', publicEnquiryRateLimit);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ProTrack Institute OS API',
    environment: env.NODE_ENV,
  });
});

app.use('/api/auth', emailVerificationRoutes);
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
app.use('/api/students', authMiddleware, requireTenant, studentDataAccess, studentsRoutes);
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
app.use(legacyRoutes);

app.use((error, req, res, next) => {
  if (error?.code === 'CORS_ORIGIN_DENIED') {
    return res.status(403).json({
      message: 'Origin is not allowed',
      code: 'CORS_ORIGIN_DENIED',
    });
  }

  if (error?.type === 'entity.too.large') {
    return res.status(413).json({
      message: 'Request body is too large',
      code: 'REQUEST_BODY_TOO_LARGE',
    });
  }

  return next(error);
});

(async () => {
  await migrate();
  app.listen(env.PORT, () => {
    console.log(`Server listening on http://localhost:${env.PORT}`);
  });
})();
