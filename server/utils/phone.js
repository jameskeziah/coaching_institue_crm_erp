function normalizeIndianPhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

module.exports = {
  normalizeIndianPhone,
};
