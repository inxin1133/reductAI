-- ============================================
-- Tenant Membership, Invitations, and Billing System
-- Multi-Tenant Group Management with Subscription
-- PostgreSQL Database Schema
-- ============================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. TENANT TYPE AND PLAN MANAGEMENT
-- ============================================

CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    plan_type VARCHAR(50) NOT NULL CHECK (plan_type IN ('personal', 'team', 'enterprise')),
    description TEXT,
    max_members INTEGER, -- NULL이면 무제한
    max_seats INTEGER, -- NULL이면 무제한
    price_monthly DECIMAL(10, 2),
    price_yearly DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'USD',
    features JSONB DEFAULT '{}', -- 플랜별 기능 목록
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subscription_plans_slug ON subscription_plans(slug);
CREATE INDEX idx_subscription_plans_plan_type ON subscription_plans(plan_type);
CREATE INDEX idx_subscription_plans_is_active ON subscription_plans(is_active);

COMMENT ON TABLE subscription_plans IS '구독 플랜 정보를 관리하는 테이블';
COMMENT ON COLUMN subscription_plans.id IS '플랜의 고유 식별자 (UUID)';
COMMENT ON COLUMN subscription_plans.name IS '플랜 이름 (예: 개인 플랜, 팀 플랜)';
COMMENT ON COLUMN subscription_plans.slug IS '플랜의 고유 식별 문자열';
COMMENT ON COLUMN subscription_plans.plan_type IS '플랜 타입: personal(개인), team(팀), enterprise(엔터프라이즈)';
COMMENT ON COLUMN subscription_plans.description IS '플랜 설명';
COMMENT ON COLUMN subscription_plans.max_members IS '최대 멤버 수 (NULL이면 무제한)';
COMMENT ON COLUMN subscription_plans.max_seats IS '최대 좌석 수 (NULL이면 무제한)';
COMMENT ON COLUMN subscription_plans.price_monthly IS '월간 가격';
COMMENT ON COLUMN subscription_plans.price_yearly IS '연간 가격';
COMMENT ON COLUMN subscription_plans.currency IS '통화 코드 (예: USD, KRW)';
COMMENT ON COLUMN subscription_plans.features IS '플랜별 기능 목록 (JSON 형식)';
COMMENT ON COLUMN subscription_plans.is_active IS '플랜 활성화 여부';
COMMENT ON COLUMN subscription_plans.display_order IS '플랜 표시 순서';
COMMENT ON COLUMN subscription_plans.created_at IS '플랜 생성 시각';
COMMENT ON COLUMN subscription_plans.updated_at IS '플랜 정보 최종 수정 시각';

-- ============================================
-- 2. TENANT OWNERSHIP AND TYPE UPDATE
-- ============================================

-- tenants 테이블에 필요한 컬럼 추가 (ALTER TABLE)
-- Note: 실제 배포 시에는 tenants 테이블이 이미 존재하므로 ALTER TABLE을 사용해야 합니다.

-- ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE RESTRICT;
-- ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tenant_type VARCHAR(50) DEFAULT 'personal' CHECK (tenant_type IN ('personal', 'team', 'enterprise'));
-- ALTER TABLE tenants ADD COLUMN IF NOT EXISTS member_limit INTEGER;
-- ALTER TABLE tenants ADD COLUMN IF NOT EXISTS current_member_count INTEGER DEFAULT 0;

-- 위 ALTER TABLE은 주석 처리하고, 대신 스키마 문서로 제공
-- 실제 사용 시 schema.sql의 tenants 테이블을 수정하거나 ALTER TABLE을 실행해야 합니다.

-- ============================================
-- 3. TENANT MEMBERSHIPS (사용자-테넌트 멤버십)
-- ============================================

