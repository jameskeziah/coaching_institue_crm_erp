const DEFAULT_MAX_KEYS = 10000;

function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function createRateLimiter({ windowMs, max, message, maxKeys = DEFAULT_MAX_KEYS }) {
  const entries = new Map();

  function removeExpired(now) {
    for (const [key, entry] of entries.entries()) {
      if (entry.resetAt <= now) entries.delete(key);
    }
  }

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = clientKey(req);
    let entry = entries.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      entries.set(key, entry);
    }

    entry.count += 1;
    const remaining = Math.max(max - entry.count, 0);
    const resetSeconds = Math.max(Math.ceil((entry.resetAt - now) / 1000), 1);

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(resetSeconds));

    if (entries.size > maxKeys) removeExpired(now);

    if (entry.count > max) {
      res.setHeader('Retry-After', String(resetSeconds));
      return res.status(429).json({
        message: message || 'Too many requests. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
      });
    }

    return next();
  };
}

const fifteenMinutes = 15 * 60 * 1000;
const oneHour = 60 * 60 * 1000;

const loginRateLimit = createRateLimiter({
  windowMs: fifteenMinutes,
  max: 10,
  message: 'Too many login attempts. Please try again later.',
});

const platformLoginRateLimit = createRateLimiter({
  windowMs: fifteenMinutes,
  max: 5,
  message: 'Too many platform login attempts. Please try again later.',
});

const passwordResetRateLimit = createRateLimiter({
  windowMs: oneHour,
  max: 5,
  message: 'Too many password reset attempts. Please try again later.',
});

const onboardingRateLimit = createRateLimiter({
  windowMs: oneHour,
  max: 3,
  message: 'Too many onboarding attempts. Please try again later.',
});

const publicEnquiryRateLimit = createRateLimiter({
  windowMs: fifteenMinutes,
  max: 10,
  message: 'Too many enquiries from this connection. Please try again later.',
});

module.exports = {
  createRateLimiter,
  loginRateLimit,
  platformLoginRateLimit,
  passwordResetRateLimit,
  onboardingRateLimit,
  publicEnquiryRateLimit,
};
