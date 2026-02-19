import { useCallback, useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Header } from "@/components/Header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { hasBillingCard, hasBillingInfo, readBillingInfo, writeBillingInfo } from "@/lib/billingFlow"

type LocationState = {
  planId?: string
  planName?: string
  billingCycle?: "monthly" | "yearly"
  allowEdit?: boolean
}

type BillingFormState = {
  name: string
  email: string
  postalCode: string
  address1: string
  address2: string
  extraAddress: string
  phone: string
}

const INITIAL_BILLING_FORM: BillingFormState = {
  name: "",
  email: "",
  postalCode: "",
  address1: "",
  address2: "",
  extraAddress: "",
  phone: "",
}

const DAUM_POSTCODE_SCRIPT_ID = "daum-postcode-script"

export default function BillingInfo() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state || {}) as LocationState
  const selectedPlanName = typeof state.planName === "string" ? state.planName : null
  const allowEdit = Boolean(state.allowEdit)

  const [billingForm, setBillingForm] = useState<BillingFormState>(() => readBillingInfo() ?? INITIAL_BILLING_FORM)
  const [postcodeLoading, setPostcodeLoading] = useState(false)
  const detailAddressRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (allowEdit) return
    if (!hasBillingCard()) {
      navigate("/billing/card", { replace: true })
      return
    }
    if (hasBillingCard() && hasBillingInfo()) {
      navigate("/billing/confirm", { replace: true })
    }
  }, [allowEdit, navigate])

  const loadDaumPostcode = useCallback(() => {
    if (typeof window === "undefined") return Promise.reject(new Error("no-window"))
    if ((window as Window & { daum?: { Postcode?: unknown } }).daum?.Postcode) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve, reject) => {
      const existing = document.getElementById(DAUM_POSTCODE_SCRIPT_ID) as HTMLScriptElement | null
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true })
        existing.addEventListener("error", () => reject(new Error("postcode-load-failed")), { once: true })
        return
      }
      const script = document.createElement("script")
      script.id = DAUM_POSTCODE_SCRIPT_ID
      script.async = true
      script.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"
      script.onload = () => resolve()
      script.onerror = () => reject(new Error("postcode-load-failed"))
      document.body.appendChild(script)
    })
  }, [])

  const handleSearchPostcode = useCallback(async () => {
    if (postcodeLoading) return
    setPostcodeLoading(true)
    try {
      await loadDaumPostcode()
      const PostcodeCtor = (window as Window & { daum?: { Postcode?: new (args: unknown) => { open: () => void } } }).daum
        ?.Postcode
      if (!PostcodeCtor) return
      new PostcodeCtor({
        oncomplete: (data: {
          zonecode?: string
          roadAddress?: string
          jibunAddress?: string
          userSelectedType?: "R" | "J"
          bname?: string
          buildingName?: string
          apartment?: "Y" | "N"
        }) => {
          const address =
            data.userSelectedType === "R" ? data.roadAddress || "" : data.jibunAddress || ""
          let extra = ""
          if (data.userSelectedType === "R") {
            if (data.bname && /[동|로|가]$/g.test(data.bname)) extra += data.bname
            if (data.buildingName && data.apartment === "Y") {
              extra += extra ? `, ${data.buildingName}` : data.buildingName
            }
            if (extra) extra = `(${extra})`
          }
          setBillingForm((prev) => ({
            ...prev,
            postalCode: data.zonecode || "",
            address1: address,
            extraAddress: extra,
          }))
          window.setTimeout(() => detailAddressRef.current?.focus(), 0)
        },
      }).open()
    } finally {
      setPostcodeLoading(false)
    }
  }, [loadDaumPostcode, postcodeLoading])

  const handleNext = () => {
    writeBillingInfo(billingForm)
    navigate("/billing/confirm", {
      state: {
        planId: state.planId,
        planName: state.planName,
        billingCycle: state.billingCycle,
      },
    })
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <Header />
      <main className="px-6 py-10">
        <div className="mx-auto flex w-full max-w-[700px] flex-col gap-5">
          <div className="text-center flex flex-col gap-3">
            <h1 className="text-xl font-bold text-foreground">청구 정보 작성</h1>
            {selectedPlanName ? (
              <p className="text-base text-muted-foreground">
                선택한 요금제: <span className="font-semibold text-foreground">{selectedPlanName}</span>
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
            <div className="grid gap-4 text-sm">
              <div className="grid gap-2">
                <Label>이름(회사명)</Label>
                <Input
                  value={billingForm.name}
                  onChange={(e) => setBillingForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="예: Reduct AI"
                />
              </div>
              <div className="grid gap-2">
                <Label>이메일</Label>
                <Input
                  type="email"
                  value={billingForm.email}
                  onChange={(e) => setBillingForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="billing@reduct.ai"
                />
              </div>
              <div className="grid gap-2">
                <Label>우편번호</Label>
                <div className="flex items-center gap-2">
                  <Input value={billingForm.postalCode} readOnly placeholder="우편번호" />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={handleSearchPostcode}
                    disabled={postcodeLoading}
                  >
                    {postcodeLoading ? "검색 중..." : "주소 검색"}
                  </Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>주소</Label>
                <Input value={billingForm.address1} readOnly placeholder="도로명/지번 주소" />
              </div>
              <div className="grid gap-2">
                <Label>상세주소</Label>
                <Input
                  ref={detailAddressRef}
                  value={billingForm.address2}
                  onChange={(e) => setBillingForm((prev) => ({ ...prev, address2: e.target.value }))}
                  placeholder="상세주소 입력"
                />
              </div>
              <div className="grid gap-2">
                <Label>참고항목</Label>
                <Input value={billingForm.extraAddress} readOnly placeholder="참고항목" />
              </div>
              <div className="grid gap-2">
                <Label>전화번호</Label>
                <Input
                  value={billingForm.phone}
                  onChange={(e) => setBillingForm((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="전화번호"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              className="min-w-[120px]"
              onClick={() =>
                navigate("/billing/card", {
                  state: {
                    planId: state.planId,
                    planName: state.planName,
                    billingCycle: state.billingCycle,
                    allowEdit: true,
                  },
                })
              }
            >
              이전
            </Button>
            <Button type="button" className="min-w-[120px]" onClick={handleNext}>
              다음 단계
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
