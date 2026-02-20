import { Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../config/db';
import type { AuthedRequest } from '../middleware/requireAuth';

type InvitationStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'cancelled';
type InvitationRole = 'owner' | 'admin' | 'member' | 'viewer';

const STATUSES = new Set<InvitationStatus>(['pending', 'accepted', 'rejected', 'expired', 'cancelled']);
const ROLES = new Set<InvitationRole>(['owner', 'admin', 'member', 'viewer']);

const toInt = (value: unknown, fallback: number) => {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
};

const toStr = (value: unknown) => {
  const s = typeof value === 'string' ? value : '';
  return s.trim();
};

export const listTenantInvitations = async (req: Request, res: Response) => {
  try {
    const q = toStr(req.query.q);
    const status = toStr(req.query.status) as InvitationStatus | '';
    const tenantId = toStr(req.query.tenant_id);
    const inviterId = toStr(req.query.inviter_id);
    const inviteeEmail = toStr(req.query.invitee_email);
    const inviteeUserId = toStr(req.query.invitee_user_id);

    const limit = Math.min(toInt(req.query.limit, 50), 200);
    const offset = toInt(req.query.offset, 0);

    const where: string[] = ['t.deleted_at IS NULL', 'iu.deleted_at IS NULL'];
    const params: any[] = [];

    if (status) {
      if (!STATUSES.has(status)) return res.status(400).json({ message: 'invalid status' });
      where.push(`ti.status = $${params.length + 1}`);
      params.push(status);
    }
    if (tenantId) {
      where.push(`ti.tenant_id = $${params.length + 1}`);
      params.push(tenantId);
    }
    if (inviterId) {
      where.push(`ti.inviter_id = $${params.length + 1}`);
      params.push(inviterId);
    }
    if (inviteeEmail) {
      where.push(`ti.invitee_email ILIKE $${params.length + 1}`);
      params.push(`%${inviteeEmail}%`);
    }
    if (inviteeUserId) {
      where.push(`ti.invitee_user_id = $${params.length + 1}`);
      params.push(inviteeUserId);
    }
    if (q) {
      where.push(
        `(
          ti.invitee_email ILIKE $${params.length + 1}
          OR iu.email ILIKE $${params.length + 1}
          OR iu.full_name ILIKE $${params.length + 1}
          OR t.name ILIKE $${params.length + 1}
          OR t.slug ILIKE $${params.length + 1}
        )`
      );
      params.push(`%${q}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRes = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM tenant_invitations ti
      JOIN tenants t ON t.id = ti.tenant_id
      JOIN users iu ON iu.id = ti.inviter_id
      LEFT JOIN users eu ON eu.id = ti.invitee_user_id
      ${whereSql}
      `,
      params
    );

    const listRes = await pool.query(
      `
      SELECT
        ti.id,
        ti.tenant_id,
        ti.inviter_id,
        ti.invitee_email,
        ti.invitee_user_id,
        ti.invitation_token,
        ti.membership_role,
        ti.status,
        ti.expires_at,
        ti.accepted_at,
        ti.rejected_at,
        ti.cancelled_at,
        ti.metadata,
        ti.created_at,
        ti.updated_at,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        t.tenant_type AS tenant_type,
        iu.email AS inviter_email,
        iu.full_name AS inviter_name,
        eu.full_name AS invitee_name
      FROM tenant_invitations ti
      JOIN tenants t ON t.id = ti.tenant_id
      JOIN users iu ON iu.id = ti.inviter_id
      LEFT JOIN users eu ON eu.id = ti.invitee_user_id
      ${whereSql}
      ORDER BY ti.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    );

    res.json({
      ok: true,
      total: countRes.rows[0]?.total ?? 0,
      limit,
      offset,
      rows: listRes.rows,
    });
  } catch (error) {
    console.error('Error fetching tenant invitations:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const createTenantInvitation = async (req: Request, res: Response) => {
  try {
    const tenantId = toStr(req.body?.tenant_id);
    const inviteeEmail = toStr(req.body?.invitee_email);
    const inviteeUserId = toStr(req.body?.invitee_user_id) || null;
    const membershipRole = (toStr(req.body?.membership_role) as InvitationRole) || 'member';
    const expiresAt = req.body?.expires_at || null;
    const metadataInput = req.body?.metadata;
    const metadata =
      metadataInput && typeof metadataInput === 'object' ? metadataInput : metadataInput ? null : {};
    const inviterId = (req as AuthedRequest).userId;

    if (!tenantId) return res.status(400).json({ message: 'tenant_id is required' });
    if (!inviteeEmail) return res.status(400).json({ message: 'invitee_email is required' });
    if (!ROLES.has(membershipRole)) return res.status(400).json({ message: 'invalid membership_role' });
    if (!inviterId) return res.status(400).json({ message: 'inviter_id is required' });
    if (!expiresAt) return res.status(400).json({ message: 'expires_at is required' });
    if (metadata === null) return res.status(400).json({ message: 'metadata must be object' });

    const invitationToken = crypto.randomUUID();

    const result = await pool.query(
      `
      INSERT INTO tenant_invitations (
        tenant_id, inviter_id, invitee_email, invitee_user_id, invitation_token,
        membership_role, status, expires_at, metadata
      )
      VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8::jsonb)
      RETURNING id, tenant_id, inviter_id, invitee_email, invitee_user_id, invitation_token,
        membership_role, status, expires_at, accepted_at, rejected_at, cancelled_at, metadata, created_at, updated_at
      `,
      [
        tenantId,
        inviterId,
        inviteeEmail,
        inviteeUserId,
        invitationToken,
        membershipRole,
        expiresAt,
        JSON.stringify(metadata || {}),
      ]
    );

    res.status(201).json({ ok: true, row: result.rows[0] });
  } catch (error: any) {
    console.error('Error creating tenant invitation:', error);
    if (error?.code === '23505') {
      return res.status(409).json({ message: 'Invitation already exists', details: error.detail });
    }
    res.status(500).json({ message: 'Internal server error', details: error.message });
  }
};

export const updateTenantInvitation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const input = req.body || {};

    const fields: string[] = [];
    const params: any[] = [];

    const setField = (name: string, value: any) => {
      fields.push(`${name} = $${params.length + 1}`);
      params.push(value);
    };

    if (input.membership_role !== undefined) {
      const role = toStr(input.membership_role) as InvitationRole;
      if (!ROLES.has(role)) return res.status(400).json({ message: 'invalid membership_role' });
      setField('membership_role', role);
    }
    if (input.status !== undefined) {
      const status = toStr(input.status) as InvitationStatus;
      if (!STATUSES.has(status)) return res.status(400).json({ message: 'invalid status' });
      setField('status', status);
      if (status === 'accepted') fields.push(`accepted_at = CURRENT_TIMESTAMP`);
      if (status === 'rejected') fields.push(`rejected_at = CURRENT_TIMESTAMP`);
      if (status === 'cancelled') fields.push(`cancelled_at = CURRENT_TIMESTAMP`);
    }
    if (input.expires_at !== undefined) {
      setField('expires_at', input.expires_at || null);
    }
    if (input.metadata !== undefined) {
      const metadataInput = input.metadata;
      const metadata =
        metadataInput && typeof metadataInput === 'object' ? metadataInput : metadataInput ? null : {};
      if (metadata === null) return res.status(400).json({ message: 'metadata must be object' });
      setField('metadata', JSON.stringify(metadata || {}));
    }

    if (fields.length === 0) return res.status(400).json({ message: 'No fields to update' });

    const result = await pool.query(
      `
      UPDATE tenant_invitations
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length + 1}
      RETURNING id, tenant_id, inviter_id, invitee_email, invitee_user_id, invitation_token,
        membership_role, status, expires_at, accepted_at, rejected_at, cancelled_at, metadata, created_at, updated_at
      `,
      [...params, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    res.json({ ok: true, row: result.rows[0] });
  } catch (error: any) {
    console.error('Error updating tenant invitation:', error);
    res.status(500).json({ message: 'Internal server error', details: error.message });
  }
};