CREATE TABLE tenant_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    membership_role VARCHAR(50) NOT NULL DEFAULT 'member' CHECK (membership_role IN ('owner', 'admin', 'member', 'viewer')),
    membership_status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (membership_status IN ('active', 'inactive', 'suspended', 'pending')),
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL, -- 초대한 사용자
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP WITH TIME ZONE, -- 탈퇴 시각
    is_primary_tenant BOOLEAN DEFAULT FALSE, -- 사용자의 기본 테넌트 여부
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_tenant_memberships_tenant_id ON tenant_memberships(tenant_id);
CREATE INDEX idx_tenant_memberships_user_id ON tenant_memberships(user_id);
CREATE INDEX idx_tenant_memberships_membership_role ON tenant_memberships(tenant_id, membership_role);
CREATE INDEX idx_tenant_memberships_membership_status ON tenant_memberships(membership_status);
CREATE INDEX idx_tenant_memberships_is_primary ON tenant_memberships(user_id, is_primary_tenant) WHERE is_primary_tenant = TRUE;

COMMENT ON TABLE tenant_memberships IS '사용자와 테넌트 간의 멤버십 관계를 관리하는 테이블. 한 사용자는 여러 테넌트에 속할 수 있습니다.';
COMMENT ON COLUMN tenant_memberships.id IS '멤버십 레코드의 고유 식별자 (UUID)';
COMMENT ON COLUMN tenant_memberships.tenant_id IS '멤버십이 속한 테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN tenant_memberships.user_id IS '멤버십을 가진 사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN tenant_memberships.membership_role IS '멤버십 역할: owner(소유자), admin(관리자), member(멤버), viewer(뷰어)';
COMMENT ON COLUMN tenant_memberships.membership_status IS '멤버십 상태: active(활성), inactive(비활성), suspended(정지), pending(초대 대기)';
COMMENT ON COLUMN tenant_memberships.invited_by IS '초대한 사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN tenant_memberships.joined_at IS '테넌트 가입 시각';
COMMENT ON COLUMN tenant_memberships.left_at IS '테넌트 탈퇴 시각 (NULL이면 현재 멤버)';
COMMENT ON COLUMN tenant_memberships.is_primary_tenant IS '사용자의 기본 테넌트 여부 (한 사용자는 하나의 기본 테넌트만 가질 수 있음)';
COMMENT ON COLUMN tenant_memberships.metadata IS '멤버십의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN tenant_memberships.created_at IS '멤버십 생성 시각';
COMMENT ON COLUMN tenant_memberships.updated_at IS '멤버십 정보 최종 수정 시각';

-- ============================================
-- 4. TENANT INVITATIONS (초대 관리)
-- ============================================

CREATE TABLE tenant_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, -- 초대한 사용자
    invitee_email VARCHAR(255) NOT NULL, -- 초대받은 사용자의 이메일
    invitee_user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- 이미 가입한 사용자인 경우
    invitation_token VARCHAR(255) NOT NULL UNIQUE, -- 초대 토큰
    membership_role VARCHAR(50) NOT NULL DEFAULT 'member' CHECK (membership_role IN ('owner', 'admin', 'member', 'viewer')),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'cancelled')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tenant_invitations_tenant_id ON tenant_invitations(tenant_id);
CREATE INDEX idx_tenant_invitations_inviter_id ON tenant_invitations(inviter_id);
CREATE INDEX idx_tenant_invitations_invitee_email ON tenant_invitations(invitee_email);
CREATE INDEX idx_tenant_invitations_invitee_user_id ON tenant_invitations(invitee_user_id);
CREATE INDEX idx_tenant_invitations_token ON tenant_invitations(invitation_token);
CREATE INDEX idx_tenant_invitations_status ON tenant_invitations(status);
CREATE INDEX idx_tenant_invitations_expires_at ON tenant_invitations(expires_at);

