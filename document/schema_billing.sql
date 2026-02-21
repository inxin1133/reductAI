-- ============================================
-- 결제 (요금제, 구독, 청구서, 결제)
-- PostgreSQL 데이터베이스 스키마
-- ============================================
--
-- 중요:
-- 1. schema.sql을 먼저 실행하세요.
-- 2. 본 스키마는 schema_credits.sql에서 참조됩니다.
--
-- 권장 실행 순서:
--   schema.sql -> schema_models.sql -> schema_pricing.sql -> schema_billing.sql -> schema_credits.sql -> schema_llm_usage.sql
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. BILLING PLANS (요금제)
-- ============================================

CREATE TABLE billing_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    tier VARCHAR(20) NOT NULL CHECK (tier IN ('free', 'pro', 'premium', 'business', 'enterprise')),
    tenant_type VARCHAR(20) NOT NULL CHECK (tenant_type IN ('personal', 'team', 'group')),
    description TEXT,
    included_seats INTEGER NOT NULL DEFAULT 1,
    min_seats INTEGER NOT NULL DEFAULT 1,
    max_seats INTEGER,
    extra_seat_price_usd DECIMAL(10, 2) DEFAULT 0,
    storage_limit_mb INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CHECK (max_seats IS NULL OR max_seats >= included_seats)
);

CREATE INDEX idx_billing_plans_tier ON billing_plans(tier);
CREATE INDEX idx_billing_plans_active ON billing_plans(is_active);

COMMENT ON TABLE billing_plans IS '요금제 정의 및 제한.';
COMMENT ON COLUMN billing_plans.slug IS '요금제 고유 식별자(slug)';
COMMENT ON COLUMN billing_plans.name IS '요금제 이름';
COMMENT ON COLUMN billing_plans.tier IS '요금제 등급(free, pro, premium, business, enterprise)';
COMMENT ON COLUMN billing_plans.tenant_type IS '요금제 테넌트 타입(personal, team, group)';
COMMENT ON COLUMN billing_plans.description IS '요금제 설명';
COMMENT ON COLUMN billing_plans.included_seats IS '포함 좌석 수';
COMMENT ON COLUMN billing_plans.min_seats IS '최소 좌석 수';
COMMENT ON COLUMN billing_plans.max_seats IS '최대 좌석 수';
COMMENT ON COLUMN billing_plans.extra_seat_price_usd IS '추가 좌석 가격(USD)';
COMMENT ON COLUMN billing_plans.storage_limit_mb IS '저장소 제한(MB)';
COMMENT ON COLUMN billing_plans.is_active IS '활성 여부(TRUE, FALSE)';
COMMENT ON COLUMN billing_plans.sort_order IS '정렬 순서';
COMMENT ON COLUMN billing_plans.metadata IS '추가 메타데이터(JSON)';
COMMENT ON COLUMN billing_plans.created_at IS '생성 시간(TIMESTAMP)';
COMMENT ON COLUMN billing_plans.updated_at IS '수정 시간(TIMESTAMP)';

-- ============================================
-- 2. BILLING PLAN PRICES (요금제 가격)
-- ============================================

CREATE TABLE billing_plan_prices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID NOT NULL REFERENCES billing_plans(id) ON DELETE CASCADE,
    billing_cycle VARCHAR(20) NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
    price_usd DECIMAL(10, 2),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    version INTEGER NOT NULL DEFAULT 1,
    effective_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'retired')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (plan_id, billing_cycle, version)
);

CREATE INDEX idx_billing_plan_prices_plan ON billing_plan_prices(plan_id);
CREATE INDEX idx_billing_plan_prices_status ON billing_plan_prices(status);

COMMENT ON TABLE billing_plan_prices IS '요금제 가격(billing cycle별 버전 관리)';
COMMENT ON COLUMN billing_plan_prices.plan_id IS '요금제 ID(billing_plans.id)';
COMMENT ON COLUMN billing_plan_prices.billing_cycle IS '결제 주기(monthly, yearly)';
COMMENT ON COLUMN billing_plan_prices.price_usd IS '가격(USD)';
COMMENT ON COLUMN billing_plan_prices.currency IS '통화(USD, KRW, JPY, EUR, GBP, etc)';
COMMENT ON COLUMN billing_plan_prices.version IS '버전';
COMMENT ON COLUMN billing_plan_prices.effective_at IS '유효 시간(TIMESTAMP)';
COMMENT ON COLUMN billing_plan_prices.status IS '상태(active, draft, retired)';
COMMENT ON COLUMN billing_plan_prices.metadata IS '추가 메타데이터(JSON)';
COMMENT ON COLUMN billing_plan_prices.created_at IS '생성 시간(TIMESTAMP)';
COMMENT ON COLUMN billing_plan_prices.updated_at IS '수정 시간(TIMESTAMP)';

