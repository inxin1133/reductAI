import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import * as db from '../config/db';
import { sendVerificationEmail } from '../services/emailService';
import type { AuthedRequest } from '../middleware/requireAuth';
import crypto from 'crypto';

const MAX_TENANT_SLUG_LENGTH = 24;
const PERSONAL_SLUG_SUFFIX_LENGTH = 6;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SSO_PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;

const slugifyTenant = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

const normalizeTenantSlug = (value: string, maxLength = MAX_TENANT_SLUG_LENGTH) => {
  const cleaned = slugifyTenant(value);
  if (!cleaned) return '';
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).replace(/-+$/g, '');
};

const buildPersonalTenantSlug = (nameOrEmail: string, userId: string) => {
  const suffix = userId.replace(/-/g, '').slice(0, PERSONAL_SLUG_SUFFIX_LENGTH);
  const baseRaw = normalizeTenantSlug(nameOrEmail, MAX_TENANT_SLUG_LENGTH);
  const maxBaseLength = MAX_TENANT_SLUG_LENGTH - (suffix.length + 1);
  const base = maxBaseLength > 0 ? normalizeTenantSlug(baseRaw, maxBaseLength) : '';
  return base ? `${base}-${suffix}` : suffix;
};

// Temporary storage for OTPs (In production, use Redis)
const otpStore: Record<string, { code: string; expiresAt: number }> = {};
const oauthStateStore: Record<string, number> = {};
let ssoPendingReady = false;