COMMENT ON TABLE tenant_invitations IS '테넌트 초대 정보를 관리하는 테이블';
COMMENT ON COLUMN tenant_invitations.id IS '초대 레코드의 고유 식별자 (UUID)';
COMMENT ON COLUMN tenant_invitations.tenant_id IS '초대한 테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN tenant_invitations.inviter_id IS '초대한 사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN tenant_invitations.invitee_email IS '초대받은 사용자의 이메일 주소';
COMMENT ON COLUMN tenant_invitations.invitee_user_id IS '이미 가입한 사용자인 경우 사용자 ID (users 테이블 참조, NULL이면 신규 사용자)';
COMMENT ON COLUMN tenant_invitations.invitation_token IS '초대 토큰 (고유값)';
COMMENT ON COLUMN tenant_invitations.membership_role IS '초대 시 부여할 멤버십 역할';
COMMENT ON COLUMN tenant_invitations.status IS '초대 상태: pending(대기), accepted(수락), rejected(거부), expired(만료), cancelled(취소)';
COMMENT ON COLUMN tenant_invitations.expires_at IS '초대 만료 시각';
COMMENT ON COLUMN tenant_invitations.accepted_at IS '초대 수락 시각';
COMMENT ON COLUMN tenant_invitations.rejected_at IS '초대 거부 시각';
COMMENT ON COLUMN tenant_invitations.cancelled_at IS '초대 취소 시각';
COMMENT ON COLUMN tenant_invitations.metadata IS '초대의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN tenant_invitations.created_at IS '초대 생성 시각';
COMMENT ON COLUMN tenant_invitations.updated_at IS '초대 정보 최종 수정 시각';

-- ============================================
-- 5. TENANT SUBSCRIPTIONS (구독 관리)
-- ============================================

CREATE TABLE tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    billing_cycle VARCHAR(50) NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'suspended', 'past_due', 'trialing')),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    trial_end TIMESTAMP WITH TIME ZONE,
    auto_renew BOOLEAN DEFAULT TRUE,
    price DECIMAL(10, 2) NOT NULL, -- 구독 시작 시점의 가격 (할인 전)
    currency VARCHAR(3) DEFAULT 'USD',
    discount_percent DECIMAL(5, 2) DEFAULT 0, -- 할인율
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tenant_subscriptions_tenant_id ON tenant_subscriptions(tenant_id);
CREATE INDEX idx_tenant_subscriptions_plan_id ON tenant_subscriptions(plan_id);
CREATE INDEX idx_tenant_subscriptions_status ON tenant_subscriptions(status);
CREATE INDEX idx_tenant_subscriptions_current_period_end ON tenant_subscriptions(current_period_end);

COMMENT ON TABLE tenant_subscriptions IS '테넌트의 구독 정보를 관리하는 테이블';
COMMENT ON COLUMN tenant_subscriptions.id IS '구독의 고유 식별자 (UUID)';
COMMENT ON COLUMN tenant_subscriptions.tenant_id IS '구독하는 테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN tenant_subscriptions.plan_id IS '구독 플랜 ID (subscription_plans 테이블 참조)';
COMMENT ON COLUMN tenant_subscriptions.billing_cycle IS '과금 주기: monthly(월간), yearly(연간)';
COMMENT ON COLUMN tenant_subscriptions.status IS '구독 상태: active(활성), cancelled(취소), expired(만료), suspended(정지), past_due(연체), trialing(체험)';
COMMENT ON COLUMN tenant_subscriptions.started_at IS '구독 시작 시각';
COMMENT ON COLUMN tenant_subscriptions.current_period_start IS '현재 과금 기간 시작 시각';
COMMENT ON COLUMN tenant_subscriptions.current_period_end IS '현재 과금 기간 종료 시각';
COMMENT ON COLUMN tenant_subscriptions.cancelled_at IS '구독 취소 시각';
COMMENT ON COLUMN tenant_subscriptions.ended_at IS '구독 종료 시각';
COMMENT ON COLUMN tenant_subscriptions.trial_end IS '체험 기간 종료 시각';
COMMENT ON COLUMN tenant_subscriptions.auto_renew IS '자동 갱신 여부';
COMMENT ON COLUMN tenant_subscriptions.price IS '구독 가격 (할인 전)';
COMMENT ON COLUMN tenant_subscriptions.currency IS '통화 코드';
COMMENT ON COLUMN tenant_subscriptions.discount_percent IS '할인율 (0-100)';
COMMENT ON COLUMN tenant_subscriptions.metadata IS '구독의 추가 메타데이터 (JSON 형식, 예: 결제 정보)';
COMMENT ON COLUMN tenant_subscriptions.created_at IS '구독 생성 시각';
COMMENT ON COLUMN tenant_subscriptions.updated_at IS '구독 정보 최종 수정 시각';