-- ============================================
-- 3. BILLING SUBSCRIPTIONS (구독)
-- ============================================

CREATE TABLE billing_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES billing_plans(id) ON DELETE RESTRICT,
    billing_cycle VARCHAR(20) NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
    status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (
        status IN ('active', 'cancelled', 'past_due', 'trialing', 'suspended', 'scheduled_cancel')
    ),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
    price_usd DECIMAL(10, 2),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_billing_subscriptions_tenant ON billing_subscriptions(tenant_id);
CREATE INDEX idx_billing_subscriptions_status ON billing_subscriptions(status);
CREATE INDEX idx_billing_subscriptions_period_end ON billing_subscriptions(current_period_end);

COMMENT ON TABLE billing_subscriptions IS '테넌트 구독 정보.';
COMMENT ON COLUMN billing_subscriptions.id IS '구독 ID(UUID)';
COMMENT ON COLUMN billing_subscriptions.tenant_id IS '테넌트 ID(tenants.id)';
COMMENT ON COLUMN billing_subscriptions.plan_id IS '요금제 ID(billing_plans.id)';
COMMENT ON COLUMN billing_subscriptions.billing_cycle IS '결제 주기(monthly, yearly)';
COMMENT ON COLUMN billing_subscriptions.status IS '상태(active, cancelled, past_due, trialing, suspended, scheduled_cancel)';
COMMENT ON COLUMN billing_subscriptions.started_at IS '시작 시간(TIMESTAMP)';
COMMENT ON COLUMN billing_subscriptions.current_period_start IS '현재 과금 기간 시작 시간(TIMESTAMP)';
COMMENT ON COLUMN billing_subscriptions.current_period_end IS '현재 과금 기간 종료 시간(TIMESTAMP)';
COMMENT ON COLUMN billing_subscriptions.cancel_at_period_end IS '취소 시 과금 기간 종료 여부(TRUE, FALSE)';
COMMENT ON COLUMN billing_subscriptions.cancelled_at IS '취소 시간(TIMESTAMP)';
COMMENT ON COLUMN billing_subscriptions.ended_at IS '종료 시간(TIMESTAMP)';
COMMENT ON COLUMN billing_subscriptions.auto_renew IS '자동 갱신 여부(TRUE, FALSE)';
COMMENT ON COLUMN billing_subscriptions.price_usd IS '가격(USD)';
COMMENT ON COLUMN billing_subscriptions.currency IS '통화(USD, KRW, JPY, EUR, GBP, etc)';

COMMENT ON COLUMN billing_subscriptions.metadata IS '추가 메타데이터(JSON)';
COMMENT ON COLUMN billing_subscriptions.created_at IS '생성 시간(TIMESTAMP)';
COMMENT ON COLUMN billing_subscriptions.updated_at IS '수정 시간(TIMESTAMP)';

-- ============================================
-- 4. SUBSCRIPTION CHANGES (upgrade/downgrade) (구독 변경)
-- ============================================

CREATE TABLE billing_subscription_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID NOT NULL REFERENCES billing_subscriptions(id) ON DELETE CASCADE,
    from_plan_id UUID REFERENCES billing_plans(id) ON DELETE SET NULL,
    to_plan_id UUID REFERENCES billing_plans(id) ON DELETE SET NULL,
    from_billing_cycle VARCHAR(20) CHECK (from_billing_cycle IN ('monthly', 'yearly')),
    to_billing_cycle VARCHAR(20) CHECK (to_billing_cycle IN ('monthly', 'yearly')),
    change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('upgrade', 'downgrade', 'cancel', 'resume')),
    effective_at TIMESTAMP WITH TIME ZONE NOT NULL,
    proration_amount_usd DECIMAL(10, 2) DEFAULT 0,
    credit_proration_credits BIGINT DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'applied', 'cancelled')),
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_billing_subscription_changes_subscription ON billing_subscription_changes(subscription_id);
CREATE INDEX idx_billing_subscription_changes_status ON billing_subscription_changes(status);

