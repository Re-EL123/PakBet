const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

// Configure your email transport (Gmail example)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'yourgmail@gmail.com',      // ✅ Replace with your sending email
    pass: 'your_app_password_here'    // ✅ Use App Password, not your Gmail login
  }
});

// Cloud Function: Send Email When Voucher Decision Is Made
exports.sendVoucherDecisionEmail = functions.https.onCall(async (data, context) => {
  const { voucherId, status } = data;

  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin not authenticated');
  }

  // Fetch voucher details
  const voucherDoc = await admin.firestore().collection('pending_vouchers').doc(voucherId).get();
  if (!voucherDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Voucher not found');
  }

  const voucher = voucherDoc.data();

  // Fetch user details
  const userDoc = await admin.firestore().collection('users').doc(voucher.uid).get();
  const user = userDoc.exists ? userDoc.data() : { email: 'unknown@user.com' };

  const mailOptions = {
    from: 'PakBet Admin <yourgmail@gmail.com>',   // ✅ Replace with your sender email
    to: user.email,
    subject: `Voucher ${status.toUpperCase()} — PakBet`,
    text: `Dear User,\n\nYour voucher deposit (Ref: ${voucher.reference}) for amount R${voucher.amount} has been ${status} by the admin.\n\nThank you for playing on PakBet.\n\n— PakBet Team`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${user.email} for voucher ${status}`);
    return { success: true };
  } catch (error) {
    console.error('Error sending email:', error);
    throw new functions.https.HttpsError('internal', 'Failed to send email');
  }
});
