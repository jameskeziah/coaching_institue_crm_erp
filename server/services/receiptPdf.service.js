const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const PDFDocument = require('pdfkit');

const DEFAULT_RECEIPT_DIRECTORY = path.join('storage', 'receipts');

function tenantIdentifier(tenantId) {
  const identifier = String(tenantId ?? '');
  if (!/^[1-9]\d*$/.test(identifier)) throw new Error('A valid tenant is required for receipt files');
  return identifier;
}

function containsPath(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative !== '' && relative !== '..'
    && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function tenantDirectory(root, tenantId, { create = false } = {}) {
  const identifier = tenantIdentifier(tenantId);
  // Refuse aliases in the configured root or its existing parents, before mkdir
  // can follow a junction outside the application's storage directory.
  let existingAncestor = path.resolve(root);
  for (;;) {
    try {
      const canonicalAncestor = await fs.promises.realpath(existingAncestor);
      if (path.relative(existingAncestor, canonicalAncestor) !== '') throw new Error('Unsafe tenant file root');
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(existingAncestor);
      if (parent === existingAncestor) throw error;
      existingAncestor = parent;
    }
  }
  if (create) await fs.promises.mkdir(root, { recursive: true });
  const canonicalRoot = await fs.promises.realpath(root);
  const directory = path.join(canonicalRoot, identifier);
  if (create) await fs.promises.mkdir(directory, { recursive: true });
  // A tenant directory may not alias another tenant or an external directory.
  const canonicalDirectory = await fs.promises.realpath(directory);
  if (path.relative(canonicalRoot, canonicalDirectory) !== identifier) {
    throw new Error('Unsafe tenant file directory');
  }
  return canonicalDirectory;
}

async function ownedFile(root, tenantId, filePath, extensions) {
  if (typeof filePath !== 'string' || !extensions.includes(path.extname(filePath).toLowerCase())) return null;
  try {
    const directory = await tenantDirectory(root, tenantId);
    const candidate = await fs.promises.realpath(path.resolve(filePath));
    if (!containsPath(directory, candidate) || !(await fs.promises.stat(candidate)).isFile()) return null;
    return candidate;
  } catch (_error) {
    return null;
  }
}

async function resolveReceiptPdfPath({ tenantId, filePath, outputDir = DEFAULT_RECEIPT_DIRECTORY }) {
  // Shared legacy files have no trustworthy tenant namespace and stay unavailable.
  return ownedFile(outputDir, tenantId, filePath, ['.pdf']);
}

async function generateReceiptPdf({ tenantId, receipt, outputDir = DEFAULT_RECEIPT_DIRECTORY }) {
  const directory = await tenantDirectory(outputDir, tenantId, { create: true });

  // Receipt numbers are editable display values, never filesystem names.
  const filePath = path.join(directory, `${crypto.randomUUID()}.pdf`);
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const stream = fs.createWriteStream(filePath, { flags: 'wx' });
  let created = false;
  stream.once('open', () => { created = true; });
  const completion = pipeline(doc, stream);
  completion.catch(() => {});

  try {
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
    const signaturePath = await ownedFile(path.join('storage', 'tenants'), tenantId,
      receipt.authorizedSignatureUrl, ['.png', '.jpg', '.jpeg']);
    if (signaturePath) {
      try {
        const signature = await fs.promises.readFile(signaturePath);
        doc.image(signature, doc.page.width - 190, doc.y, { fit: [120, 50], align: 'right' });
        doc.moveDown(3);
      } catch (_error) {
        // Missing or invalid legacy signature images must not block a payment.
      }
    }
    doc.text('Authorized Signature', { align: 'right' });
    doc.text('____________________', { align: 'right' });
    doc.end();

    await completion;
    return filePath;
  } catch (error) {
    doc.destroy(error);
    stream.destroy(error);
    await completion.catch(() => {});
    if (created) await fs.promises.unlink(filePath).catch(() => {});
    throw error;
  }
}

module.exports = {
  generateReceiptPdf,
  resolveReceiptPdfPath,
};