COMMENT ON TABLE billing_subscription_changes IS '업그레이드/다운그레이드 예약 변경 내역.';
COMMENT ON COLUMN billing_subscription_changes.id IS '변경 ID(UUID)';
COMMENT ON COLUMN billing_subscription_changes.subscription_id IS '구독 ID(billing_subscriptions.id)';
COMMENT ON COLUMN billing_subscription_changes.from_plan_id IS '이전 요금제 ID(billing_plans.id)';
COMMENT ON COLUMN billing_subscription_changes.to_plan_id IS '새 요금제 ID(billing_plans.id)';
COMMENT ON COLUMN billing_subscription_changes.from_billing_cycle IS '이전 결제 주기(monthly, yearly)';
COMMENT ON COLUMN billing_subscription_changes.to_billing_cycle IS '새 결제 주기(monthly, yearly)';
COMMENT ON COLUMN billing_subscription_changes.change_type IS '변경 유형(upgrade, downgrade, cancel, resume)';
COMMENT ON COLUMN billing_subscription_changes.effective_at IS '유효 시간(TIMESTAMP)';
COMMENT ON COLUMN billing_subscription_changes.proration_amount_usd IS '조정 금액(USD)';
COMMENT ON COLUMN billing_subscription_changes.credit_proration_credits IS '크레딧 조정 크레딧(credit)';
COMMENT ON COLUMN billing_subscription_changes.status IS '상태(scheduled, applied, cancelled)';
COMMENT ON COLUMN billing_subscription_changes.requested_by IS '요청자 ID(users.id)';
COMMENT ON COLUMN billing_subscription_changes.metadata IS '추가 메타데이터(JSON)';
COMMENT ON COLUMN billing_subscription_changes.created_at IS '생성 시간(TIMESTAMP)';
COMMENT ON COLUMN billing_subscription_changes.updated_at IS '수정 시간(TIMESTAMP)';

-- ============================================
-- 5. BILLING ACCOUNTS (과금 계정)
-- ============================================

CREATE TABLE billing_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    billing_email VARCHAR(255),
    billing_name VARCHAR(255),
    billing_postal_code VARCHAR(20),
    billing_address1 VARCHAR(255),
    billing_address2 VARCHAR(255),
    billing_extra_address VARCHAR(255),
    billing_phone VARCHAR(30),
    country_code VARCHAR(2),
    tax_country_code VARCHAR(2),
    tax_id VARCHAR(100),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id)
);

CREATE INDEX idx_billing_accounts_tenant ON billing_accounts(tenant_id);

COMMENT ON TABLE billing_accounts IS '테넌트별 과금 정보.';
COMMENT ON COLUMN billing_accounts.id IS '과금 계정 ID(UUID)';
COMMENT ON COLUMN billing_accounts.tenant_id IS '테넌트 ID(tenants.id)';
COMMENT ON COLUMN billing_accounts.billing_email IS '과금 이메일 주소';
COMMENT ON COLUMN billing_accounts.billing_name IS '과금 담당자 이름';
COMMENT ON COLUMN billing_accounts.billing_postal_code IS '청구지 우편번호';
COMMENT ON COLUMN billing_accounts.billing_address1 IS '청구지 기본 주소';
COMMENT ON COLUMN billing_accounts.billing_address2 IS '청구지 상세 주소';
COMMENT ON COLUMN billing_accounts.billing_extra_address IS '청구지 참고 항목';
COMMENT ON COLUMN billing_accounts.billing_phone IS '청구지 연락처';
COMMENT ON COLUMN billing_accounts.country_code IS '국가 코드(ISO 3166-1 alpha-2)';
COMMENT ON COLUMN billing_accounts.tax_country_code IS '세금 국가 코드(ISO 3166-1 alpha-2)';
COMMENT ON COLUMN billing_accounts.tax_id IS '세금 고유번호';
COMMENT ON COLUMN billing_accounts.currency IS '통화(USD, KRW, JPY, EUR, GBP, etc)';
COMMENT ON COLUMN billing_accounts.metadata IS '추가 메타데이터(JSON)';
COMMENT ON COLUMN billing_accounts.created_at IS '생성 시간(TIMESTAMP)';
COMMENT ON COLUMN billing_accounts.updated_at IS '수정 시간(TIMESTAMP)';

-- ============================================
-- 6. PAYMENT METHODS (결제 수단)
-- ============================================

