function calculateAttendancePercentage(presentDays, totalDays) {
  if (!totalDays || Number(totalDays) <= 0) return 0;
  return Math.round((Number(presentDays || 0) / Number(totalDays)) * 100);
}

function getAttendanceStatus(percentage) {
  if (percentage >= 90) return 'excellent';
  if (percentage >= 75) return 'good';
  if (percentage >= 60) return 'warning';
  return 'critical';
}

module.exports = {
  calculateAttendancePercentage,
  getAttendanceStatus,
};
