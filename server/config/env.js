const path = require('path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const booleanStringSchema = z
  .string()
  .transform((value) => value.toLowerCase())
  .refine((value) => ['true', 'false'].includes(value), {
    message: "Must be either 'true' or 'false'",
  })
  .transform((value) => value === 'true');

const optionalBooleanStringSchema = z
  .string()
  .optional()
  .default('false')
  .transform((value) => value.toLowerCase())
  .refine((value) => ['true', 'false'].includes(value), {
    message: "Must be either 'true' or 'false'",
  })
  .transform((value) => value === 'true');

const positiveIntegerSchema = (name, defaultValue) => z
  .string()
  .regex(/^\d+$/, `${name} must be a number`)
  .default(String(defaultValue))
  .transform(Number)
  .refine((value) => value > 0, { message: `${name} must be greater than zero` });

const requestSizeSchema = z
  .string()
  .regex(/^\d+(?:b|kb|mb)$/i, 'Request size must use b, kb, or mb units');

const corsOriginsSchema = z
  .string()
  .min(1, 'CORS_ORIGINS is required')
  .transform((value) => [...new Set(value.split(',').map((origin) => origin.trim()).filter(Boolean))])
  .pipe(z.array(z.string().url('Each CORS origin must be a valid URL')).min(1));

const applicationUrlSchema = (name) => z
  .string()
  .url(`${name} must be a valid URL`)
  .transform((value) => value.replace(/\/+$/, ''));

const jwtDurationSchema = z
  .string()
  .regex(/^\d+(?:ms|s|m|h|d|w|y)$/i, 'JWT_ACCESS_EXPIRES_IN must be a duration such as 15m or 1h');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  PORT: z
    .string()
    .regex(/^\d+$/, 'PORT must be a number')
    .transform(Number)
    .refine((value) => value > 0 && value < 65536, {
      message: 'PORT must be between 1 and 65535',
    }),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: booleanStringSchema,
  APP_URL: applicationUrlSchema('APP_URL'),
  API_URL: applicationUrlSchema('API_URL'),
  CORS_ORIGINS: corsOriginsSchema,
  TRUST_PROXY: optionalBooleanStringSchema,
  JSON_BODY_LIMIT: requestSizeSchema.default('1mb'),
  URLENCODED_BODY_LIMIT: requestSizeSchema.default('100kb'),
  RATE_LIMIT_WINDOW_MINUTES: positiveIntegerSchema('RATE_LIMIT_WINDOW_MINUTES', 15),
  LOGIN_RATE_LIMIT_MAX: positiveIntegerSchema('LOGIN_RATE_LIMIT_MAX', 30),
  PLATFORM_LOGIN_RATE_LIMIT_MAX: positiveIntegerSchema('PLATFORM_LOGIN_RATE_LIMIT_MAX', 10),
  PASSWORD_RESET_RATE_LIMIT_MAX: positiveIntegerSchema('PASSWORD_RESET_RATE_LIMIT_MAX', 5),
  ONBOARDING_RATE_LIMIT_MAX: positiveIntegerSchema('ONBOARDING_RATE_LIMIT_MAX', 3),
  PUBLIC_ENQUIRY_RATE_LIMIT_MAX: positiveIntegerSchema('PUBLIC_ENQUIRY_RATE_LIMIT_MAX', 20),
  JWT_ACCESS_EXPIRES_IN: jwtDurationSchema.default('15m'),
  REFRESH_TOKEN_DAYS: positiveIntegerSchema('REFRESH_TOKEN_DAYS', 30),
  RESET_PASSWORD_TOKEN_MINUTES: positiveIntegerSchema('RESET_PASSWORD_TOKEN_MINUTES', 30),
  EMAIL_VERIFICATION_TOKEN_HOURS: positiveIntegerSchema('EMAIL_VERIFICATION_TOKEN_HOURS', 24),
  INVITE_TOKEN_DAYS: positiveIntegerSchema('INVITE_TOKEN_DAYS', 7),
  OWNER_RECOVERY_TOKEN_HOURS: positiveIntegerSchema('OWNER_RECOVERY_TOKEN_HOURS', 24),
  TRIAL_DAYS: positiveIntegerSchema('TRIAL_DAYS', 14),
  EMAIL_OUTBOX_WORKER_ENABLED: optionalBooleanStringSchema,
  EMAIL_OUTBOX_WORKER_INTERVAL_MS: positiveIntegerSchema('EMAIL_OUTBOX_WORKER_INTERVAL_MS', 60000),
  EMAIL_OUTBOX_WORKER_LIMIT: positiveIntegerSchema('EMAIL_OUTBOX_WORKER_LIMIT', 20),
  EMAIL_OUTBOX_STALE_LOCK_MS: positiveIntegerSchema('EMAIL_OUTBOX_STALE_LOCK_MS', 600000),
  TENANT_BOOTSTRAP_SECRET: z.string().optional(),
  MAIL_FROM: z.string().email().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_SECURE: optionalBooleanStringSchema,
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  ALLOW_REGISTRATION: optionalBooleanStringSchema,
  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().optional().default('v22.0'),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('\nInvalid environment configuration:\n');
  for (const issue of parsed.error.issues) {
    console.error(`- ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\nServer startup stopped because required environment variables are invalid.\n');
  process.exit(1);
}

const env = parsed.data;
const productionRequiredVariables = [
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_API_VERSION',
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'TENANT_BOOTSTRAP_SECRET',
  'MAIL_FROM',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
];
const isMissing = (key) => !process.env[key] || process.env[key].trim() === '';

if (env.NODE_ENV === 'production') {
  const missingProductionVariables = productionRequiredVariables.filter(isMissing);
  if (missingProductionVariables.length > 0) {
    console.error('\nMissing required production environment variables:\n');
    for (const key of missingProductionVariables) console.error(`- ${key}`);
    console.error('\nServer startup stopped because production configuration is incomplete.\n');
    process.exit(1);
  }
} else {
  const missingOptionalVariables = productionRequiredVariables.filter(isMissing);
  if (missingOptionalVariables.length > 0) {
    console.warn('\nWarning: some production integration variables are missing:\n');
    for (const key of missingOptionalVariables) console.warn(`- ${key}`);
    console.warn('\nThis is allowed in development, but production will fail without them.\n');
  }
}

module.exports = { env };