CREATE TABLE payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    billing_account_id UUID NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('toss', 'stripe')),
    type VARCHAR(20) NOT NULL DEFAULT 'card' CHECK (type IN ('card')),
    provider_customer_id VARCHAR(255),
    provider_payment_method_id VARCHAR(255) NOT NULL,
    card_brand VARCHAR(50),
    card_last4 VARCHAR(4),
    card_exp_month INTEGER,
    card_exp_year INTEGER,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'deleted')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payment_methods_billing_account ON payment_methods(billing_account_id);
CREATE INDEX idx_payment_methods_provider_method ON payment_methods(provider_payment_method_id);
CREATE INDEX idx_payment_methods_default ON payment_methods(billing_account_id, is_default) WHERE is_default = TRUE;

COMMENT ON TABLE payment_methods IS '과금 계정별로 저장된 결제 수단.';
COMMENT ON COLUMN payment_methods.id IS '결제 수단 ID(UUID)';
COMMENT ON COLUMN payment_methods.billing_account_id IS '과금 계정 ID(billing_accounts.id)'; -- 결제 수단을 관리하는 과금 계정의 ID입니다.
COMMENT ON COLUMN payment_methods.provider IS '결제 수단 제공자(toss, stripe)';  -- 결제 수단을 제공하는 결제 제공자의 이름입니다. 예: Stripe, Toss.
COMMENT ON COLUMN payment_methods.type IS '결제 수단 타입(card)'; -- 결제 수단의 타입입니다. 현재 카드만 지원합니다.
COMMENT ON COLUMN payment_methods.provider_customer_id IS '결제 수단 제공자 고유 ID'; -- 결제 제공자가 관리하는 “고객”의 ID입니다. 예: Stripe의 cus_... 또는 Toss의 고객 식별자.
COMMENT ON COLUMN payment_methods.provider_payment_method_id IS '결제 수단 제공자 결제 수단 ID'; -- 결제 제공자에 등록된 결제 수단(카드/계좌)의 ID(토큰)입니다.
COMMENT ON COLUMN payment_methods.card_brand IS '카드 브랜드(Visa, Mastercard, Amex 등)';
COMMENT ON COLUMN payment_methods.card_last4 IS '카드 번호 마지막 4자리';

COMMENT ON COLUMN payment_methods.card_exp_month IS '카드 만료 월';
COMMENT ON COLUMN payment_methods.card_exp_year IS '카드 만료 년';
COMMENT ON COLUMN payment_methods.is_default IS '기본 결제 수단 여부(TRUE, FALSE)';
COMMENT ON COLUMN payment_methods.status IS '결제 수단 상태(active, expired, deleted)';
COMMENT ON COLUMN payment_methods.metadata IS '추가 메타데이터(JSON)';
COMMENT ON COLUMN payment_methods.created_at IS '생성 시간(TIMESTAMP)';
COMMENT ON COLUMN payment_methods.updated_at IS '수정 시간(TIMESTAMP)';

ALTER TABLE billing_accounts
  ADD COLUMN IF NOT EXISTS billing_postal_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS billing_address1 VARCHAR(255),
  ADD COLUMN IF NOT EXISTS billing_address2 VARCHAR(255),
  ADD COLUMN IF NOT EXISTS billing_extra_address VARCHAR(255),
  ADD COLUMN IF NOT EXISTS billing_phone VARCHAR(30);

ALTER TABLE billing_accounts
  ADD COLUMN IF NOT EXISTS default_payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL;

ALTER TABLE tax_rates
  ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'manual';

-- ============================================
-- 7. PAYMENT PROVIDER CONFIGS (결제 수단 설정)
-- ============================================

CREATE TABLE payment_provider_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(20) NOT NULL UNIQUE CHECK (provider IN ('toss', 'stripe')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE payment_provider_configs IS '결제 수단 설정(Toss/Stripe).';
COMMENT ON COLUMN payment_provider_configs.id IS '결제 수단 설정 ID(UUID)';
COMMENT ON COLUMN payment_provider_configs.provider IS '결제 수단 설정 제공자(toss, stripe)';
COMMENT ON COLUMN payment_provider_configs.is_active IS '활성 여부(TRUE, FALSE)';
COMMENT ON COLUMN payment_provider_configs.config IS '결제 수단 설정 정보(JSON)';
COMMENT ON COLUMN payment_provider_configs.created_at IS '생성 시간(TIMESTAMP)';
COMMENT ON COLUMN payment_provider_configs.updated_at IS '수정 시간(TIMESTAMP)';


-- ============================================
-- 8. TAX RATES (세금)
-- ============================================

CREATE TABLE tax_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    country_code VARCHAR(2) NOT NULL,
    rate_percent DECIMAL(5, 2) NOT NULL,
    source VARCHAR(30) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'market')),
    effective_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tax_rates_country ON tax_rates(country_code);
