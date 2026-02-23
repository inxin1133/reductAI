import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const smtpHost = process.env.EMAIL_HOST || 'smtp.gmail.com';
const smtpPort = Number(process.env.EMAIL_PORT) || 587;
const fromAddress = process.env.EMAIL_FROM || 'noreply@reduct.page';
const fromName = process.env.EMAIL_FROM_NAME || 'ReductAI';
const envelopeFrom = process.env.EMAIL_ENVELOPE_FROM || process.env.EMAIL_USER || fromAddress;

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  requireTLS: smtpPort === 587,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendVerificationEmail = async (to: string, code: string) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('Missing EMAIL_USER or EMAIL_PASS');
    return false;
  }
  const recipient = typeof to === 'string' ? to.trim() : '';
  if (!recipient) {
    console.error('Missing recipient email');
    return false;
  }
  const mailOptions = {
    from: `${fromName} <${fromAddress}>`,
    sender: envelopeFrom,
    replyTo: fromAddress,
    to: recipient,
    envelope: { from: envelopeFrom, to: recipient },
    subject: '[ReductAI] 회원가입 인증번호',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>ReductAI 회원가입 인증</h2>
        <p>안녕하세요,</p>
        <p>요청하신 회원가입 인증번호입니다.</p>
        <div style="background-color: #f5f5f5; padding: 20px; text-align: center; border-radius: 5px; margin: 20px 0;">
          <h1 style="letter-spacing: 5px; margin: 0;">${code}</h1>
        </div>
        <p>이 코드는 3분간 유효합니다.</p>
        <p>본인이 요청하지 않았다면 이 메일을 무시해주세요.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${recipient}`);
    return true;
  } catch (error) {
    const err = error as { message?: string; code?: string; response?: string; responseCode?: number };
    console.error('Error sending email:', {
      message: err?.message,
      code: err?.code,
      responseCode: err?.responseCode,
      response: err?.response,
    });
    return false;
  }
};

