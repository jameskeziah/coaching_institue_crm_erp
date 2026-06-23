const { env } = require('../config/env');

async function sendEmail({ to, subject, text }) {
  if (env.NODE_ENV !== 'production') {
    console.log('Email skipped in development:');
    console.log({ to, subject, text });

    return {
      success: true,
      skipped: true,
    };
  }

  console.log('Production email provider not implemented yet');

  return {
    success: false,
  };
}

async function sendPasswordResetEmail({ email, token }) {
  const resetUrl = `${env.APP_URL}/reset-password?token=${token}`;

  return sendEmail({
    to: email,
    subject: 'Reset your password',
    text: `Reset your password using this link: ${resetUrl}`,
  });
}

async function sendVerificationEmail({ email, token }) {
  const verifyUrl = `${env.APP_URL}/verify-email?token=${token}`;

  return sendEmail({
    to: email,
    subject: 'Verify your email',
    text: `Verify your email using this link: ${verifyUrl}`,
  });
}

async function sendInviteEmail({ email, token }) {
  const inviteUrl = `${env.APP_URL}/accept-invite?token=${token}`;

  return sendEmail({
    to: email,
    subject: 'You have been invited',
    text: `Accept your invite using this link: ${inviteUrl}`,
  });
}

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendInviteEmail,
};