-- ============================================
-- 6. BILLING ACCOUNTS (과금 계정)
-- ============================================

CREATE TABLE billing_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    payment_method_type VARCHAR(50) CHECK (payment_method_type IN ('credit_card', 'bank_transfer', 'paypal', 'other')),
    payment_method_last4 VARCHAR(4), -- 카드 마지막 4자리 (Legacy: Payment Methods 테이블 권장)
    payment_method_brand VARCHAR(50), -- 카드 브랜드 (Legacy)
    billing_email VARCHAR(255),
    billing_name VARCHAR(255),
    billing_address JSONB, -- 주소 정보 (JSON 형식)
    tax_id VARCHAR(100), -- 세금 고유번호
    currency VARCHAR(3) DEFAULT 'USD',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id)
);

CREATE INDEX idx_billing_accounts_tenant_id ON billing_accounts(tenant_id);
CREATE INDEX idx_billing_accounts_billing_email ON billing_accounts(billing_email);

COMMENT ON TABLE billing_accounts IS '테넌트의 과금 계정 정보를 관리하는 테이블';
COMMENT ON COLUMN billing_accounts.id IS '과금 계정의 고유 식별자 (UUID)';
COMMENT ON COLUMN billing_accounts.tenant_id IS '과금 계정이 속한 테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN billing_accounts.payment_method_type IS '결제 수단 타입: credit_card(신용카드), bank_transfer(계좌이체), paypal, other';
COMMENT ON COLUMN billing_accounts.payment_method_last4 IS '결제 수단 마지막 4자리 (보안상 일부만 저장)';
COMMENT ON COLUMN billing_accounts.payment_method_brand IS '결제 수단 브랜드 (예: visa, mastercard)';
COMMENT ON COLUMN billing_accounts.billing_email IS '과금 이메일 주소';
COMMENT ON COLUMN billing_accounts.billing_name IS '과금 담당자 이름';
COMMENT ON COLUMN billing_accounts.billing_address IS '과금 주소 정보 (JSON 형식)';
COMMENT ON COLUMN billing_accounts.tax_id IS '세금 고유번호';
COMMENT ON COLUMN billing_accounts.currency IS '기본 통화 코드';
COMMENT ON COLUMN billing_accounts.metadata IS '과금 계정의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN billing_accounts.created_at IS '과금 계정 생성 시각';
COMMENT ON COLUMN billing_accounts.updated_at IS '과금 계정 정보 최종 수정 시각';

-- ============================================
-- 7. PAYMENT METHODS (결제 수단 관리)
-- ============================================

CREATE TABLE payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    billing_account_id UUID NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL DEFAULT 'card' CHECK (type IN ('card', 'bank_account')),
    provider VARCHAR(50) NOT NULL DEFAULT 'stripe', -- e.g., stripe, paypal
    provider_payment_method_id VARCHAR(255) NOT NULL, -- PG사(Gateway)에서 발급한 Payment Method ID
    card_brand VARCHAR(50), -- Visa, Mastercard, Amex 등
    card_last4 VARCHAR(4), -- 카드번호 마지막 4자리
    card_exp_month INTEGER,
    card_exp_year INTEGER,
    is_default BOOLEAN DEFAULT FALSE, -- 기본 결제 수단 여부
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'deleted')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payment_methods_billing_account_id ON payment_methods(billing_account_id);
CREATE INDEX idx_payment_methods_provider_id ON payment_methods(provider_payment_method_id);
CREATE INDEX idx_payment_methods_is_default ON payment_methods(billing_account_id, is_default) WHERE is_default = TRUE;

