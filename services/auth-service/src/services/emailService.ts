import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendVerificationEmail = async (to: string, code: string) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
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
    console.log(`Email sent to ${to}`);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

