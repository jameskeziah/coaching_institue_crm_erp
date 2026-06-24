const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

async function generateReceiptPdf({ receipt, outputDir = path.join('storage', 'receipts') }) {
  await fs.promises.mkdir(outputDir, { recursive: true });

  const filePath = path.join(outputDir, `${receipt.receiptNumber}.pdf`);
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  doc.fontSize(18).text('Fee Receipt', { align: 'center' });
  doc.moveDown();
  doc.fontSize(11);
  doc.text(`Receipt No: ${receipt.receiptNumber}`);
  doc.text(`Date: ${receipt.receiptDate}`);
  doc.text(`Branch: ${receipt.branchName || '-'}`);
  doc.moveDown();
  doc.text(`Student Name: ${receipt.studentName}`);
  doc.text(`Course: ${receipt.courseName}`);
  doc.text(`Amount Paid: INR ${receipt.amountPaid}`);
  doc.text(`Payment Mode: ${receipt.paymentMode}`);
  doc.text(`Pending Balance: INR ${receipt.pendingBalance}`);

  if (receipt.receiptFooterNote) {
    doc.moveDown(2);
    doc.fontSize(9).fillColor('#555555').text(receipt.receiptFooterNote, { align: 'center' });
    doc.fillColor('#000000').fontSize(11);
  }

  doc.moveDown(3);
  const signaturePath = receipt.authorizedSignatureUrl
    ? path.resolve(receipt.authorizedSignatureUrl)
    : null;
  if (signaturePath && fs.existsSync(signaturePath)) {
    doc.image(signaturePath, doc.page.width - 190, doc.y, { fit: [120, 50], align: 'right' });
    doc.moveDown(3);
  }
  doc.text('Authorized Signature', { align: 'right' });
  doc.text('____________________', { align: 'right' });
  doc.end();

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);
  });
  return filePath;
}

module.exports = {
  generateReceiptPdf,
};
