const nodemailer = require('nodemailer');
const { env } = require('../config/env');

class MailDeliveryError extends Error {
  constructor(message, { code = 'MAIL_DELIVERY_FAILED', cause } = {}) {
    super(message);
    this.name = 'MailDeliveryError';
    this.code = code;

    if (cause) {
      this.cause = cause;
    }
  }
}

function isMailDeliveryError(error) {
  return (
    error instanceof MailDeliveryError ||
    String(error?.code || '').startsWith('MAIL_')
  );
}

function validateSmtpConfiguration(config) {
  const requiredVariables = [
    'MAIL_FROM',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASS',
  ];

  const missingVariables = requiredVariables.filter(
    (key) => config[key] === undefined || config[key] === null || String(config[key]).trim() === ''
  );

  if (missingVariables.length > 0) {
    throw new MailDeliveryError(
      `Missing SMTP configuration: ${missingVariables.join(', ')}`,
      { code: 'MAIL_CONFIGURATION_ERROR' }
    );
  }

  const port = Number(config.SMTP_PORT);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new MailDeliveryError('SMTP_PORT must be a valid port number', {
      code: 'MAIL_CONFIGURATION_ERROR',
    });
  }

  return port;
}

function createSmtpTransport(
  config,
  transportFactory = nodemailer.createTransport
) {
  const port = validateSmtpConfiguration(config);

  return transportFactory({
    host: config.SMTP_HOST,
    port,
    secure: Boolean(config.SMTP_SECURE),
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
}

function normalizeRecipient(value) {
  return String(value || '').trim().toLowerCase();
}

function createMailService({
  config = env,
  transport,
  transportFactory = nodemailer.createTransport,
  logger = console,
} = {}) {
  let activeTransport = transport || null;

  function getTransport() {
    if (!activeTransport) {
      activeTransport = createSmtpTransport(config, transportFactory);
    }

    return activeTransport;
  }

  async function sendEmail({ to, subject, text }) {
    if (!to || !subject || !text) {
      throw new TypeError('Email recipient, subject, and text are required');
    }

    // Preserve local development behaviour unless a test transport is injected.
    if (config.NODE_ENV !== 'production' && !activeTransport) {
      if (typeof logger.info === 'function') {
        logger.info('Email skipped outside production', {
          to,
          subject,
        });
      }

      return {
        success: true,
        skipped: true,
      };
    }

    let delivery;

    try {
      delivery = await getTransport().sendMail({
        from: config.MAIL_FROM,
        to,
        subject,
        text,
      });
    } catch (cause) {
      if (isMailDeliveryError(cause)) {
        throw cause;
      }

      throw new MailDeliveryError('SMTP email delivery failed', {
        code: 'MAIL_TRANSPORT_ERROR',
        cause,
      });
    }

    const accepted = Array.isArray(delivery.accepted)
      ? delivery.accepted.map(normalizeRecipient)
      : [];

    const rejected = Array.isArray(delivery.rejected)
      ? delivery.rejected.map(normalizeRecipient)
      : [];

    const recipient = normalizeRecipient(to);

    if (rejected.includes(recipient)) {
      throw new MailDeliveryError(
        'SMTP server rejected the email recipient',
        {
          code: 'MAIL_RECIPIENT_REJECTED',
        }
      );
    }

    if (accepted.length === 0) {
      throw new MailDeliveryError(
        'SMTP server did not accept the email recipient',
        {
          code: 'MAIL_DELIVERY_NOT_ACCEPTED',
        }
      );
    }

    return {
      success: true,
      messageId: delivery.messageId || null,
      accepted,
      rejected,
    };
  }

  async function sendPasswordResetEmail({ email, token }) {
    const resetUrl = `${config.APP_URL}/reset-password?token=${token}`;

    return sendEmail({
      to: email,
      subject: 'Reset your password',
      text: `Reset your password using this link: ${resetUrl}`,
    });
  }

  async function sendVerificationEmail({ email, token }) {
    const verifyUrl = `${config.APP_URL}/verify-email?token=${token}`;

    return sendEmail({
      to: email,
      subject: 'Verify your email',
      text: `Verify your email using this link: ${verifyUrl}`,
    });
  }

  async function sendInviteEmail({ email, token }) {
    const inviteUrl = `${config.APP_URL}/accept-invite?token=${token}`;

    return sendEmail({
      to: email,
      subject: 'You have been invited',
      text: `Accept your invite using this link: ${inviteUrl}`,
    });
  }

  return {
    sendEmail,
    sendPasswordResetEmail,
    sendVerificationEmail,
    sendInviteEmail,
  };
}

const defaultMailService = createMailService();

module.exports = {
  ...defaultMailService,
  createMailService,
  createSmtpTransport,
  MailDeliveryError,
  isMailDeliveryError,
};