CREATE INDEX idx_tax_rates_active ON tax_rates(is_active);

COMMENT ON TABLE tax_rates IS '세금 정보(VAT)';
COMMENT ON COLUMN tax_rates.id IS '세금 ID(UUID)';
COMMENT ON COLUMN tax_rates.name IS '세금 이름';
COMMENT ON COLUMN tax_rates.country_code IS '세금 국가 코드(ISO 3166-1 alpha-2)';
COMMENT ON COLUMN tax_rates.rate_percent IS '세금 비율';
COMMENT ON COLUMN tax_rates.source IS '세금 데이터 소스(manual, market)';
COMMENT ON COLUMN tax_rates.effective_at IS '유효 시간(TIMESTAMP)';
COMMENT ON COLUMN tax_rates.is_active IS '활성 여부(TRUE, FALSE)';
COMMENT ON COLUMN tax_rates.created_at IS '생성 시간(TIMESTAMP)';
COMMENT ON COLUMN tax_rates.updated_at IS '수정 시간(TIMESTAMP)';

-- ============================================
-- 9. FX RATES (operating USD->KRW) (통화 변환)
-- ============================================

CREATE TABLE fx_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    base_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    quote_currency VARCHAR(3) NOT NULL DEFAULT 'KRW',
    rate DECIMAL(12, 6) NOT NULL,
    source VARCHAR(30) NOT NULL DEFAULT 'operating' CHECK (source IN ('operating', 'market')),
    effective_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (base_currency, quote_currency, effective_at)
);

CREATE INDEX idx_fx_rates_active ON fx_rates(is_active);
CREATE INDEX idx_fx_rates_effective_at ON fx_rates(effective_at);

COMMENT ON TABLE fx_rates IS '청구 금액 변환을 위한 관리형 환율 정보 (USD→KRW)';
COMMENT ON COLUMN fx_rates.id IS '통화 변환 ID(UUID)';
COMMENT ON COLUMN fx_rates.base_currency IS '기준 통화(USD)';
COMMENT ON COLUMN fx_rates.quote_currency IS '통화(KRW)';
COMMENT ON COLUMN fx_rates.rate IS '통화 변환 비율';
COMMENT ON COLUMN fx_rates.source IS '통화 변환 소스(operating, market)';
COMMENT ON COLUMN fx_rates.effective_at IS '유효 시간(TIMESTAMP)';
COMMENT ON COLUMN fx_rates.is_active IS '활성 여부(TRUE, FALSE)';
COMMENT ON COLUMN fx_rates.created_at IS '생성 시간(TIMESTAMP)';
COMMENT ON COLUMN fx_rates.updated_at IS '수정 시간(TIMESTAMP)';

-- ============================================
-- 9.5 BILLING SYNC STATUS (동기화 상태)
-- ============================================