COMMENT ON TABLE payment_methods IS '등록된 카드 등 결제 수단을 상세 관리하는 테이블';
COMMENT ON COLUMN payment_methods.id IS '결제 수단의 고유 식별자';
COMMENT ON COLUMN payment_methods.provider_payment_method_id IS 'PG사(Gateway)의 결제 수단 ID (토큰)';
COMMENT ON COLUMN payment_methods.card_last4 IS '카드번호 마지막 4자리 (보안 저장)';
COMMENT ON COLUMN payment_methods.is_default IS '기본 결제 수단 여부 (계정당 하나만 TRUE)';
COMMENT ON COLUMN payment_methods.status IS '결제 수단 상태: active(활성), expired(만료), deleted(삭제)';
COMMENT ON COLUMN payment_methods.metadata IS '결제 수단의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN payment_methods.created_at IS '결제 수단 생성 시각';
COMMENT ON COLUMN payment_methods.updated_at IS '결제 수단 정보 최종 수정 시각';    


-- ============================================
-- 8. BILLING INVOICES (청구서)
-- ============================================

CREATE TABLE billing_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID NOT NULL REFERENCES tenant_subscriptions(id) ON DELETE RESTRICT,
    billing_account_id UUID NOT NULL REFERENCES billing_accounts(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
    subtotal DECIMAL(10, 2) NOT NULL,
    tax DECIMAL(10, 2) DEFAULT 0,
    discount DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    due_date TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    invoice_url VARCHAR(500), -- 청구서 PDF URL
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_billing_invoices_subscription_id ON billing_invoices(subscription_id);
CREATE INDEX idx_billing_invoices_billing_account_id ON billing_invoices(billing_account_id);
CREATE INDEX idx_billing_invoices_invoice_number ON billing_invoices(invoice_number);
CREATE INDEX idx_billing_invoices_status ON billing_invoices(status);
CREATE INDEX idx_billing_invoices_due_date ON billing_invoices(due_date);

COMMENT ON TABLE billing_invoices IS '청구서 정보를 관리하는 테이블';
COMMENT ON COLUMN billing_invoices.id IS '청구서의 고유 식별자 (UUID)';
COMMENT ON COLUMN billing_invoices.subscription_id IS '청구서가 속한 구독 ID (tenant_subscriptions 테이블 참조)';
COMMENT ON COLUMN billing_invoices.billing_account_id IS '청구서가 속한 과금 계정 ID (billing_accounts 테이블 참조)';
COMMENT ON COLUMN billing_invoices.invoice_number IS '청구서 번호 (고유값)';
COMMENT ON COLUMN billing_invoices.status IS '청구서 상태: draft(초안), open(미결제), paid(결제완료), void(무효), uncollectible(미수금)';
COMMENT ON COLUMN billing_invoices.subtotal IS '소계 (세금 제외)';
COMMENT ON COLUMN billing_invoices.tax IS '세금';
COMMENT ON COLUMN billing_invoices.discount IS '할인 금액';
COMMENT ON COLUMN billing_invoices.total IS '총액';
COMMENT ON COLUMN billing_invoices.currency IS '통화 코드';
COMMENT ON COLUMN billing_invoices.period_start IS '청구 기간 시작 시각';
COMMENT ON COLUMN billing_invoices.period_end IS '청구 기간 종료 시각';
COMMENT ON COLUMN billing_invoices.due_date IS '결제 기한';
COMMENT ON COLUMN billing_invoices.paid_at IS '결제 완료 시각';
COMMENT ON COLUMN billing_invoices.invoice_url IS '청구서 PDF URL';
COMMENT ON COLUMN billing_invoices.metadata IS '청구서의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN billing_invoices.created_at IS '청구서 생성 시각';
COMMENT ON COLUMN billing_invoices.updated_at IS '청구서 정보 최종 수정 시각';

-- ============================================
-- 9. PAYMENT TRANSACTIONS (결제 거래)
-- ============================================

CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES billing_invoices(id) ON DELETE RESTRICT,
    billing_account_id UUID NOT NULL REFERENCES billing_accounts(id) ON DELETE RESTRICT,
    payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL, -- 사용된 결제 수단
    related_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE SET NULL, -- 환불 시 원본 거래 ID
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('charge', 'refund', 'adjustment', 'cancel')),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'cancelled')),
    payment_method_provider_id VARCHAR(255), -- PG사의 결제 수단 ID (payment_methods 테이블 삭제 대비 백업)
    transaction_id VARCHAR(255), -- 외부 결제 시스템의 거래 ID (예: Stripe Charge ID)
    failure_reason TEXT, -- 실패 사유
    refund_reason TEXT, -- 환불/취소 사유
    gateway_response JSONB DEFAULT '{}', -- PG사 응답 전문 (JSON)
    processed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payment_transactions_invoice_id ON payment_transactions(invoice_id);
