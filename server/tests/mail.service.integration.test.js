const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

// Prevent config/env.js from terminating the test process during import.
Object.assign(process.env, {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters',
  PORT: '4000',
  DATABASE_URL: ':memory:',
  DATABASE_SSL: 'false',
  APP_URL: 'https://app.example.test',
  API_URL: 'https://api.example.test',
  CORS_ORIGINS: 'https://app.example.test',
  MAIL_FROM: 'no-reply@example.test',
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'smtp-user',
  SMTP_PASS: 'smtp-password',
  TENANT_BOOTSTRAP_SECRET: 'test-bootstrap-secret',
  WHATSAPP_ACCESS_TOKEN: 'test',
  WHATSAPP_PHONE_NUMBER_ID: 'test',
  WHATSAPP_API_VERSION: 'v22.0',
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'test',
  WHATSAPP_APP_SECRET: 'test',
  RAZORPAY_KEY_ID: 'test',
  RAZORPAY_KEY_SECRET: 'test',
  RAZORPAY_WEBHOOK_SECRET: 'test',
});

const {
  createMailService,
  MailDeliveryError,
} = require('../services/mail.service');

const productionConfig = {
  NODE_ENV: 'production',
  APP_URL: 'https://app.example.test',
  MAIL_FROM: 'no-reply@example.test',
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '587',
  SMTP_SECURE: false,
  SMTP_USER: 'smtp-user',
  SMTP_PASS: 'smtp-password',
};

const silentLogger = {
  info() {},
  warn() {},
  error() {},
};

test('verification email is sent through an injected mail transport', async () => {
  const deliveredMessages = [];

  const mailService = createMailService({
    config: productionConfig,
    logger: silentLogger,
    transport: {
      async sendMail(message) {
        deliveredMessages.push(message);

        return {
          messageId: 'mock-message-1',
          accepted: [message.to],
          rejected: [],
        };
      },
    },
  });

  const result = await mailService.sendVerificationEmail({
    email: 'owner@example.test',
    token: 'verification-token',
  });

  assert.equal(result.success, true);
  assert.equal(result.messageId, 'mock-message-1');
  assert.deepEqual(result.accepted, ['owner@example.test']);

  assert.deepEqual(deliveredMessages, [
    {
      from: 'no-reply@example.test',
      to: 'owner@example.test',
      subject: 'Verify your email',
      text:
        'Verify your email using this link: ' +
        'https://app.example.test/verify-email?token=verification-token',
    },
  ]);
});

test('owner recovery email identifies the institute and expiry', async () => {
  const deliveredMessages = [];
  const mailService = createMailService({
    config: productionConfig,
    logger: silentLogger,
    transport: {
      async sendMail(message) {
        deliveredMessages.push(message);
        return { messageId: 'owner-recovery-message', accepted: [message.to], rejected: [] };
      },
    },
  });

  await mailService.sendOwnerRecoveryEmail({
    email: 'owner@example.test',
    token: 'owner-recovery-token',
    instituteName: 'Example Institute',
    expiresAt: '2026-07-15T12:00:00.000Z',
  });

  assert.equal(deliveredMessages[0].subject, 'Complete institute owner recovery');
  assert.match(deliveredMessages[0].text, /Example Institute/);
  assert.match(deliveredMessages[0].text, /2026-07-15T12:00:00\.000Z/);
  assert.match(deliveredMessages[0].text, /accept-owner-recovery\?token=owner-recovery-token/);
});

test('mail delivery throws when SMTP does not accept the recipient', async () => {
  const mailService = createMailService({
    config: productionConfig,
    logger: silentLogger,
    transport: {
      async sendMail(message) {
        return {
          messageId: 'mock-message-2',
          accepted: [],
          rejected: [message.to],
        };
      },
    },
  });

  await assert.rejects(
    () =>
      mailService.sendVerificationEmail({
        email: 'rejected@example.test',
        token: 'verification-token',
      }),
    (error) => {
      assert.ok(error instanceof MailDeliveryError);
      assert.equal(error.code, 'MAIL_RECIPIENT_REJECTED');
      return true;
    }
  );
});