CREATE TABLE billing_sync_status (
    sync_key VARCHAR(40) PRIMARY KEY,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMP WITH TIME ZONE,
    last_success_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    last_source VARCHAR(30),
    last_record_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE billing_sync_status IS '세율/환율 동기화 상태';
COMMENT ON COLUMN billing_sync_status.sync_key IS '동기화 키(fx_rates, tax_rates)';
COMMENT ON COLUMN billing_sync_status.is_enabled IS '자동 동기화 활성 여부';
COMMENT ON COLUMN billing_sync_status.last_run_at IS '마지막 동기화 시도 시간';
COMMENT ON COLUMN billing_sync_status.last_success_at IS '마지막 동기화 성공 시간';
COMMENT ON COLUMN billing_sync_status.last_error IS '마지막 오류 메시지';
COMMENT ON COLUMN billing_sync_status.last_source IS '마지막 동기화 소스';
COMMENT ON COLUMN billing_sync_status.last_record_count IS '마지막 동기화 반영 건수';
COMMENT ON COLUMN billing_sync_status.created_at IS '생성 시간(TIMESTAMP)';
COMMENT ON COLUMN billing_sync_status.updated_at IS '수정 시간(TIMESTAMP)';

-- ============================================
-- 10. BILLING INVOICES (청구서)
-- ============================================

CREATE TABLE billing_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES billing_subscriptions(id) ON DELETE SET NULL,
    billing_account_id UUID NOT NULL REFERENCES billing_accounts(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    subtotal_usd DECIMAL(10, 2) NOT NULL DEFAULT 0,
    tax_usd DECIMAL(10, 2) NOT NULL DEFAULT 0,
    discount_usd DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total_usd DECIMAL(10, 2) NOT NULL DEFAULT 0,
    tax_rate_id UUID REFERENCES tax_rates(id) ON DELETE SET NULL,
    fx_rate_id UUID REFERENCES fx_rates(id) ON DELETE SET NULL,
    exchange_rate DECIMAL(12, 6),
    local_currency VARCHAR(3) NOT NULL DEFAULT 'KRW',
    local_subtotal DECIMAL(12, 2),
    local_tax DECIMAL(12, 2),
    local_total DECIMAL(12, 2),
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    issue_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    due_date TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_billing_invoices_tenant ON billing_invoices(tenant_id);
CREATE INDEX idx_billing_invoices_subscription ON billing_invoices(subscription_id);
CREATE INDEX idx_billing_invoices_status ON billing_invoices(status);

COMMENT ON TABLE billing_invoices IS '청구서 기록(USD 및 현지 통화 합계 포함, USD, KRW)';
COMMENT ON COLUMN billing_invoices.id IS '청구서 ID(UUID)';
COMMENT ON COLUMN billing_invoices.tenant_id IS '테넌트 ID(tenants.id)';
COMMENT ON COLUMN billing_invoices.subscription_id IS '구독 ID(billing_subscriptions.id)';
COMMENT ON COLUMN billing_invoices.billing_account_id IS '과금 계정 ID(billing_accounts.id)';
COMMENT ON COLUMN billing_invoices.invoice_number IS '청구서 번호';
COMMENT ON COLUMN billing_invoices.status IS '청구서 상태(draft, open, paid, void, uncollectible)';
COMMENT ON COLUMN billing_invoices.currency IS '통화(USD)';
COMMENT ON COLUMN billing_invoices.subtotal_usd IS '소계(USD)';
COMMENT ON COLUMN billing_invoices.tax_usd IS '세금(USD)';
COMMENT ON COLUMN billing_invoices.discount_usd IS '할인(USD)';
COMMENT ON COLUMN billing_invoices.total_usd IS '총액(USD)';
COMMENT ON COLUMN billing_invoices.tax_rate_id IS '세금 비율 ID(tax_rates.id)';
COMMENT ON COLUMN billing_invoices.fx_rate_id IS '통화 변환 ID(fx_rates.id)';
COMMENT ON COLUMN billing_invoices.exchange_rate IS '통화 변환 비율';
COMMENT ON COLUMN billing_invoices.local_currency IS '현지 통화(KRW)';
COMMENT ON COLUMN billing_invoices.local_subtotal IS '소계(현지 통화)';
COMMENT ON COLUMN billing_invoices.local_tax IS '세금(현지 통화)';
COMMENT ON COLUMN billing_invoices.local_total IS '총액(현지 통화)';
COMMENT ON COLUMN billing_invoices.period_start IS '청구 기간 시작 시간(TIMESTAMP)';
COMMENT ON COLUMN billing_invoices.period_end IS '청구 기간 종료 시간(TIMESTAMP)';
COMMENT ON COLUMN billing_invoices.issue_date IS '청구서 발행 시간(TIMESTAMP)';
COMMENT ON COLUMN billing_invoices.due_date IS '청구서 결제 기한(TIMESTAMP)';
COMMENT ON COLUMN billing_invoices.paid_at IS '청구서 결제 완료 시간(TIMESTAMP)';
COMMENT ON COLUMN billing_invoices.metadata IS '추가 메타데이터(JSON)';
COMMENT ON COLUMN billing_invoices.created_at IS '생성 시간(TIMESTAMP)';
COMMENT ON COLUMN billing_invoices.updated_at IS '수정 시간(TIMESTAMP)';

-- ============================================
-- 11. INVOICE LINE ITEMS (청구서 항목)
-- ============================================

CREATE TABLE invoice_line_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
    line_type VARCHAR(30) NOT NULL CHECK (line_type IN ('subscription', 'seat_overage', 'topup', 'adjustment', 'refund')),
    description TEXT NOT NULL,
    quantity DECIMAL(12, 4) NOT NULL DEFAULT 1,
    unit_price_usd DECIMAL(10, 2) NOT NULL DEFAULT 0,
    amount_usd DECIMAL(10, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);

COMMENT ON TABLE invoice_line_items IS '청구서 항목 기록(USD 및 현지 통화 합계 포함, USD, KRW)';
COMMENT ON COLUMN invoice_line_items.id IS '청구서 항목 ID(UUID)';
COMMENT ON COLUMN invoice_line_items.invoice_id IS '청구서 ID(billing_invoices.id)';
COMMENT ON COLUMN invoice_line_items.line_type IS '청구서 항목 타입(subscription, seat_overage, topup, adjustment, refund)';
COMMENT ON COLUMN invoice_line_items.description IS '청구서 항목 설명';
COMMENT ON COLUMN invoice_line_items.quantity IS '청구서 항목 수량';
COMMENT ON COLUMN invoice_line_items.unit_price_usd IS '단가(USD)';
COMMENT ON COLUMN invoice_line_items.amount_usd IS '금액(USD)';

-- ============================================
-- 12. PAYMENT TRANSACTIONS (결제 거래)
-- ============================================

CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES billing_invoices(id) ON DELETE SET NULL,
    billing_account_id UUID NOT NULL REFERENCES billing_accounts(id) ON DELETE RESTRICT,
    payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('toss', 'stripe')),
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('charge', 'refund', 'adjustment')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'cancelled')),
    amount_usd DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    amount_local DECIMAL(12, 2),
    local_currency VARCHAR(3) DEFAULT 'KRW',
    provider_transaction_id VARCHAR(255),
    related_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE SET NULL,
    failure_reason TEXT,
    processed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payment_transactions_invoice ON payment_transactions(invoice_id);