CREATE INDEX idx_payment_transactions_billing_account_id ON payment_transactions(billing_account_id);
CREATE INDEX idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX idx_payment_transactions_transaction_id ON payment_transactions(transaction_id);
CREATE INDEX idx_payment_transactions_related_id ON payment_transactions(related_transaction_id);

COMMENT ON TABLE payment_transactions IS '결제 거래 정보를 관리하는 테이블';
COMMENT ON COLUMN payment_transactions.id IS '거래의 고유 식별자 (UUID)';
COMMENT ON COLUMN payment_transactions.invoice_id IS '거래가 속한 청구서 ID (billing_invoices 테이블 참조)';
COMMENT ON COLUMN payment_transactions.billing_account_id IS '거래가 속한 과금 계정 ID (billing_accounts 테이블 참조)';
COMMENT ON COLUMN payment_transactions.payment_method_id IS '사용된 결제 수단 ID (payment_methods 테이블 참조)';
COMMENT ON COLUMN payment_transactions.related_transaction_id IS '환불/취소 시 원본 거래 ID (자기 참조)';
COMMENT ON COLUMN payment_transactions.transaction_type IS '거래 타입: charge(결제), refund(환불), adjustment(조정), cancel(취소)';
COMMENT ON COLUMN payment_transactions.amount IS '거래 금액';
COMMENT ON COLUMN payment_transactions.currency IS '통화 코드';
COMMENT ON COLUMN payment_transactions.status IS '거래 상태: pending(대기), succeeded(성공), failed(실패), refunded(환불됨), cancelled(취소)';
COMMENT ON COLUMN payment_transactions.payment_method_provider_id IS 'PG사의 결제 수단 ID (payment_methods 테이블 삭제 대비 백업)';
COMMENT ON COLUMN payment_transactions.transaction_id IS '외부 결제 시스템의 거래 ID';
COMMENT ON COLUMN payment_transactions.failure_reason IS '실패 사유';
COMMENT ON COLUMN payment_transactions.refund_reason IS '환불/취소 사유';
COMMENT ON COLUMN payment_transactions.gateway_response IS 'PG사 응답 데이터 (디버깅용)';
COMMENT ON COLUMN payment_transactions.processed_at IS '거래 처리 완료 시각';
COMMENT ON COLUMN payment_transactions.metadata IS '거래의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN payment_transactions.created_at IS '거래 생성 시각';
COMMENT ON COLUMN payment_transactions.updated_at IS '거래 정보 최종 수정 시각';

-- ============================================
-- 10. USAGE TRACKING (사용량 추적)
-- ============================================

CREATE TABLE usage_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES tenant_subscriptions(id) ON DELETE SET NULL,
    metric_name VARCHAR(100) NOT NULL, -- 사용량 메트릭 이름 (예: api_calls, storage_gb, seats_used)
    metric_value DECIMAL(15, 4) NOT NULL, -- 사용량 값
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_usage_tracking_tenant_id ON usage_tracking(tenant_id);
CREATE INDEX idx_usage_tracking_subscription_id ON usage_tracking(subscription_id);
CREATE INDEX idx_usage_tracking_metric_name ON usage_tracking(tenant_id, metric_name);
CREATE INDEX idx_usage_tracking_period ON usage_tracking(tenant_id, period_start, period_end);

