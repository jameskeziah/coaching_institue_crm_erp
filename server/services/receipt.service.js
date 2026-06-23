function generateReceiptNumber(paymentId) {
  const padded = String(paymentId || Date.now()).padStart(6, '0');
  return `RCPT-${new Date().getFullYear()}-${padded}`;
}

function buildReceiptData(payment) {
  return {
    receiptNumber: payment.receiptNumber || generateReceiptNumber(payment.id),
    studentId: payment.student_id || payment.studentId,
    feePlanId: payment.fee_plan_id || payment.feePlanId,
    amount: Number(payment.amount || 0),
    paymentMethod: payment.paymentMethod,
    paidAt: payment.paymentDate || new Date().toISOString(),
  };
}

module.exports = {
  generateReceiptNumber,
  buildReceiptData,
};
