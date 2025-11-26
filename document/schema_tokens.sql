-- ============================================
-- Token Management System for Microservices
-- Token Usage Tracking, Quotas, and Billing
-- PostgreSQL Database Schema
-- ============================================
--
-- IMPORTANT NOTES:
-- 1. This schema requires schema.sql and schema_tenant_membership.sql to be executed first
-- 2. Tokens are used across microservices for various features (AI search, API calls, etc.)
-- 3. Token usage is tracked per tenant and per user
-- 4. Tokens can be purchased in packages (prepaid) or billed on usage (postpaid)
-- 5. Usage limits can be set and adjusted per tenant
--
-- ============================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. TOKEN PRODUCTS (토큰 상품/패키지)
-- ============================================

CREATE TABLE token_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    token_amount BIGINT NOT NULL, -- 제공되는 토큰 수량
    price DECIMAL(10, 2) NOT NULL, -- 가격
    currency VARCHAR(3) DEFAULT 'USD',
    bonus_tokens BIGINT DEFAULT 0, -- 보너스 토큰 (예: 1000개 구매 시 100개 추가)
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_token_products_slug ON token_products(slug);
CREATE INDEX idx_token_products_is_active ON token_products(is_active);

COMMENT ON TABLE token_products IS '토큰 상품/패키지 정보를 관리하는 테이블. 테넌트가 구매할 수 있는 토큰 패키지를 정의합니다.';
COMMENT ON COLUMN token_products.id IS '토큰 상품의 고유 식별자 (UUID)';
COMMENT ON COLUMN token_products.name IS '토큰 상품 이름 (예: 기본 패키지, 프리미엄 패키지)';
COMMENT ON COLUMN token_products.slug IS '토큰 상품의 고유 식별 문자열';
COMMENT ON COLUMN token_products.description IS '토큰 상품 설명';
COMMENT ON COLUMN token_products.token_amount IS '제공되는 토큰 수량';
COMMENT ON COLUMN token_products.price IS '토큰 패키지 가격';
COMMENT ON COLUMN token_products.currency IS '통화 코드';
COMMENT ON COLUMN token_products.bonus_tokens IS '보너스로 제공되는 추가 토큰 수량';
COMMENT ON COLUMN token_products.is_active IS '상품 활성화 여부';
COMMENT ON COLUMN token_products.display_order IS '상품 표시 순서';
COMMENT ON COLUMN token_products.metadata IS '상품의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN token_products.created_at IS '상품 생성 시각';
COMMENT ON COLUMN token_products.updated_at IS '상품 정보 최종 수정 시각';

-- ============================================
-- 2. TENANT TOKEN BALANCES (테넌트 토큰 잔액)
-- ============================================

CREATE TABLE tenant_token_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    prepaid_balance BIGINT DEFAULT 0, -- 선불 구매한 토큰 잔액
    postpaid_limit BIGINT, -- 후불 사용 한도 (NULL이면 무제한)
    current_usage BIGINT DEFAULT 0, -- 현재 사용량 (후불 기준)
    usage_limit_enabled BOOLEAN DEFAULT FALSE, -- 사용량 제한 활성화 여부
    usage_limit_amount BIGINT, -- 사용량 제한 수량 (NULL이면 무제한)
    auto_recharge_enabled BOOLEAN DEFAULT FALSE, -- 자동 충전 활성화 여부
    auto_recharge_threshold BIGINT, -- 자동 충전 임계값 (이 수량 이하로 떨어지면 자동 충전)
    auto_recharge_product_id UUID REFERENCES token_products(id) ON DELETE SET NULL, -- 자동 충전 시 사용할 상품
    billing_mode VARCHAR(50) DEFAULT 'prepaid' CHECK (billing_mode IN ('prepaid', 'postpaid', 'hybrid')), -- 과금 모드
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id)
);

CREATE INDEX idx_tenant_token_balances_tenant_id ON tenant_token_balances(tenant_id);
CREATE INDEX idx_tenant_token_balances_prepaid_balance ON tenant_token_balances(prepaid_balance) WHERE prepaid_balance > 0;

