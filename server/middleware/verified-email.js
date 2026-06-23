function requireVerifiedEmail(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      message: 'Unauthorized',
    });
  }

  if (!req.user.emailVerifiedAt) {
    return res.status(403).json({
      message: 'Please verify your email before continuing',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }

  return next();
}

module.exports = {
  requireVerifiedEmail,
};
