const FeeInstallmentStatus = Object.freeze({
  PENDING: 'PENDING',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
});

const PaymentLinkStatus = Object.freeze({
  CREATED: 'CREATED',
  ISSUED: 'ISSUED',
  SENT: 'SENT',
  PAID: 'PAID',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
});

const DiscountRequestStatus = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
});

module.exports = {
  FeeInstallmentStatus,
  PaymentLinkStatus,
  DiscountRequestStatus,
};