COMMENT ON TABLE usage_tracking IS '서비스 사용량을 추적하는 테이블';
COMMENT ON COLUMN usage_tracking.id IS '사용량 레코드의 고유 식별자 (UUID)';
COMMENT ON COLUMN usage_tracking.tenant_id IS '사용량이 속한 테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN usage_tracking.subscription_id IS '사용량이 속한 구독 ID (tenant_subscriptions 테이블 참조)';
COMMENT ON COLUMN usage_tracking.metric_name IS '사용량 메트릭 이름 (예: api_calls, storage_gb, seats_used, members_count)';
COMMENT ON COLUMN usage_tracking.metric_value IS '사용량 값';
COMMENT ON COLUMN usage_tracking.period_start IS '사용량 측정 기간 시작 시각';
COMMENT ON COLUMN usage_tracking.period_end IS '사용량 측정 기간 종료 시각';
COMMENT ON COLUMN usage_tracking.recorded_at IS '사용량 기록 시각';
COMMENT ON COLUMN usage_tracking.metadata IS '사용량의 추가 메타데이터 (JSON 형식)';

-- ============================================
-- 11. TRIGGERS FOR UPDATED_AT
-- ============================================

-- Reuse the function from main schema if it exists, otherwise create it
DO $do$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ language 'plpgsql';
    END IF;
END $do$;

CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON subscription_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_memberships_updated_at BEFORE UPDATE ON tenant_memberships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_invitations_updated_at BEFORE UPDATE ON tenant_invitations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_subscriptions_updated_at BEFORE UPDATE ON tenant_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_accounts_updated_at BEFORE UPDATE ON billing_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_invoices_updated_at BEFORE UPDATE ON billing_invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_transactions_updated_at BEFORE UPDATE ON payment_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 12. FUNCTIONS FOR AUTOMATIC COUNTS AND DEFAULTS
-- ============================================

-- Function to update tenant member count
CREATE OR REPLACE FUNCTION update_tenant_member_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.membership_status = 'active' THEN
        UPDATE tenants 
        SET metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{current_member_count}',
            to_jsonb(
                COALESCE((metadata->>'current_member_count')::integer, 0) + 1
            )
        )
        WHERE id = NEW.tenant_id;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Handle status change from inactive to active
        IF OLD.membership_status != 'active' AND NEW.membership_status = 'active' THEN
            UPDATE tenants 
            SET metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{current_member_count}',
                to_jsonb(
                    COALESCE((metadata->>'current_member_count')::integer, 0) + 1
                )
            )
            WHERE id = NEW.tenant_id;
        -- Handle status change from active to inactive
        ELSIF OLD.membership_status = 'active' AND NEW.membership_status != 'active' THEN
            UPDATE tenants 
            SET metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{current_member_count}',
                to_jsonb(
                    GREATEST(COALESCE((metadata->>'current_member_count')::integer, 1) - 1, 0)
                )
            )
            WHERE id = NEW.tenant_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' AND OLD.membership_status = 'active' THEN
        UPDATE tenants 
        SET metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{current_member_count}',
            to_jsonb(
                GREATEST(COALESCE((metadata->>'current_member_count')::integer, 1) - 1, 0)
            )
        )
        WHERE id = OLD.tenant_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

COMMENT ON FUNCTION update_tenant_member_count() IS '테넌트의 활성 멤버 수를 자동으로 업데이트하는 트리거 함수';

CREATE TRIGGER trigger_update_tenant_member_count
    AFTER INSERT OR UPDATE OR DELETE ON tenant_memberships
    FOR EACH ROW EXECUTE FUNCTION update_tenant_member_count();

-- Function to ensure only one default payment method
CREATE OR REPLACE FUNCTION ensure_single_default_payment_method()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = TRUE THEN
        -- Unset other default payment methods for the same billing account
        UPDATE payment_methods
        SET is_default = FALSE
        WHERE billing_account_id = NEW.billing_account_id
        AND is_default = TRUE
        AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

COMMENT ON FUNCTION ensure_single_default_payment_method() IS '계정당 하나의 기본 결제 수단만 존재하도록 보장하는 트리거 함수';

CREATE TRIGGER trigger_ensure_single_default_payment_method
    BEFORE INSERT OR UPDATE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION ensure_single_default_payment_method();