COMMENT ON TABLE tenant_token_balances IS '테넌트별 토큰 잔액을 관리하는 테이블';
COMMENT ON COLUMN tenant_token_balances.id IS '잔액 레코드의 고유 식별자 (UUID)';
COMMENT ON COLUMN tenant_token_balances.tenant_id IS '테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN tenant_token_balances.prepaid_balance IS '선불 구매한 토큰 잔액';
COMMENT ON COLUMN tenant_token_balances.postpaid_limit IS '후불 사용 한도 (NULL이면 무제한)';
COMMENT ON COLUMN tenant_token_balances.current_usage IS '현재 사용량 (후불 기준, 청구 기간별로 리셋)';
COMMENT ON COLUMN tenant_token_balances.usage_limit_enabled IS '사용량 제한 활성화 여부';
COMMENT ON COLUMN tenant_token_balances.usage_limit_amount IS '사용량 제한 수량 (NULL이면 무제한)';
COMMENT ON COLUMN tenant_token_balances.auto_recharge_enabled IS '자동 충전 활성화 여부';
COMMENT ON COLUMN tenant_token_balances.auto_recharge_threshold IS '자동 충전 임계값';
COMMENT ON COLUMN tenant_token_balances.auto_recharge_product_id IS '자동 충전 시 사용할 토큰 상품 ID';
COMMENT ON COLUMN tenant_token_balances.billing_mode IS '과금 모드: prepaid(선불), postpaid(후불), hybrid(혼합)';
COMMENT ON COLUMN tenant_token_balances.metadata IS '잔액의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN tenant_token_balances.created_at IS '잔액 레코드 생성 시각';
COMMENT ON COLUMN tenant_token_balances.updated_at IS '잔액 정보 최종 수정 시각';

-- ============================================
-- 3. USER TOKEN BALANCES (사용자별 토큰 잔액)
-- ============================================

CREATE TABLE user_token_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    allocated_tokens BIGINT DEFAULT 0, -- 테넌트로부터 할당받은 토큰
    used_tokens BIGINT DEFAULT 0, -- 사용한 토큰
    remaining_tokens BIGINT DEFAULT 0, -- 남은 토큰 (allocated - used)
    usage_limit_enabled BOOLEAN DEFAULT FALSE, -- 사용량 제한 활성화 여부
    usage_limit_amount BIGINT, -- 사용량 제한 수량
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, tenant_id)
);

CREATE INDEX idx_user_token_balances_user_id ON user_token_balances(user_id);
CREATE INDEX idx_user_token_balances_tenant_id ON user_token_balances(tenant_id);
CREATE INDEX idx_user_token_balances_user_tenant ON user_token_balances(user_id, tenant_id);

COMMENT ON TABLE user_token_balances IS '사용자별 토큰 잔액을 관리하는 테이블. 테넌트 내에서 사용자에게 할당된 토큰을 추적합니다.';
COMMENT ON COLUMN user_token_balances.id IS '잔액 레코드의 고유 식별자 (UUID)';
COMMENT ON COLUMN user_token_balances.user_id IS '사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN user_token_balances.tenant_id IS '테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN user_token_balances.allocated_tokens IS '테넌트로부터 할당받은 토큰 수량';
COMMENT ON COLUMN user_token_balances.used_tokens IS '사용한 토큰 수량';
COMMENT ON COLUMN user_token_balances.remaining_tokens IS '남은 토큰 수량 (allocated_tokens - used_tokens)';
COMMENT ON COLUMN user_token_balances.usage_limit_enabled IS '사용량 제한 활성화 여부';
COMMENT ON COLUMN user_token_balances.usage_limit_amount IS '사용량 제한 수량 (NULL이면 무제한)';
COMMENT ON COLUMN user_token_balances.metadata IS '잔액의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN user_token_balances.created_at IS '잔액 레코드 생성 시각';
COMMENT ON COLUMN user_token_balances.updated_at IS '잔액 정보 최종 수정 시각';