CREATE INDEX idx_payment_transactions_billing_account ON payment_transactions(billing_account_id);
CREATE INDEX idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX idx_payment_transactions_provider_id ON payment_transactions(provider_transaction_id);

COMMENT ON TABLE payment_transactions IS '결제 및 환불 거래';
COMMENT ON COLUMN payment_transactions.id IS '결제 거래 ID(UUID)';
COMMENT ON COLUMN payment_transactions.invoice_id IS '청구서 ID(billing_invoices.id)';
COMMENT ON COLUMN payment_transactions.billing_account_id IS '과금 계정 ID(billing_accounts.id)';
COMMENT ON COLUMN payment_transactions.payment_method_id IS '결제 수단 ID(payment_methods.id)';
COMMENT ON COLUMN payment_transactions.provider IS '결제 수단 제공자(toss, stripe)';
COMMENT ON COLUMN payment_transactions.transaction_type IS '결제 거래 타입(charge, refund, adjustment)';
COMMENT ON COLUMN payment_transactions.status IS '결제 거래 상태(pending, succeeded, failed, refunded, cancelled)';
COMMENT ON COLUMN payment_transactions.amount_usd IS '금액(USD)';
COMMENT ON COLUMN payment_transactions.currency IS '통화(USD)';
COMMENT ON COLUMN payment_transactions.amount_local IS '금액(현지 통화)';
COMMENT ON COLUMN payment_transactions.local_currency IS '현지 통화(KRW)';
COMMENT ON COLUMN payment_transactions.provider_transaction_id IS '결제 수단 제공자 결제 수단 ID';
COMMENT ON COLUMN payment_transactions.related_transaction_id IS '관련 결제 거래 ID(payment_transactions.id)';
COMMENT ON COLUMN payment_transactions.failure_reason IS '실패 사유';
COMMENT ON COLUMN payment_transactions.processed_at IS '처리 시간(TIMESTAMP)';
COMMENT ON COLUMN payment_transactions.metadata IS '추가 메타데이터(JSON)';
COMMENT ON COLUMN payment_transactions.created_at IS '생성 시간(TIMESTAMP)';
COMMENT ON COLUMN payment_transactions.updated_at IS '수정 시간(TIMESTAMP)';

-- ============================================
-- 13. UPDATED_AT TRIGGERS (업데이트 시간 트리거)
-- ============================================

DO $do$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $func$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $func$ language 'plpgsql';
    END IF;
END $do$;

