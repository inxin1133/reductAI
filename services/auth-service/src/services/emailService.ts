import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const smtpHost = process.env.EMAIL_HOST || 'smtp.gmail.com';
const smtpPort = Number(process.env.EMAIL_PORT) || 587;
const fromAddress = process.env.EMAIL_FROM || 'noreply@reduct.page';
const fromName = process.env.EMAIL_FROM_NAME || 'ReductAI';
const envelopeFrom = process.env.EMAIL_ENVELOPE_FROM || process.env.EMAIL_USER || fromAddress;
const contactRecipient = process.env.CONTACT_EMAIL || 'admin@reduct.page';

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

type VerificationPurpose = 'signup' | 'password_reset' | 'sso_email';

const VERIFICATION_COPY: Record<
  VerificationPurpose,
  { subject: string; title: string; description: string }
> = {
  signup: {
    subject: '회원가입 인증번호',
    title: 'ReductAI 회원가입 인증',
    description: '요청하신 회원가입 인증번호입니다.',
  },
  password_reset: {
    subject: '비밀번호 찾기 인증번호',
    title: 'ReductAI 비밀번호 찾기 인증',
    description: '요청하신 비밀번호 찾기 인증번호입니다.',
  },
  sso_email: {
    subject: '이메일 인증번호',
    title: 'ReductAI 이메일 인증',
    description: '요청하신 이메일 인증번호입니다.',
  },
};

export const sendVerificationEmail = async (
  to: string,
  code: string,
  purpose: VerificationPurpose = 'signup'
) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('Missing EMAIL_USER or EMAIL_PASS');
    return false;
  }
  const recipient = typeof to === 'string' ? to.trim() : '';
  if (!recipient) {
    console.error('Missing recipient email');
    return false;
  }
  const copy = VERIFICATION_COPY[purpose] ?? VERIFICATION_COPY.signup;
  const mailOptions = {
    from: `${fromName} <${fromAddress}>`,
    sender: envelopeFrom,
    replyTo: fromAddress,
    to: recipient,
    envelope: { from: envelopeFrom, to: recipient },
    subject: `[ReductAI] ${copy.subject}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${copy.title}</h2>
        <p>안녕하세요,</p>
        <p>${copy.description}</p>
        <div style="background-color: #f5f5f5; padding: 20px; text-align: center; border-radius: 5px; margin: 20px 0;">
          <h1 style="letter-spacing: 5px; margin: 0;">${code}</h1>
        </div>
        <p>이 코드는 20분간 유효합니다.</p>
        <p style="font-size: 12px; color: #666;">
          ※ 카카오/다음 메일은 수신까지 시간이 지연될 수 있습니다. 최대 20분까지 여유 있게 확인해주세요.
        </p>
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

type ContactPayload = {
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const sendContactEmail = async (payload: ContactPayload) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('Missing EMAIL_USER or EMAIL_PASS');
    return false;
  }
  const recipient = typeof contactRecipient === 'string' ? contactRecipient.trim() : '';
  if (!recipient) {
    console.error('Missing contact recipient');
    return false;
  }
  const safeName = escapeHtml(String(payload.name || ''));
  const safeEmail = escapeHtml(String(payload.email || ''));
  const safeCategory = escapeHtml(String(payload.category || ''));
  const safeSubject = escapeHtml(String(payload.subject || ''));
  const safeMessage = escapeHtml(String(payload.message || ''));
  const subject = `[ReductAI 문의] ${payload.subject || '문의 접수'}`;

  const text = [
    `이름: ${payload.name}`,
    `이메일: ${payload.email}`,
    `분류: ${payload.category}`,
    '',
    payload.subject,
    '',
    payload.message,
  ].join('\n');

  const mailOptions = {
    from: `${fromName} <${fromAddress}>`,
    sender: envelopeFrom,
    replyTo: payload.email || fromAddress,
    to: recipient,
    envelope: { from: envelopeFrom, to: recipient },
    subject,
    text,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <h2>${safeSubject || '문의 접수'}</h2>
        <p><strong>이름</strong>: ${safeName || '-'}</p>
        <p><strong>이메일</strong>: ${safeEmail || '-'}</p>
        <p><strong>분류</strong>: ${safeCategory || '-'}</p>
        <hr style="margin: 16px 0; border: none; border-top: 1px solid #eee;" />
        <pre style="white-space: pre-wrap; font-family: inherit; line-height: 1.5;">${safeMessage || '-'}</pre>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Contact email sent to ${recipient}`);
    return true;
  } catch (error) {
    const err = error as { message?: string; code?: string; response?: string; responseCode?: number };
    console.error('Error sending contact email:', {
      message: err?.message,
      code: err?.code,
      responseCode: err?.responseCode,
      response: err?.response,
    });
    return false;
  }
};