-- ============================================
-- 4. TOKEN PURCHASES (토큰 구매/충전)
-- ============================================

CREATE TABLE token_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES token_products(id) ON DELETE RESTRICT,
    purchase_type VARCHAR(50) NOT NULL CHECK (purchase_type IN ('manual', 'auto_recharge', 'subscription_bonus')),
    token_amount BIGINT NOT NULL, -- 구매한 토큰 수량
    bonus_tokens BIGINT DEFAULT 0, -- 보너스 토큰
    total_tokens BIGINT NOT NULL, -- 총 토큰 수량 (token_amount + bonus_tokens)
    price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    payment_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
    payment_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES billing_invoices(id) ON DELETE SET NULL,
    purchased_by UUID REFERENCES users(id) ON DELETE SET NULL, -- 구매한 사용자
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_token_purchases_tenant_id ON token_purchases(tenant_id);
CREATE INDEX idx_token_purchases_product_id ON token_purchases(product_id);
CREATE INDEX idx_token_purchases_payment_status ON token_purchases(payment_status);
CREATE INDEX idx_token_purchases_created_at ON token_purchases(created_at);

COMMENT ON TABLE token_purchases IS '토큰 구매/충전 내역을 관리하는 테이블';
COMMENT ON COLUMN token_purchases.id IS '구매 레코드의 고유 식별자 (UUID)';
COMMENT ON COLUMN token_purchases.tenant_id IS '구매한 테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN token_purchases.product_id IS '구매한 토큰 상품 ID (token_products 테이블 참조)';
COMMENT ON COLUMN token_purchases.purchase_type IS '구매 타입: manual(수동), auto_recharge(자동 충전), subscription_bonus(구독 보너스)';
COMMENT ON COLUMN token_purchases.token_amount IS '구매한 토큰 수량';
COMMENT ON COLUMN token_purchases.bonus_tokens IS '보너스로 제공된 토큰 수량';
COMMENT ON COLUMN token_purchases.total_tokens IS '총 토큰 수량 (token_amount + bonus_tokens)';
COMMENT ON COLUMN token_purchases.price IS '구매 가격';
COMMENT ON COLUMN token_purchases.currency IS '통화 코드';
COMMENT ON COLUMN token_purchases.payment_status IS '결제 상태: pending(대기), completed(완료), failed(실패), refunded(환불)';
COMMENT ON COLUMN token_purchases.payment_transaction_id IS '결제 거래 ID (payment_transactions 테이블 참조)';
COMMENT ON COLUMN token_purchases.invoice_id IS '청구서 ID (billing_invoices 테이블 참조)';
COMMENT ON COLUMN token_purchases.purchased_by IS '구매한 사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN token_purchases.metadata IS '구매의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN token_purchases.created_at IS '구매 생성 시각';
COMMENT ON COLUMN token_purchases.completed_at IS '구매 완료 시각';

-- ============================================
-- 5. TOKEN USAGE LOGS (토큰 사용 로그)
-- ============================================

CREATE TABLE token_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL이면 테넌트 레벨 사용
    service_id UUID REFERENCES services(id) ON DELETE SET NULL, -- 사용한 서비스
    service_name VARCHAR(100), -- 서비스 이름 (캐시)
    feature_name VARCHAR(100) NOT NULL, -- 사용한 기능 (예: ai_search, api_call, image_generation)
    token_amount BIGINT NOT NULL, -- 사용한 토큰 수량
    usage_type VARCHAR(50) NOT NULL CHECK (usage_type IN ('prepaid', 'postpaid')), -- 사용 타입
    request_id VARCHAR(255), -- 요청 ID (추적용)
    request_data JSONB, -- 요청 데이터
    response_data JSONB, -- 응답 데이터
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_token_usage_logs_tenant_id ON token_usage_logs(tenant_id);
CREATE INDEX idx_token_usage_logs_user_id ON token_usage_logs(user_id);
CREATE INDEX idx_token_usage_logs_service_id ON token_usage_logs(service_id);
CREATE INDEX idx_token_usage_logs_feature_name ON token_usage_logs(feature_name);
CREATE INDEX idx_token_usage_logs_created_at ON token_usage_logs(created_at);
CREATE INDEX idx_token_usage_logs_tenant_date ON token_usage_logs(tenant_id, created_at DESC);

