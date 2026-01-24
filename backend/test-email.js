const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const nodemailer = require('nodemailer');

const sendTestEmail = async () => {
  console.log('📧 Testing Email Configuration...');
  console.log(`User: ${process.env.SMTP_EMAIL}`);
  // Hide password in logs
  console.log(`Pass: ${process.env.SMTP_PASSWORD ? '********' : 'NOT SET'}`);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `${process.env.FROM_NAME || 'RubberSense'} <${process.env.SMTP_EMAIL}>`,
      to: process.env.SMTP_EMAIL, // Send to self
      subject: 'RubberSense SMTP Test',
      text: 'If you receive this, your email configuration is working correctly! 🚀',
    });

    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
  } catch (error) {
    console.error('❌ Email failed to send.');
    console.error('Error:', error.message);
    if (error.code === 'EAUTH') {
      console.log('\n💡 Tip: This is usually an authentication error.');
      console.log('1. Check if your email is correct.');
      console.log('2. Ensure you are using an "App Password", NOT your login password.');
      console.log('3. Make sure 2-Step Verification is enabled on your Google Account.');
    }
  }
};

sendTestEmail();
