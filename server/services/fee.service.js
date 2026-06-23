function calculatePendingFee(totalFee, paidAmount, discountAmount = 0) {
  const finalFee = Number(totalFee || 0) - Number(discountAmount || 0);
  const pendingFee = finalFee - Number(paidAmount || 0);

  return {
    totalFee: Number(totalFee || 0),
    discountAmount: Number(discountAmount || 0),
    finalFee,
    paidAmount: Number(paidAmount || 0),
    pendingFee,
    isFullyPaid: pendingFee <= 0,
  };
}

function validateFeePayment({ student_id, studentId, fee_plan_id, feePlanId, amount, paymentMethod }) {
  if (!student_id && !studentId) {
    throw new Error('Student ID is required');
  }

  if (!fee_plan_id && !feePlanId) {
    throw new Error('Fee plan ID is required');
  }

  if (!amount || Number(amount) <= 0) {
    throw new Error('Valid amount is required');
  }

  if (!paymentMethod) {
    throw new Error('Payment method is required');
  }
}

module.exports = {
  calculatePendingFee,
  validateFeePayment,
};