COMMENT ON TABLE token_usage_logs IS '토큰 사용 로그를 관리하는 테이블. 모든 토큰 사용 내역을 기록합니다.';
COMMENT ON COLUMN token_usage_logs.id IS '사용 로그의 고유 식별자 (UUID)';
COMMENT ON COLUMN token_usage_logs.tenant_id IS '사용한 테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN token_usage_logs.user_id IS '사용한 사용자 ID (users 테이블 참조, NULL이면 테넌트 레벨 사용)';
COMMENT ON COLUMN token_usage_logs.service_id IS '사용한 서비스 ID (services 테이블 참조)';
COMMENT ON COLUMN token_usage_logs.service_name IS '서비스 이름 (캐시, 조회 성능 향상)';
COMMENT ON COLUMN token_usage_logs.feature_name IS '사용한 기능 이름 (예: ai_search, api_call, image_generation, text_analysis)';
COMMENT ON COLUMN token_usage_logs.token_amount IS '사용한 토큰 수량';
COMMENT ON COLUMN token_usage_logs.usage_type IS '사용 타입: prepaid(선불), postpaid(후불)';
COMMENT ON COLUMN token_usage_logs.request_id IS '요청 ID (요청 추적용)';
COMMENT ON COLUMN token_usage_logs.request_data IS '요청 데이터 (JSON 형식)';
COMMENT ON COLUMN token_usage_logs.response_data IS '응답 데이터 (JSON 형식)';
COMMENT ON COLUMN token_usage_logs.ip_address IS '요청 IP 주소';
COMMENT ON COLUMN token_usage_logs.user_agent IS '요청 User-Agent';
COMMENT ON COLUMN token_usage_logs.metadata IS '사용 로그의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN token_usage_logs.created_at IS '사용 시각';

-- ============================================
-- 6. TOKEN USAGE QUOTAS (토큰 사용 할당량)
-- ============================================

