import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import * as db from '../config/db';
import { sendVerificationEmail } from '../services/emailService';
import type { AuthedRequest } from '../middleware/requireAuth';

// Temporary storage for OTPs (In production, use Redis)
const otpStore: Record<string, { code: string; expiresAt: number }> = {};

const getPrimaryTenantId = async (userId: string) => {
  const result = await db.query(
    `
      SELECT tenant_id
      FROM user_tenant_roles
      WHERE user_id = $1
        AND (membership_status IS NULL OR membership_status = 'active')
      ORDER BY is_primary_tenant DESC, joined_at ASC, granted_at ASC
      LIMIT 1
    `,
    [userId]
  );
  return result.rows[0]?.tenant_id || null;
};

const getPlatformRoleSlug = async (userId: string) => {
  const result = await db.query(
    `
      SELECT r.slug
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
        AND r.scope = 'platform'
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      ORDER BY ur.granted_at DESC NULLS LAST
      LIMIT 1
    `,
    [userId]
  );
  return result.rows[0]?.slug || null;
};

const validatePassword = (password: string) => {
  if (password.length < 8) return false;
  if (!/[A-Za-z]/.test(password)) return false;
  if (!/\d/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
};

export const sendVerificationCode = async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  // Check if user already exists
  try {
    const userCheck = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      // User exists - usually we'd send a login link or handle password reset, 
      // but for this flow we might want to indicate existence or just proceed for verification if it's login/signup flow
      // For now, we'll allow sending code even if user exists (for login verification or just flow)
      // or we can return a flag
    }
  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 3 * 60 * 1000; // 3 minutes

  otpStore[email] = { code, expiresAt };

  const emailSent = await sendVerificationEmail(email, code);

  if (emailSent) {
    res.json({ message: 'Verification code sent', success: true });
  } else {
    res.status(500).json({ message: 'Failed to send verification email', success: false });
  }
};

export const verifyCode = async (req: Request, res: Response) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ message: 'Email and code are required' });
  }

  const storedOtp = otpStore[email];

  if (!storedOtp) {
    return res.status(400).json({ message: 'No verification code found for this email', success: false });
  }

  if (Date.now() > storedOtp.expiresAt) {
    delete otpStore[email];
    return res.status(400).json({ message: 'Verification code expired', success: false });
  }

  if (storedOtp.code !== code) {
    return res.status(400).json({ message: 'Invalid verification code', success: false });
  }

  // Verification successful
  // DO NOT delete otpStore[email] here, because we need it for resetPassword or register steps
  // delete otpStore[email];
  
  // Check if user exists to guide frontend
  const userResult = await db.query('SELECT id, email, full_name FROM users WHERE email = $1', [email]);
  const isExistingUser = userResult.rows.length > 0;

  res.json({ 
    success: true, 
    message: 'Verification successful',
    isExistingUser
  });
};

export const checkEmail = async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const result = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    res.json({ exists: result.rows.length > 0 });
  } catch (error) {
    console.error('Check email error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  const { email, code, newPassword } = req.body;

  if (!email || !code || !newPassword) {
    return res.status(400).json({ message: 'Email, code, and new password are required' });
  }

  const storedOtp = otpStore[email];

  if (!storedOtp) {
    return res.status(400).json({ message: 'Verification code not found or expired', success: false });
  }

  if (Date.now() > storedOtp.expiresAt) {
    delete otpStore[email];
    return res.status(400).json({ message: 'Verification code expired', success: false });
  }

  if (storedOtp.code !== code) {
    return res.status(400).json({ message: 'Invalid verification code', success: false });
  }

  try {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    await db.query('UPDATE users SET password_hash = $1 WHERE email = $2', [passwordHash, email]);
    
    delete otpStore[email];

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {};
  const authedReq = req as AuthedRequest;
  const userId = authedReq.userId;

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ message: '모든 비밀번호 항목을 입력해 주세요.' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ message: '새 비밀번호가 일치하지 않습니다.' });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ message: '새 비밀번호는 현재 비밀번호와 달라야 합니다.' });
  }
  if (!validatePassword(newPassword)) {
    return res.status(400).json({ message: '새 비밀번호 조건을 충족해 주세요.' });
  }

  try {
    const userRes = await db.query('SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL', [userId]);
    const passwordHash = userRes.rows[0]?.password_hash;
    if (!passwordHash) {
      return res.status(400).json({ message: '비밀번호를 변경할 수 없습니다.' });
    }

    const isValid = await bcrypt.compare(String(currentPassword), String(passwordHash));
    if (!isValid) {
      return res.status(400).json({ message: '현재 비밀번호가 올바르지 않습니다.' });
    }

    const saltRounds = 10;
    const newHash = await bcrypt.hash(String(newPassword), saltRounds);
    await db.query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newHash, userId]);

    return res.json({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const register = async (req: Request, res: Response) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    // Check if user exists
    const userCheck = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const result = await db.query(
      'INSERT INTO users (email, password_hash, full_name, email_verified, status) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, full_name',
      [email, passwordHash, name, true, 'active']
    );

    const user = result.rows[0];
    
    const [tenantId, platformRole] = await Promise.all([
      getPrimaryTenantId(user.id),
      getPlatformRoleSlug(user.id),
    ]);

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, tenantId, platformRole },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );

    res.status(201).json({ 
      success: true,
      message: 'User registered successfully', 
      user,
      token,
      tenantId,
      platformRole
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.password_hash) {
      return res.status(401).json({ message: 'Please use SSO login' });
    }

    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Update last login
    await db.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    const [tenantId, platformRole] = await Promise.all([
      getPrimaryTenantId(user.id),
      getPlatformRoleSlug(user.id),
    ]);

    const token = jwt.sign(
      { userId: user.id, email: user.email, tenantId, platformRole },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      user: { id: user.id, email: user.email, full_name: user.full_name },
      token,
      tenantId,
      platformRole
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

