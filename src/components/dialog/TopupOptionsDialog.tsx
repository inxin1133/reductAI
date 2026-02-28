import { useCallback, useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { RotateCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { fetchTopupProducts, type TopupProduct } from "@/services/billingService"

type TopupOptionsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPurchase: (product: TopupProduct) => void | Promise<void>
}

export function TopupOptionsDialog({ open, onOpenChange, onPurchase }: TopupOptionsDialogProps) {
  const [topupProducts, setTopupProducts] = useState<TopupProduct[]>([])
  const [topupProductsLoading, setTopupProductsLoading] = useState(false)

  const loadTopupProducts = useCallback(async () => {
    setTopupProductsLoading(true)
    try {
      const products = await fetchTopupProducts()
      setTopupProducts(products)
    } catch (e) {
      console.error(e)
      setTopupProducts([])
    } finally {
      setTopupProductsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      void loadTopupProducts()
    }
  }, [open, loadTopupProducts])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(800px,calc(100%-48px))]">
        <DialogHeader>
          <DialogTitle>충전 옵션</DialogTitle>
        </DialogHeader>
        <div className="p-4">
          <div className="text-sm font-semibold text-foreground">
            충전 옵션 <span className="text-xs text-muted-foreground">(부가세 별도)</span>
          </div>
          {topupProductsLoading ? (
            <div className="mt-3 flex items-center justify-center py-8 text-sm text-muted-foreground">
              <RotateCw className="mr-2 h-4 w-4 animate-spin" /> 충전 상품을 불러오는 중...
            </div>
          ) : topupProducts.length === 0 ? (
            <div className="mt-3 py-6 text-center text-sm text-muted-foreground">현재 구매 가능한 충전 상품이 없습니다.</div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {topupProducts.map((product) => {
                const totalCredits = Number(product.credits)
                const unitPrice = totalCredits > 0 ? product.price_usd / totalCredits : 0
                const isBest =
                  Boolean(product.metadata && (product.metadata as Record<string, unknown>).best_seller) ||
                  (topupProducts.length >= 3 && product === topupProducts[Math.floor(topupProducts.length * 0.66)])
                return (
                  <Card
                    key={product.id}
                    className={cn("gap-1 py-0 transition-shadow hover:shadow-md", isBest && "ring-1 ring-blue-500")}
                  >
                    <CardHeader className="px-4 pt-4 pb-1">
                      <CardTitle className="text-lg font-bold text-foreground">+{totalCredits.toLocaleString()}</CardTitle>
                      <p className="text-[11px] text-muted-foreground">
                        크레딧{product.bonus_credits > 0 ? ` (보너스 +${Number(product.bonus_credits).toLocaleString()})` : ""}
                      </p>
                    </CardHeader>
                    <CardContent className="px-4 pb-2">
                      <div className="text-2xl font-extrabold text-foreground gap-1 flex items-center">
                        ${product.price_usd}
                        {isBest ? (
                          <span className="rounded-full border border-border text-regular px-1.5 py-0.5 text-[10px] text-blue-500">
                            BEST
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">1 Credit = ${unitPrice.toFixed(5)}</p>
                    </CardContent>
                    <CardFooter className="px-4 pb-4 pt-1">
                      <Button
                        variant={isBest ? "default" : "outline"}
                        size="sm"
                        className={cn("w-full text-xs", isBest && "bg-blue-500 hover:bg-blue-600 text-white")}
                        onClick={() => void onPurchase(product)}
                      >
                        구매하기
                      </Button>
                    </CardFooter>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