CREATE TRIGGER update_billing_plans_updated_at BEFORE UPDATE ON billing_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_billing_plan_prices_updated_at BEFORE UPDATE ON billing_plan_prices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_billing_subscriptions_updated_at BEFORE UPDATE ON billing_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_billing_subscription_changes_updated_at BEFORE UPDATE ON billing_subscription_changes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_billing_accounts_updated_at BEFORE UPDATE ON billing_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_provider_configs_updated_at BEFORE UPDATE ON payment_provider_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tax_rates_updated_at BEFORE UPDATE ON tax_rates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_fx_rates_updated_at BEFORE UPDATE ON fx_rates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_billing_sync_status_updated_at BEFORE UPDATE ON billing_sync_status
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_billing_invoices_updated_at BEFORE UPDATE ON billing_invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_transactions_updated_at BEFORE UPDATE ON payment_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Ensure single default payment method per billing account
CREATE OR REPLACE FUNCTION ensure_single_default_payment_method()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = TRUE THEN
        UPDATE payment_methods
        SET is_default = FALSE
        WHERE billing_account_id = NEW.billing_account_id
          AND id != NEW.id
          AND is_default = TRUE;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_ensure_single_default_payment_method
    BEFORE INSERT OR UPDATE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION ensure_single_default_payment_method();

-- ============================================
-- 14. SEED DATA
-- ============================================

INSERT INTO billing_plans (slug, name, tier, tenant_type, description, included_seats, min_seats, max_seats, extra_seat_price_usd, storage_limit_mb, is_active, sort_order, metadata)
VALUES
    ('free', 'Free', 'free', 'personal', 'Free plan', 1, 1, 1, 0, 500, TRUE, 1, '{"monthly_credits":0,"initial_credits":500}'::jsonb),
    ('pro', 'Pro', 'pro', 'personal', 'Pro plan', 1, 1, 1, 0, 10240, TRUE, 2, '{"monthly_credits":20000}'::jsonb),
    ('premium', 'Premium', 'premium', 'team', 'Premium plan', 5, 1, 8, 5, 51200, TRUE, 3, '{"monthly_credits":50000}'::jsonb),
    ('business', 'Business', 'business', 'group', 'Business plan', 10, 1, 48, 5, 102400, TRUE, 4, '{"monthly_credits":100000}'::jsonb),
    ('enterprise', 'Enterprise', 'enterprise', 'group', 'Enterprise plan', 50, 1, NULL, 0, NULL, FALSE, 5, '{"note":"custom"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

WITH plan_ids AS (
    SELECT id, slug FROM billing_plans
)
INSERT INTO billing_plan_prices (plan_id, billing_cycle, price_usd, currency, version, effective_at, status)
SELECT p.id, v.billing_cycle, v.price_usd, 'USD', 1, CURRENT_TIMESTAMP, v.status
FROM plan_ids p
JOIN (VALUES
    ('free', 'monthly', 0.00, 'active'),
    ('free', 'yearly', 0.00, 'active'),
    ('pro', 'monthly', 20.00, 'active'),
    ('pro', 'yearly', 200.00, 'active'),
    ('premium', 'monthly', 60.00, 'active'),
    ('premium', 'yearly', 600.00, 'active'),
    ('business', 'monthly', 200.00, 'active'),
    ('business', 'yearly', 2000.00, 'active'),
    ('enterprise', 'monthly', NULL, 'draft'),
    ('enterprise', 'yearly', NULL, 'draft')
) AS v(slug, billing_cycle, price_usd, status) ON v.slug = p.slug
ON CONFLICT (plan_id, billing_cycle, version) DO NOTHING;

INSERT INTO payment_provider_configs (provider, is_active, config)
VALUES
    ('toss', TRUE, '{"note":"KR initial provider"}'::jsonb),
    ('stripe', FALSE, '{"note":"Global expansion"}'::jsonb)
ON CONFLICT (provider) DO NOTHING;

INSERT INTO tax_rates (name, country_code, rate_percent, source, is_active)
VALUES ('KR VAT', 'KR', 10.00, 'manual', TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO billing_sync_status (sync_key, is_enabled, last_source)
VALUES
    ('fx_rates', TRUE, 'market'),
    ('tax_rates', TRUE, 'market')
ON CONFLICT (sync_key) DO NOTHING;

INSERT INTO fx_rates (base_currency, quote_currency, rate, source, is_active)
VALUES ('USD', 'KRW', 1300.000000, 'operating', TRUE)
ON CONFLICT DO NOTHING;