test('mail delivery wraps transport-level SMTP failures', async () => {
  const smtpFailure = new Error('Mock SMTP connection refused');
  smtpFailure.code = 'ECONNECTION';

  const mailService = createMailService({
    config: productionConfig,
    logger: silentLogger,
    transport: {
      async sendMail() {
        throw smtpFailure;
      },
    },
  });

  await assert.rejects(
    () =>
      mailService.sendVerificationEmail({
        email: 'owner@example.test',
        token: 'verification-token',
      }),
    (error) => {
      assert.ok(error instanceof MailDeliveryError);
      assert.equal(error.code, 'MAIL_TRANSPORT_ERROR');
      assert.equal(error.cause, smtpFailure);
      return true;
    }
  );
});

test('mail delivery preserves SMTP configuration errors', async () => {
  const mailService = createMailService({
    config: {
      ...productionConfig,
      SMTP_PORT: 'not-a-port',
    },
    logger: silentLogger,
  });

  await assert.rejects(
    () =>
      mailService.sendVerificationEmail({
        email: 'owner@example.test',
        token: 'verification-token',
      }),
    (error) => {
      assert.ok(error instanceof MailDeliveryError);
      assert.equal(error.code, 'MAIL_CONFIGURATION_ERROR');
      return true;
    }
  );
});

function startMockSmtpServer({ rejectRecipient = false } = {}) {
  const messages = [];
  const server = net.createServer((socket) => {
    let mode = 'command';
    let dataLines = [];
    let currentMessage = {};

    function write(line) {
      socket.write(`${line}\r\n`);
    }

    write('220 mock-smtp ESMTP');

    socket.on('data', (chunk) => {
      for (const rawLine of chunk.toString('utf8').split(/\r?\n/)) {
        const line = rawLine.replace(/\r$/, '');
        if (!line) continue;

        if (mode === 'data') {
          if (line === '.') {
            currentMessage.data = dataLines.join('\n');
            messages.push(currentMessage);
            currentMessage = {};
            dataLines = [];
            mode = 'command';
            write('250 2.0.0 queued mock-message-id');
          } else {
            dataLines.push(line);
          }
          continue;
        }

        if (/^EHLO\b/i.test(line) || /^HELO\b/i.test(line)) {
          write('250-mock-smtp');
          write('250 AUTH PLAIN LOGIN');
        } else if (/^AUTH\b/i.test(line)) {
          write('235 2.7.0 Authentication successful');
        } else if (/^MAIL FROM:/i.test(line)) {
          currentMessage.from = line;
          write('250 2.1.0 Sender OK');
        } else if (/^RCPT TO:/i.test(line)) {
          currentMessage.to = line;
          write(rejectRecipient ? '550 5.1.1 Recipient rejected' : '250 2.1.5 Recipient OK');
        } else if (/^DATA\b/i.test(line)) {
          mode = 'data';
          write('354 End data with <CR><LF>.<CR><LF>');
        } else if (/^QUIT\b/i.test(line)) {
          write('221 2.0.0 Bye');
          socket.end();
        } else {
          write('250 OK');
        }
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        port: address.port,
        messages,
        close: () => new Promise((closeResolve) => server.close(closeResolve)),
      });
    });
  });
}

test('verification email is sent through real Nodemailer SMTP transport against a mock server', async () => {
  const smtp = await startMockSmtpServer();

  try {
    const mailService = createMailService({
      config: {
        ...productionConfig,
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: String(smtp.port),
        SMTP_SECURE: false,
      },
      logger: silentLogger,
    });

    const result = await mailService.sendVerificationEmail({
      email: 'owner@example.test',
      token: 'verification-token',
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.accepted, ['owner@example.test']);
    assert.equal(smtp.messages.length, 1);
    assert.match(smtp.messages[0].data, /Verify your email/);
    assert.doesNotMatch(smtp.messages[0].data, /smtp-password/);
  } finally {
    await smtp.close();
  }
});
