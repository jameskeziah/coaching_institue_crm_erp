const fs = require('fs');
const path = require('path');

function escapePdfText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function writeMinimalPdf(lines, filePath) {
  const objects = [];
  const content = [
    'BT',
    '/F1 18 Tf',
    '190 780 Td',
    `(${escapePdfText('Fee Receipt')}) Tj`,
    '/F1 11 Tf',
  ];

  let yStep = -28;
  for (const line of lines) {
    content.push(`0 ${yStep} Td`);
    content.push(`(${escapePdfText(line)}) Tj`);
    yStep = -18;
  }
  content.push('ET');

  const stream = content.join('\n');
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  fs.writeFileSync(filePath, pdf);
}

async function generateReceiptPdf({ receipt, outputDir = path.join('storage', 'receipts') }) {
  await fs.promises.mkdir(outputDir, { recursive: true });

  const fileName = `${receipt.receiptNumber}.pdf`;
  const filePath = path.join(outputDir, fileName);
  const lines = [
    `Receipt No: ${receipt.receiptNumber}`,
    `Date: ${receipt.receiptDate}`,
    `Branch: ${receipt.branchName || '-'}`,
    '',
    `Student Name: ${receipt.studentName}`,
    `Course: ${receipt.courseName}`,
    `Amount Paid: INR ${receipt.amountPaid}`,
    `Payment Mode: ${receipt.paymentMode}`,
    `Pending Balance: INR ${receipt.pendingBalance}`,
    '',
    receipt.receiptFooterNote || '',
    '',
    'Authorized Signature',
    '____________________',
  ];

  writeMinimalPdf(lines, filePath);
  return filePath;
}

module.exports = {
  generateReceiptPdf,
};