-- ============================================
-- 13. CONSTRAINTS AND VALIDATIONS
-- ============================================

-- Ensure only one owner per tenant
CREATE OR REPLACE FUNCTION ensure_single_owner_per_tenant()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.membership_role = 'owner' THEN
        -- Check if there's already an active owner
        IF EXISTS (
            SELECT 1 FROM tenant_memberships
            WHERE tenant_id = NEW.tenant_id
            AND membership_role = 'owner'
            AND membership_status = 'active'
            AND id != NEW.id
        ) THEN
            RAISE EXCEPTION '테넌트당 하나의 활성 소유자만 존재할 수 있습니다.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

COMMENT ON FUNCTION ensure_single_owner_per_tenant() IS '테넌트당 하나의 활성 소유자만 존재하도록 보장하는 트리거 함수';

CREATE TRIGGER trigger_ensure_single_owner
    BEFORE INSERT OR UPDATE ON tenant_memberships
    FOR EACH ROW EXECUTE FUNCTION ensure_single_owner_per_tenant();

-- Ensure only one primary tenant per user
CREATE OR REPLACE FUNCTION ensure_single_primary_tenant()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_primary_tenant = TRUE THEN
        -- Unset other primary tenants for the same user
        UPDATE tenant_memberships
        SET is_primary_tenant = FALSE
        WHERE user_id = NEW.user_id
        AND is_primary_tenant = TRUE
        AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

COMMENT ON FUNCTION ensure_single_primary_tenant() IS '사용자당 하나의 기본 테넌트만 존재하도록 보장하는 트리거 함수';

CREATE TRIGGER trigger_ensure_single_primary_tenant
    BEFORE INSERT OR UPDATE ON tenant_memberships
    FOR EACH ROW EXECUTE FUNCTION ensure_single_primary_tenant();

-- ============================================
-- 14. INITIAL DATA - DEFAULT PLANS
-- ============================================

-- Default subscription plans
INSERT INTO subscription_plans (name, slug, plan_type, description, max_members, price_monthly, price_yearly, features) VALUES
    ('개인 플랜', 'personal', 'personal', '개인 사용자를 위한 기본 플랜', 1, 9.99, 99.99, '{"features": ["unlimited_posts", "basic_support"]}'),
    ('팀 플랜 (5명)', 'team-5', 'team', '5명까지의 팀을 위한 플랜', 5, 49.99, 499.99, '{"features": ["unlimited_posts", "team_collaboration", "priority_support"]}'),
    ('팀 플랜 (10명)', 'team-10', 'team', '10명까지의 팀을 위한 플랜', 10, 89.99, 899.99, '{"features": ["unlimited_posts", "team_collaboration", "priority_support", "advanced_analytics"]}'),
    ('엔터프라이즈 플랜', 'enterprise', 'enterprise', '대규모 조직을 위한 엔터프라이즈 플랜', NULL, 299.99, 2999.99, '{"features": ["unlimited_posts", "team_collaboration", "dedicated_support", "advanced_analytics", "custom_integrations"]}')
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- 15. NOTES FOR SCHEMA MIGRATION
-- ============================================

-- Important: The following ALTER TABLE statements should be run on the existing tenants table
-- if it already exists in your database:

/*
ALTER TABLE tenants 
    ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS tenant_type VARCHAR(50) DEFAULT 'personal' CHECK (tenant_type IN ('personal', 'team', 'enterprise')),
    ADD COLUMN IF NOT EXISTS member_limit INTEGER,
    ADD COLUMN IF NOT EXISTS current_member_count INTEGER DEFAULT 0;

COMMENT ON COLUMN tenants.owner_id IS '테넌트 소유자 ID (users 테이블 참조)';
COMMENT ON COLUMN tenants.tenant_type IS '테넌트 타입: personal(개인), team(팀), enterprise(엔터프라이즈)';
COMMENT ON COLUMN tenants.member_limit IS '최대 멤버 수 (NULL이면 무제한)';
COMMENT ON COLUMN tenants.current_member_count IS '현재 활성 멤버 수 (자동 업데이트)';
*/