const getPrimaryTenantId = async (userId: string) => {
  const result = await db.query(
    `
      SELECT utr.tenant_id
      FROM user_tenant_roles utr
      JOIN tenants t ON t.id = utr.tenant_id AND t.deleted_at IS NULL
      WHERE utr.user_id = $1
        AND (utr.membership_status IS NULL OR utr.membership_status = 'active')
        AND COALESCE((t.metadata->>'system')::boolean, FALSE) = FALSE
      ORDER BY COALESCE(utr.is_primary_tenant, FALSE) DESC, utr.joined_at ASC, utr.granted_at ASC
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

const normalizeEmail = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const toStr = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const consumeOauthState = (state: string) => {
  const expiresAt = oauthStateStore[state];
  delete oauthStateStore[state];
  if (!expiresAt) return false;
  return Date.now() <= expiresAt;
};

const buildFrontendRedirect = (params: Record<string, string | null | undefined>) => {
  const baseUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:5173';
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return url.toString();
};

const buildFrontendUrl = (path: string, params: Record<string, string | null | undefined>) => {
  const baseUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:5173';
  const url = new URL(baseUrl);
  url.pathname = path;
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return url.toString();
};

const buildJwtRedirect = async (userRow: any, provider: string, tenantIdOverride?: string | null, isNewUser = false) => {
  const [resolvedTenantId, platformRole] = await Promise.all([
    tenantIdOverride || getPrimaryTenantId(userRow.id),
    getPlatformRoleSlug(userRow.id),
  ]);

  const token = jwt.sign(
    { userId: userRow.id, email: userRow.email, tenantId: resolvedTenantId || undefined, platformRole },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '24h' }
  );

  return buildFrontendRedirect({
    token,
    user_id: userRow.id,
    user_email: userRow.email,
    user_name: userRow.full_name || '',
    tenant_id: resolvedTenantId || '',
    platform_role: platformRole || '',
    provider,
    new_user: isNewUser ? '1' : '0',
  });
};

const createUserWithPersonalTenant = async (client: any, email: string, fullName: string, metadata: Record<string, unknown>) => {
  const insertRes = await client.query(
    'INSERT INTO users (email, password_hash, full_name, email_verified, status, metadata) VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id, email, full_name',
    [email, null, fullName || email, true, 'active', JSON.stringify(metadata || {})]
  );
  const user = insertRes.rows[0];

  const ownerRoleRes = await client.query(
    `SELECT id FROM roles WHERE scope = 'tenant_base' AND slug = 'owner' LIMIT 1`
  );
  const ownerRoleId =
    ownerRoleRes.rows[0]?.id ||
    (
      await client.query(
        `
        INSERT INTO roles (name, slug, description, scope, tenant_id, is_system_role)
        VALUES ($1, $2, $3, 'tenant_base', NULL, TRUE)
        RETURNING id
        `,
        ['소유자', 'owner', 'Tenant base role: owner']
      )
    ).rows[0]?.id;

  if (!ownerRoleId) {
    throw new Error('OWNER_ROLE_MISSING');
  }

  const tenantName = user.full_name || user.email;
  const tenantSlug = buildPersonalTenantSlug(tenantName || user.email, user.id);
  const tenantRes = await client.query(
    `
    INSERT INTO tenants (owner_id, name, slug, tenant_type, status, member_limit, current_member_count, metadata)
    VALUES ($1,$2,$3,'personal','active',$4,$5,$6::jsonb)
    RETURNING id
    `,
    [user.id, tenantName, tenantSlug, 1, 1, JSON.stringify({ plan_tier: 'free' })]
  );
  const tenantId = tenantRes.rows[0]?.id;
  if (!tenantId) {
    throw new Error('TENANT_CREATE_FAILED');
  }

  await client.query(
    `
    INSERT INTO user_tenant_roles (
      user_id,
      tenant_id,
      role_id,
      membership_status,
      joined_at,
      is_primary_tenant,
      granted_by
    )
    VALUES ($1, $2, $3, 'active', CURRENT_TIMESTAMP, TRUE, $4)
    ON CONFLICT (user_id, tenant_id, role_id)
    DO UPDATE SET
      membership_status = 'active',
      left_at = NULL,
      is_primary_tenant = TRUE
    `,
    [user.id, tenantId, ownerRoleId, user.id]
  );

  return { user, tenantId };
};

const issueOtp = (email: string) => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = { code, expiresAt: Date.now() + OTP_TTL_MS };
  return code;
};

const isExpired = (expiresAt: string | null) => {
  if (!expiresAt) return false;
  const ts = new Date(expiresAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return ts < Date.now();
};

const ensureSsoPendingTable = async () => {
  if (ssoPendingReady) return;
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS sso_pending (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      provider VARCHAR(50) NOT NULL CHECK (provider IN ('google', 'kakao', 'naver')),
      provider_user_id VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired')),
      sso_token VARCHAR(255) NOT NULL UNIQUE,
      expires_at TIMESTAMP WITH TIME ZONE,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (provider, provider_user_id)
    );
    `
  );
  await db.query(`CREATE INDEX IF NOT EXISTS idx_sso_pending_provider_user ON sso_pending(provider, provider_user_id);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_sso_pending_token ON sso_pending(sso_token);`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_sso_pending_status ON sso_pending(status);`);
  ssoPendingReady = true;
};

const upsertSsoPending = async (
  provider: string,
  providerUserId: string,
  emailHint: string | null,
  metadata: Record<string, unknown>
) => {
  await ensureSsoPendingTable();
  const existing = await db.query(
    `SELECT id, email, expires_at, status FROM sso_pending WHERE provider = $1 AND provider_user_id = $2 LIMIT 1`,
    [provider, providerUserId]
  );
  const token = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + SSO_PENDING_TTL_MS).toISOString();
  const row = existing.rows[0];
  const nextEmail = emailHint || row?.email || null;

  if (row) {
    await db.query(
      `
      UPDATE sso_pending
      SET sso_token = $1,
          email = $2,
          status = 'pending',
          expires_at = $3,
          metadata = $4::jsonb,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      `,
      [token, nextEmail, expiresAt, JSON.stringify(metadata || {}), row.id]
    );
  } else {
    await db.query(
      `
      INSERT INTO sso_pending (provider, provider_user_id, email, status, sso_token, expires_at, metadata)
      VALUES ($1, $2, $3, 'pending', $4, $5, $6::jsonb)
      `,
      [provider, providerUserId, nextEmail, token, expiresAt, JSON.stringify(metadata || {})]
    );
  }

  return { token, email: nextEmail };
};

const getSsoPendingByToken = async (token: string) => {
  await ensureSsoPendingTable();
  const res = await db.query(`SELECT * FROM sso_pending WHERE sso_token = $1 LIMIT 1`, [token]);
  return res.rows[0] || null;
};

export const sendVerificationCode = async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
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

  const code = issueOtp(email);
  const emailSent = await sendVerificationEmail(email, code);

  if (emailSent) {
    res.json({ message: 'Verification code sent', success: true });
  } else {
    res.status(500).json({ message: 'Failed to send verification email', success: false });
  }
};

export const verifyCode = async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body?.email);
  const { code } = req.body;

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

export const sendSsoEmailCode = async (req: Request, res: Response) => {
  const ssoToken = toStr(req.body?.sso_token);
  const email = normalizeEmail(req.body?.email);
  if (!ssoToken) return res.status(400).json({ message: 'sso_token is required' });
  if (!email) return res.status(400).json({ message: 'Email is required' });
  if (!isValidEmail(email)) return res.status(400).json({ message: 'Invalid email format' });

  try {
    const pending = await getSsoPendingByToken(ssoToken);
    if (!pending) return res.status(404).json({ message: 'SSO session not found' });
    if (isExpired(pending.expires_at)) {
      await db.query(`UPDATE sso_pending SET status = 'expired' WHERE id = $1`, [pending.id]);
      return res.status(400).json({ message: 'SSO session expired' });
    }

    await db.query(`UPDATE sso_pending SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [
      email,
      pending.id,
    ]);

    const code = issueOtp(email);
    const emailSent = await sendVerificationEmail(email, code);
    if (!emailSent) return res.status(500).json({ message: 'Failed to send verification email' });

    return res.json({ success: true });
  } catch (error) {
    console.error('sendSsoEmailCode error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const verifySsoEmailCode = async (req: Request, res: Response) => {
  const ssoToken = toStr(req.body?.sso_token);
  const email = normalizeEmail(req.body?.email);
  const { code } = req.body;
  if (!ssoToken) return res.status(400).json({ message: 'sso_token is required' });
  if (!email || !code) return res.status(400).json({ message: 'Email and code are required' });
  if (!isValidEmail(email)) return res.status(400).json({ message: 'Invalid email format' });

  const storedOtp = otpStore[email];
  if (!storedOtp) return res.status(400).json({ message: 'No verification code found for this email' });
  if (Date.now() > storedOtp.expiresAt) {
    delete otpStore[email];
    return res.status(400).json({ message: 'Verification code expired' });
  }
  if (storedOtp.code !== code) {
    return res.status(400).json({ message: 'Invalid verification code' });
  }

  const pending = await getSsoPendingByToken(ssoToken);
  if (!pending) return res.status(404).json({ message: 'SSO session not found' });
  if (isExpired(pending.expires_at)) {
    await db.query(`UPDATE sso_pending SET status = 'expired' WHERE id = $1`, [pending.id]);
    return res.status(400).json({ message: 'SSO session expired' });
  }
  if (pending.email && pending.email !== email) {
    return res.status(400).json({ message: 'Email mismatch', code: 'email_mismatch' });
  }

  const provider = String(pending.provider || '');
  const providerUserId = String(pending.provider_user_id || '');
  if (!provider || !providerUserId) {
    return res.status(400).json({ message: 'Invalid SSO session' });
  }

  const client = await db.default.connect();
  try {
    await client.query('BEGIN');

    const providerRes = await client.query(
      'SELECT user_id FROM user_providers WHERE provider = $1 AND provider_user_id = $2 LIMIT 1',
      [provider, providerUserId]
    );
    const providerUserIdRow = providerRes.rows[0]?.user_id || null;

    const emailUserRes = await client.query('SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL', [email]);
    const emailUser = emailUserRes.rows[0] || null;

    if (providerUserIdRow && emailUser && String(emailUser.id) !== String(providerUserIdRow)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Email already in use', code: 'email_in_use' });
    }

    let userRow = null;
    let tenantId: string | null = null;
    let isNewUser = false;

    if (providerUserIdRow) {
      const userRes = await client.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [providerUserIdRow]);
      userRow = userRes.rows[0] || null;
    }

    if (!userRow && emailUser) {
      userRow = emailUser;
    }

    if (!userRow) {
      isNewUser = true;
      const pendingMeta = pending.metadata && typeof pending.metadata === 'object' ? pending.metadata : {};
      const fullName = typeof pendingMeta?.name === 'string' ? pendingMeta.name : email;
      const created = await createUserWithPersonalTenant(client, email, fullName, {
        auth_provider: provider,
        sso_pending: true,
      });
      userRow = created.user;
      tenantId = created.tenantId;
    } else {
      if (userRow.email !== email) {
        await client.query('UPDATE users SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [email, userRow.id]);
        userRow.email = email;
      }
      if (!userRow.email_verified) {
        await client.query('UPDATE users SET email_verified = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [
          userRow.id,
        ]);
        userRow.email_verified = true;
      }
    }

    await client.query(
      `
      INSERT INTO user_providers (user_id, provider, provider_user_id, extra_data)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (provider, provider_user_id)
      DO UPDATE SET user_id = EXCLUDED.user_id, extra_data = EXCLUDED.extra_data
      `,
      [
        userRow.id,
        provider,
        providerUserId,
        JSON.stringify({
          email,
          provider,
          ...(pending.metadata && typeof pending.metadata === 'object' ? pending.metadata : {}),
        }),
      ]
    );

    await client.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [userRow.id]);
    await client.query('DELETE FROM sso_pending WHERE id = $1', [pending.id]);
    await client.query('COMMIT');

    delete otpStore[email];

    const redirectUrl = await buildJwtRedirect(userRow, provider, tenantId, isNewUser);
    return res.json({ success: true, redirect_url: redirectUrl });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('verifySsoEmailCode error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const checkEmail = async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body?.email);

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
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
  const email = normalizeEmail(req.body?.email);
  const { code, newPassword } = req.body;

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
  const email = normalizeEmail(req.body?.email);
  const { password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }

  const client = await db.default.connect();
  try {
    await client.query('BEGIN');
    // Check if user exists
    const userCheck = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'User already exists' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const result = await client.query(
      'INSERT INTO users (email, password_hash, full_name, email_verified, status) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, full_name',
      [email, passwordHash, name, true, 'active']
    );

    const user = result.rows[0];
    const ownerRoleRes = await client.query(
      `SELECT id FROM roles WHERE scope = 'tenant_base' AND slug = 'owner' LIMIT 1`
    );
    const ownerRoleId =
      ownerRoleRes.rows[0]?.id ||
      (
        await client.query(
          `
          INSERT INTO roles (name, slug, description, scope, tenant_id, is_system_role)
          VALUES ($1, $2, $3, 'tenant_base', NULL, TRUE)
          RETURNING id
          `,
          ['소유자', 'owner', 'Tenant base role: owner']
        )
      ).rows[0]?.id;

    if (!ownerRoleId) {
      await client.query('ROLLBACK');
      return res.status(500).json({ message: 'Failed to resolve owner role' });
    }

    const tenantName = user.full_name || user.email;
    const tenantSlug = buildPersonalTenantSlug(tenantName || user.email, user.id);
    const tenantRes = await client.query(
      `
      INSERT INTO tenants (owner_id, name, slug, tenant_type, status, member_limit, current_member_count, metadata)
      VALUES ($1,$2,$3,'personal','active',$4,$5,$6::jsonb)
      RETURNING id
      `,
      [user.id, tenantName, tenantSlug, 1, 1, JSON.stringify({ plan_tier: 'free' })]
    );
    const tenantId = tenantRes.rows[0]?.id;
    if (!tenantId) {
      await client.query('ROLLBACK');
      return res.status(500).json({ message: 'Failed to create personal tenant' });
    }

    await client.query(
      `
      INSERT INTO user_tenant_roles (
        user_id,
        tenant_id,
        role_id,
        membership_status,
        joined_at,
        is_primary_tenant,
        granted_by
      )
      VALUES ($1, $2, $3, 'active', CURRENT_TIMESTAMP, TRUE, $4)
      ON CONFLICT (user_id, tenant_id, role_id)
      DO UPDATE SET
        membership_status = 'active',
        left_at = NULL,
        is_primary_tenant = TRUE
      `,
      [user.id, tenantId, ownerRoleId, user.id]
    );

    await client.query('COMMIT');

    const platformRole = await getPlatformRoleSlug(user.id);
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
      platformRole,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const login = async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body?.email);
  const { password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }
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

export const startGoogleOAuth = async (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || '';
  if (!clientId || !redirectUri) {
    return res.status(500).json({ message: 'Google OAuth not configured' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  oauthStateStore[state] = Date.now() + OAUTH_STATE_TTL_MS;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', process.env.GOOGLE_OAUTH_SCOPE || 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('prompt', 'select_account');

  return res.redirect(authUrl.toString());
};

export const handleGoogleOAuthCallback = async (req: Request, res: Response) => {
  const error = toStr(req.query?.error);
  if (error) {
    return res.redirect(buildFrontendRedirect({ error, provider: 'google' }));
  }

  const code = toStr(req.query?.code);
  const state = toStr(req.query?.state);

  if (!code || !state || !consumeOauthState(state)) {
    return res.redirect(buildFrontendRedirect({ error: 'invalid_state', provider: 'google' }));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || '';
  if (!clientId || !clientSecret || !redirectUri) {
    return res.redirect(buildFrontendRedirect({ error: 'oauth_not_configured', provider: 'google' }));
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = (await tokenRes.json().catch(() => null)) as
      | {
          access_token?: string;
          id_token?: string;
          token_type?: string;
          expires_in?: number;
          refresh_token?: string;
          error?: string;
          error_description?: string;
        }
      | null;

    if (!tokenRes.ok || !tokenData) {
      return res.redirect(buildFrontendRedirect({ error: 'token_exchange_failed', provider: 'google' }));
    }

    let profile: Record<string, any> | null = null;
    if (tokenData.access_token) {
      const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      profile = (await profileRes.json().catch(() => null)) as Record<string, any> | null;
    }
    if ((!profile || !profile.email) && tokenData.id_token) {
      const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenData.id_token)}`);
      profile = (await infoRes.json().catch(() => null)) as Record<string, any> | null;
    }

    const providerUserId = toStr(profile?.sub);
    const email = normalizeEmail(profile?.email);
    const fullName = typeof profile?.name === 'string' ? profile.name : '';
    const emailVerified =
      profile?.email_verified === true || String(profile?.email_verified || '').toLowerCase() === 'true';

    if (!providerUserId || !email) {
      return res.redirect(buildFrontendRedirect({ error: 'profile_missing', provider: 'google' }));
    }
    if (!emailVerified) {
      return res.redirect(buildFrontendRedirect({ error: 'email_not_verified', provider: 'google' }));
    }

    const client = await db.default.connect();
    let userRow: any | null = null;
    let tenantId: string | null = null;
    let isNewUser = false;
    try {
      await client.query('BEGIN');

      const providerRes = await client.query(
        'SELECT user_id FROM user_providers WHERE provider = $1 AND provider_user_id = $2 LIMIT 1',
        ['google', providerUserId]
      );
      const providerUserIdRow = providerRes.rows[0]?.user_id;

      if (providerUserIdRow) {
        const userRes = await client.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [providerUserIdRow]);
        userRow = userRes.rows[0] || null;
      }

      if (!userRow) {
        const userRes = await client.query('SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL', [email]);
        userRow = userRes.rows[0] || null;
      }

      if (!userRow) {
        isNewUser = true;
        const insertRes = await client.query(
          'INSERT INTO users (email, password_hash, full_name, email_verified, status, metadata) VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id, email, full_name',
          [email, null, fullName || email, true, 'active', JSON.stringify({ auth_provider: 'google' })]
        );
        userRow = insertRes.rows[0];

        const ownerRoleRes = await client.query(
          `SELECT id FROM roles WHERE scope = 'tenant_base' AND slug = 'owner' LIMIT 1`
        );
        const ownerRoleId =
          ownerRoleRes.rows[0]?.id ||
          (
            await client.query(
              `
              INSERT INTO roles (name, slug, description, scope, tenant_id, is_system_role)
              VALUES ($1, $2, $3, 'tenant_base', NULL, TRUE)
              RETURNING id
              `,
              ['소유자', 'owner', 'Tenant base role: owner']
            )
          ).rows[0]?.id;

        if (!ownerRoleId) {
          await client.query('ROLLBACK');
          return res.redirect(buildFrontendRedirect({ error: 'owner_role_missing', provider: 'google' }));
        }

        const tenantName = userRow.full_name || userRow.email;
        const tenantSlug = buildPersonalTenantSlug(tenantName || userRow.email, userRow.id);
        const tenantRes = await client.query(
          `
          INSERT INTO tenants (owner_id, name, slug, tenant_type, status, member_limit, current_member_count, metadata)
          VALUES ($1,$2,$3,'personal','active',$4,$5,$6::jsonb)
          RETURNING id
          `,
          [userRow.id, tenantName, tenantSlug, 1, 1, JSON.stringify({ plan_tier: 'free' })]
        );
        tenantId = tenantRes.rows[0]?.id;
        if (!tenantId) {
          await client.query('ROLLBACK');
          return res.redirect(buildFrontendRedirect({ error: 'tenant_create_failed', provider: 'google' }));
        }

        await client.query(
          `
          INSERT INTO user_tenant_roles (
            user_id,
            tenant_id,
            role_id,
            membership_status,
            joined_at,
            is_primary_tenant,
            granted_by
          )
          VALUES ($1, $2, $3, 'active', CURRENT_TIMESTAMP, TRUE, $4)
          ON CONFLICT (user_id, tenant_id, role_id)
          DO UPDATE SET
            membership_status = 'active',
            left_at = NULL,
            is_primary_tenant = TRUE
          `,
          [userRow.id, tenantId, ownerRoleId, userRow.id]
        );
      } else if (!userRow.full_name && fullName) {
        await client.query('UPDATE users SET full_name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
          fullName,
          userRow.id,
        ]);
        userRow.full_name = fullName;
      }

      await client.query(
        `
        INSERT INTO user_providers (user_id, provider, provider_user_id, extra_data)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (provider, provider_user_id)
        DO UPDATE SET user_id = EXCLUDED.user_id, extra_data = EXCLUDED.extra_data
        `,
        [
          userRow.id,
          'google',
          providerUserId,
          JSON.stringify({
            email,
            name: fullName || null,
            picture: profile?.picture || null,
          }),
        ]
      );

      await client.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [userRow.id]);

      await client.query('COMMIT');
    } catch (dbError) {
      await client.query('ROLLBACK');
      console.error('Google OAuth DB error:', dbError);
      return res.redirect(buildFrontendRedirect({ error: 'db_error', provider: 'google' }));
    } finally {
      client.release();
    }

    const [resolvedTenantId, platformRole] = await Promise.all([
      tenantId || getPrimaryTenantId(userRow.id),
      getPlatformRoleSlug(userRow.id),
    ]);

    const token = jwt.sign(
      { userId: userRow.id, email: userRow.email, tenantId: resolvedTenantId || undefined, platformRole },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );

    return res.redirect(
      buildFrontendRedirect({
        token,
        user_id: userRow.id,
        user_email: userRow.email,
        user_name: userRow.full_name || '',
        tenant_id: resolvedTenantId || '',
        platform_role: platformRole || '',
        provider: 'google',
        new_user: isNewUser ? '1' : '0',
      })
    );
  } catch (e) {
    console.error('Google OAuth error:', e);
    return res.redirect(buildFrontendRedirect({ error: 'oauth_failed', provider: 'google' }));
  }
};

export const startNaverOAuth = async (req: Request, res: Response) => {
  const clientId = process.env.NAVER_CLIENT_ID || '';
  const redirectUri = process.env.NAVER_REDIRECT_URI || '';
  if (!clientId || !redirectUri) {
    return res.status(500).json({ message: 'Naver OAuth not configured' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  oauthStateStore[state] = Date.now() + OAUTH_STATE_TTL_MS;

  const authUrl = new URL('https://nid.naver.com/oauth2.0/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);

  return res.redirect(authUrl.toString());
};

export const handleNaverOAuthCallback = async (req: Request, res: Response) => {
  const error = toStr(req.query?.error);
  if (error) {
    return res.redirect(buildFrontendRedirect({ error, provider: 'naver' }));
  }

  const code = toStr(req.query?.code);
  const state = toStr(req.query?.state);

  if (!code || !state || !consumeOauthState(state)) {
    return res.redirect(buildFrontendRedirect({ error: 'invalid_state', provider: 'naver' }));
  }

  const clientId = process.env.NAVER_CLIENT_ID || '';
  const clientSecret = process.env.NAVER_CLIENT_SECRET || '';
  const redirectUri = process.env.NAVER_REDIRECT_URI || '';
  if (!clientId || !clientSecret || !redirectUri) {
    return res.redirect(buildFrontendRedirect({ error: 'oauth_not_configured', provider: 'naver' }));
  }

  try {
    const tokenUrl = new URL('https://nid.naver.com/oauth2.0/token');
    tokenUrl.searchParams.set('grant_type', 'authorization_code');
    tokenUrl.searchParams.set('client_id', clientId);
    tokenUrl.searchParams.set('client_secret', clientSecret);
    tokenUrl.searchParams.set('code', code);
    tokenUrl.searchParams.set('state', state);

    const tokenRes = await fetch(tokenUrl.toString(), { method: 'POST' });
    const tokenData = (await tokenRes.json().catch(() => null)) as
      | {
          access_token?: string;
          token_type?: string;
          refresh_token?: string;
          expires_in?: string;
          error?: string;
          error_description?: string;
        }
      | null;

    if (!tokenRes.ok || !tokenData?.access_token) {
      return res.redirect(buildFrontendRedirect({ error: 'token_exchange_failed', provider: 'naver' }));
    }

    const profileRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profileData = (await profileRes.json().catch(() => null)) as
      | { resultcode?: string; message?: string; response?: Record<string, any> }
      | null;

    const profile = profileData?.response || {};
    const providerUserId = toStr(profile?.id);
    const email = normalizeEmail(profile?.email);
    const fullName = typeof profile?.name === 'string' ? profile.name : profile?.nickname || '';

    if (!providerUserId) {
      return res.redirect(buildFrontendRedirect({ error: 'profile_missing', provider: 'naver' }));
    }

    const providerRes = await db.query(
      'SELECT user_id FROM user_providers WHERE provider = $1 AND provider_user_id = $2 LIMIT 1',
      ['naver', providerUserId]
    );
    const providerUserIdRow = providerRes.rows[0]?.user_id;

    if (providerUserIdRow) {
      const userRes = await db.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [providerUserIdRow]);
      const userRow = userRes.rows[0] || null;
      if (userRow?.email_verified) {
        const redirectUrl = await buildJwtRedirect(userRow, 'naver', null, false);
        return res.redirect(redirectUrl);
      }
    }

    const pending = await upsertSsoPending(
      'naver',
      providerUserId,
      email || null,
      {
        name: fullName || null,
        email: email || null,
        profile_image: profile?.profile_image || null,
        nickname: profile?.nickname || null,
      }
    );

    return res.redirect(
      buildFrontendUrl('/sso-email', {
        provider: 'naver',
        sso_token: pending.token,
        email_hint: pending.email || '',
      })
    );
  } catch (e) {
    console.error('Naver OAuth error:', e);
    return res.redirect(buildFrontendRedirect({ error: 'oauth_failed', provider: 'naver' }));
  }
};

export const startKakaoOAuth = async (req: Request, res: Response) => {
  const clientId = process.env.KAKAO_REST_API_KEY || process.env.KAKAO_CLIENT_ID || '';
  const redirectUri = process.env.KAKAO_REDIRECT_URI || '';
  if (!clientId || !redirectUri) {
    return res.status(500).json({ message: 'Kakao OAuth not configured' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  oauthStateStore[state] = Date.now() + OAUTH_STATE_TTL_MS;

  const authUrl = new URL('https://kauth.kakao.com/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);

  return res.redirect(authUrl.toString());
};

export const handleKakaoOAuthCallback = async (req: Request, res: Response) => {
  const error = toStr(req.query?.error);
  if (error) {
    return res.redirect(buildFrontendRedirect({ error, provider: 'kakao' }));
  }

  const code = toStr(req.query?.code);
  const state = toStr(req.query?.state);

  if (!code || !state || !consumeOauthState(state)) {
    return res.redirect(buildFrontendRedirect({ error: 'invalid_state', provider: 'kakao' }));
  }

  const clientId = process.env.KAKAO_REST_API_KEY || process.env.KAKAO_CLIENT_ID || '';
  const clientSecret = process.env.KAKAO_CLIENT_SECRET || '';
  const redirectUri = process.env.KAKAO_REDIRECT_URI || '';
  if (!clientId || !redirectUri) {
    return res.redirect(buildFrontendRedirect({ error: 'oauth_not_configured', provider: 'kakao' }));
  }

  try {
    const body = new URLSearchParams();
    body.set('grant_type', 'authorization_code');
    body.set('client_id', clientId);
    if (clientSecret) body.set('client_secret', clientSecret);
    body.set('redirect_uri', redirectUri);
    body.set('code', code);
    body.set('state', state);

    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const tokenData = (await tokenRes.json().catch(() => null)) as
      | {
          access_token?: string;
          token_type?: string;
          refresh_token?: string;
          expires_in?: number;
          scope?: string;
          error?: string;
          error_description?: string;
        }
      | null;

    if (!tokenRes.ok || !tokenData?.access_token) {
      return res.redirect(buildFrontendRedirect({ error: 'token_exchange_failed', provider: 'kakao' }));
    }

    const profileRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profileData = (await profileRes.json().catch(() => null)) as Record<string, any> | null;
    const providerUserId = profileData?.id !== undefined && profileData?.id !== null ? String(profileData.id) : '';
    const account = profileData?.kakao_account || {};
    const email = normalizeEmail(account?.email);
    const fullName =
      typeof account?.profile?.nickname === 'string' ? account.profile.nickname : toStr(account?.profile?.nickname);
    const profileImage = account?.profile?.profile_image_url || null;

    if (!providerUserId) {
      return res.redirect(buildFrontendRedirect({ error: 'profile_missing', provider: 'kakao' }));
    }

    const providerRes = await db.query(
      'SELECT user_id FROM user_providers WHERE provider = $1 AND provider_user_id = $2 LIMIT 1',
      ['kakao', providerUserId]
    );
    const providerUserIdRow = providerRes.rows[0]?.user_id;

    if (providerUserIdRow) {
      const userRes = await db.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [providerUserIdRow]);
      const userRow = userRes.rows[0] || null;
      if (userRow?.email_verified) {
        const redirectUrl = await buildJwtRedirect(userRow, 'kakao', null, false);
        return res.redirect(redirectUrl);
      }
    }

    const pending = await upsertSsoPending(
      'kakao',
      providerUserId,
      email || null,
      {
        name: fullName || null,
        email: email || null,
        profile_image: profileImage,
      }
    );

    return res.redirect(
      buildFrontendUrl('/sso-email', {
        provider: 'kakao',
        sso_token: pending.token,
        email_hint: pending.email || '',
      })
    );
  } catch (e) {
    console.error('Kakao OAuth error:', e);
    return res.redirect(buildFrontendRedirect({ error: 'oauth_failed', provider: 'kakao' }));
  }
};