CREATE TABLE token_usage_quotas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL이면 테넌트 레벨 할당량
    service_id UUID REFERENCES services(id) ON DELETE CASCADE, -- NULL이면 전체 서비스
    feature_name VARCHAR(100), -- NULL이면 전체 기능
    quota_type VARCHAR(50) NOT NULL CHECK (quota_type IN ('daily', 'weekly', 'monthly', 'total')),
    quota_limit BIGINT NOT NULL, -- 할당량 제한
    current_usage BIGINT DEFAULT 0, -- 현재 사용량
    period_start TIMESTAMP WITH TIME ZONE NOT NULL, -- 할당량 기간 시작
    period_end TIMESTAMP WITH TIME ZONE NOT NULL, -- 할당량 기간 종료
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_token_usage_quotas_tenant_id ON token_usage_quotas(tenant_id);
CREATE INDEX idx_token_usage_quotas_user_id ON token_usage_quotas(user_id);
CREATE INDEX idx_token_usage_quotas_service_id ON token_usage_quotas(service_id);
CREATE INDEX idx_token_usage_quotas_period ON token_usage_quotas(tenant_id, period_start, period_end);
CREATE INDEX idx_token_usage_quotas_is_active ON token_usage_quotas(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE token_usage_quotas IS '토큰 사용 할당량을 관리하는 테이블. 테넌트/사용자별로 기간별 사용량 제한을 설정할 수 있습니다.';
COMMENT ON COLUMN token_usage_quotas.id IS '할당량 레코드의 고유 식별자 (UUID)';
COMMENT ON COLUMN token_usage_quotas.tenant_id IS '할당량이 적용되는 테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN token_usage_quotas.user_id IS '할당량이 적용되는 사용자 ID (users 테이블 참조, NULL이면 테넌트 레벨)';
COMMENT ON COLUMN token_usage_quotas.service_id IS '할당량이 적용되는 서비스 ID (services 테이블 참조, NULL이면 전체 서비스)';
COMMENT ON COLUMN token_usage_quotas.feature_name IS '할당량이 적용되는 기능 이름 (NULL이면 전체 기능)';
COMMENT ON COLUMN token_usage_quotas.quota_type IS '할당량 타입: daily(일별), weekly(주별), monthly(월별), total(전체)';
COMMENT ON COLUMN token_usage_quotas.quota_limit IS '할당량 제한 수량';
COMMENT ON COLUMN token_usage_quotas.current_usage IS '현재 사용량';
COMMENT ON COLUMN token_usage_quotas.period_start IS '할당량 기간 시작 시각';
COMMENT ON COLUMN token_usage_quotas.period_end IS '할당량 기간 종료 시각';
COMMENT ON COLUMN token_usage_quotas.is_active IS '할당량 활성화 여부';
COMMENT ON COLUMN token_usage_quotas.metadata IS '할당량의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN token_usage_quotas.created_at IS '할당량 생성 시각';
COMMENT ON COLUMN token_usage_quotas.updated_at IS '할당량 정보 최종 수정 시각';

-- ============================================
-- 7. TOKEN ALLOCATIONS (토큰 할당)
-- ============================================

CREATE TABLE token_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    allocated_by UUID REFERENCES users(id) ON DELETE SET NULL, -- 할당한 사용자
    token_amount BIGINT NOT NULL, -- 할당한 토큰 수량
    allocation_type VARCHAR(50) NOT NULL CHECK (allocation_type IN ('manual', 'auto', 'subscription')),
    reason TEXT, -- 할당 사유
    expires_at TIMESTAMP WITH TIME ZONE, -- 할당 만료 시각 (NULL이면 만료되지 않음)
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_token_allocations_tenant_id ON token_allocations(tenant_id);
CREATE INDEX idx_token_allocations_user_id ON token_allocations(user_id);
CREATE INDEX idx_token_allocations_expires_at ON token_allocations(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE token_allocations IS '사용자에게 토큰을 할당한 내역을 관리하는 테이블';
COMMENT ON COLUMN token_allocations.id IS '할당 레코드의 고유 식별자 (UUID)';
COMMENT ON COLUMN token_allocations.tenant_id IS '할당한 테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN token_allocations.user_id IS '할당받은 사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN token_allocations.allocated_by IS '할당한 사용자 ID (users 테이블 참조)';
COMMENT ON COLUMN token_allocations.token_amount IS '할당한 토큰 수량';
COMMENT ON COLUMN token_allocations.allocation_type IS '할당 타입: manual(수동), auto(자동), subscription(구독)';
COMMENT ON COLUMN token_allocations.reason IS '할당 사유';
COMMENT ON COLUMN token_allocations.expires_at IS '할당 만료 시각 (NULL이면 만료되지 않음)';
COMMENT ON COLUMN token_allocations.metadata IS '할당의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN token_allocations.created_at IS '할당 시각';

-- ============================================
-- 8. POSTPAID BILLING CYCLES (후불 청구 주기)
-- ============================================

CREATE TABLE postpaid_billing_cycles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    cycle_start TIMESTAMP WITH TIME ZONE NOT NULL, -- 청구 주기 시작
    cycle_end TIMESTAMP WITH TIME ZONE NOT NULL, -- 청구 주기 종료
    total_usage BIGINT DEFAULT 0, -- 총 사용량
    included_tokens BIGINT DEFAULT 0, -- 포함된 토큰 (구독 플랜에 포함된 경우)
    overage_tokens BIGINT DEFAULT 0, -- 초과 사용량 (included_tokens 초과)
    overage_rate DECIMAL(10, 6) NOT NULL, -- 초과 사용 단가 (토큰당 가격)
    total_charge DECIMAL(10, 2) DEFAULT 0, -- 총 청구 금액
    currency VARCHAR(3) DEFAULT 'USD',
    invoice_id UUID REFERENCES billing_invoices(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'billed', 'paid', 'void')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_postpaid_billing_cycles_tenant_id ON postpaid_billing_cycles(tenant_id);
CREATE INDEX idx_postpaid_billing_cycles_cycle ON postpaid_billing_cycles(tenant_id, cycle_start, cycle_end);
CREATE INDEX idx_postpaid_billing_cycles_status ON postpaid_billing_cycles(status);

COMMENT ON TABLE postpaid_billing_cycles IS '후불 청구 주기를 관리하는 테이블. 월별/주기별로 토큰 사용량을 집계하여 청구합니다.';
COMMENT ON COLUMN postpaid_billing_cycles.id IS '청구 주기의 고유 식별자 (UUID)';
COMMENT ON COLUMN postpaid_billing_cycles.tenant_id IS '청구 주기가 속한 테넌트 ID (tenants 테이블 참조)';
COMMENT ON COLUMN postpaid_billing_cycles.cycle_start IS '청구 주기 시작 시각';
COMMENT ON COLUMN postpaid_billing_cycles.cycle_end IS '청구 주기 종료 시각';
COMMENT ON COLUMN postpaid_billing_cycles.total_usage IS '총 토큰 사용량';
COMMENT ON COLUMN postpaid_billing_cycles.included_tokens IS '포함된 토큰 수량 (구독 플랜에 포함된 경우)';
COMMENT ON COLUMN postpaid_billing_cycles.overage_tokens IS '초과 사용량 (included_tokens를 초과한 부분)';
COMMENT ON COLUMN postpaid_billing_cycles.overage_rate IS '초과 사용 단가 (토큰당 가격)';
COMMENT ON COLUMN postpaid_billing_cycles.total_charge IS '총 청구 금액';
COMMENT ON COLUMN postpaid_billing_cycles.currency IS '통화 코드';
COMMENT ON COLUMN postpaid_billing_cycles.invoice_id IS '생성된 청구서 ID (billing_invoices 테이블 참조)';
COMMENT ON COLUMN postpaid_billing_cycles.status IS '청구 주기 상태: open(진행중), billed(청구됨), paid(결제완료), void(무효)';
COMMENT ON COLUMN postpaid_billing_cycles.metadata IS '청구 주기의 추가 메타데이터 (JSON 형식)';
COMMENT ON COLUMN postpaid_billing_cycles.created_at IS '청구 주기 생성 시각';
COMMENT ON COLUMN postpaid_billing_cycles.updated_at IS '청구 주기 정보 최종 수정 시각';

-- ============================================
-- 9. TRIGGERS FOR UPDATED_AT
-- ============================================

-- Reuse the function from main schema if it exists, otherwise create it
DO $$ 
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
END $$;

CREATE TRIGGER update_token_products_updated_at BEFORE UPDATE ON token_products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_token_balances_updated_at BEFORE UPDATE ON tenant_token_balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_token_balances_updated_at BEFORE UPDATE ON user_token_balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_token_usage_quotas_updated_at BEFORE UPDATE ON token_usage_quotas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_postpaid_billing_cycles_updated_at BEFORE UPDATE ON postpaid_billing_cycles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 10. FUNCTIONS FOR TOKEN BALANCE UPDATES
-- ============================================

-- Function to update tenant prepaid balance when purchase is completed
CREATE OR REPLACE FUNCTION update_tenant_prepaid_balance()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.payment_status = 'completed' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'completed') THEN
        UPDATE tenant_token_balances
        SET prepaid_balance = prepaid_balance + NEW.total_tokens
        WHERE tenant_id = NEW.tenant_id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

COMMENT ON FUNCTION update_tenant_prepaid_balance() IS '토큰 구매 완료 시 테넌트 선불 잔액을 자동으로 업데이트하는 트리거 함수';

CREATE TRIGGER trigger_update_tenant_prepaid_balance
    AFTER INSERT OR UPDATE ON token_purchases
    FOR EACH ROW EXECUTE FUNCTION update_tenant_prepaid_balance();

-- Function to update user token balance when allocation is created
CREATE OR REPLACE FUNCTION update_user_token_balance_on_allocation()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_token_balances (user_id, tenant_id, allocated_tokens, remaining_tokens)
    VALUES (NEW.user_id, NEW.tenant_id, NEW.token_amount, NEW.token_amount)
    ON CONFLICT (user_id, tenant_id) 
    DO UPDATE SET 
        allocated_tokens = user_token_balances.allocated_tokens + NEW.token_amount,
        remaining_tokens = user_token_balances.remaining_tokens + NEW.token_amount;
    RETURN NEW;
END;
$$ language 'plpgsql';

COMMENT ON FUNCTION update_user_token_balance_on_allocation() IS '토큰 할당 시 사용자 토큰 잔액을 자동으로 업데이트하는 트리거 함수';

CREATE TRIGGER trigger_update_user_token_balance_on_allocation
    AFTER INSERT ON token_allocations
    FOR EACH ROW EXECUTE FUNCTION update_user_token_balance_on_allocation();

-- Function to update balances when token is used
CREATE OR REPLACE FUNCTION update_token_balances_on_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.usage_type = 'prepaid' THEN
        -- Update tenant prepaid balance
        UPDATE tenant_token_balances
        SET prepaid_balance = GREATEST(prepaid_balance - NEW.token_amount, 0)
        WHERE tenant_id = NEW.tenant_id;
        
        -- Update user balance if user_id is provided
        IF NEW.user_id IS NOT NULL THEN
            UPDATE user_token_balances
            SET used_tokens = used_tokens + NEW.token_amount,
                remaining_tokens = GREATEST(remaining_tokens - NEW.token_amount, 0)
            WHERE user_id = NEW.user_id AND tenant_id = NEW.tenant_id;
        END IF;
    ELSIF NEW.usage_type = 'postpaid' THEN
        -- Update tenant postpaid usage
        UPDATE tenant_token_balances
        SET current_usage = current_usage + NEW.token_amount
        WHERE tenant_id = NEW.tenant_id;
        
        -- Update postpaid billing cycle if exists
        UPDATE postpaid_billing_cycles
        SET total_usage = total_usage + NEW.token_amount,
            overage_tokens = GREATEST(total_usage - included_tokens, 0)
        WHERE tenant_id = NEW.tenant_id
        AND status = 'open'
        AND NEW.created_at >= cycle_start
        AND NEW.created_at <= cycle_end;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

COMMENT ON FUNCTION update_token_balances_on_usage() IS '토큰 사용 시 잔액을 자동으로 업데이트하는 트리거 함수';

CREATE TRIGGER trigger_update_token_balances_on_usage
    AFTER INSERT ON token_usage_logs
    FOR EACH ROW EXECUTE FUNCTION update_token_balances_on_usage();

-- ============================================
-- 11. INITIAL DATA - DEFAULT TOKEN PRODUCTS
-- ============================================

-- Default token products
INSERT INTO token_products (name, slug, description, token_amount, price, bonus_tokens) VALUES
    ('기본 패키지', 'basic-pack', '기본 토큰 패키지', 10000, 9.99, 0),
    ('스탠다드 패키지', 'standard-pack', '스탠다드 토큰 패키지', 50000, 39.99, 5000),
    ('프리미엄 패키지', 'premium-pack', '프리미엄 토큰 패키지', 100000, 69.99, 15000),
    ('엔터프라이즈 패키지', 'enterprise-pack', '엔터프라이즈 토큰 패키지', 500000, 299.99, 100000)
ON CONFLICT (slug) DO NOTHING;

