function generateInstallmentSchedule({
  totalAmount,
  installmentCount,
  admissionDate,
  gapDays = 30,
}) {
  const total = Number(totalAmount);
  const count = Number(installmentCount);

  if (!total || total <= 0) {
    throw new Error('Total amount must be greater than 0');
  }

  if (!count || count <= 0) {
    throw new Error('Installment count must be greater than 0');
  }

  const baseAmount = Math.floor(total / count);
  const remainder = total % count;
  const startDate = admissionDate ? new Date(admissionDate) : new Date();

  if (Number.isNaN(startDate.getTime())) {
    throw new Error('Admission date is invalid');
  }

  return Array.from({ length: count }).map((_, index) => {
    const dueDate = new Date(startDate);
    dueDate.setDate(startDate.getDate() + index * Number(gapDays || 0));

    return {
      installmentNumber: index + 1,
      title: index === 0 ? 'Admission installment' : `Installment ${index + 1}`,
      amount: baseAmount + (index === count - 1 ? remainder : 0),
      dueDate: dueDate.toISOString(),
      status: 'PENDING',
    };
  });
}

module.exports = {
  generateInstallmentSchedule,
};
