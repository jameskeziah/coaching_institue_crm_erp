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
  APP_URL: z.string().url('APP_URL must be a valid URL'),
  API_URL: z.string().url('API_URL must be a valid URL'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z
    .string()
    .regex(/^\d+$/, 'REFRESH_TOKEN_DAYS must be a number')
    .transform(Number)
    .default('30'),
  RESET_PASSWORD_TOKEN_MINUTES: z
    .string()
    .regex(/^\d+$/, 'RESET_PASSWORD_TOKEN_MINUTES must be a number')
    .transform(Number)
    .default('30'),
  EMAIL_VERIFICATION_TOKEN_HOURS: z
    .string()
    .regex(/^\d+$/, 'EMAIL_VERIFICATION_TOKEN_HOURS must be a number')
    .transform(Number)
    .default('24'),
  INVITE_TOKEN_DAYS: z
    .string()
    .regex(/^\d+$/, 'INVITE_TOKEN_DAYS must be a number')
    .transform(Number)
    .default('7'),
  TENANT_BOOTSTRAP_SECRET: z.string().optional(),
  MAIL_FROM: z.string().email().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
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
  'SMTP_USER',
  'SMTP_PASS',
];

const isMissing = (key) => !process.env[key] || process.env[key].trim() === '';

if (env.NODE_ENV === 'production') {
  const missingProductionVariables = productionRequiredVariables.filter(isMissing);

  if (missingProductionVariables.length > 0) {
    console.error('\nMissing required production environment variables:\n');

    for (const key of missingProductionVariables) {
      console.error(`- ${key}`);
    }

    console.error('\nServer startup stopped because production configuration is incomplete.\n');
    process.exit(1);
  }
} else {
  const missingOptionalVariables = productionRequiredVariables.filter(isMissing);

  if (missingOptionalVariables.length > 0) {
    console.warn('\nWarning: some production integration variables are missing:\n');

    for (const key of missingOptionalVariables) {
      console.warn(`- ${key}`);
    }

    console.warn('\nThis is allowed in development, but production will fail without them.\n');
  }
}

module.exports = {
  env,
};
