import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useNavigate } from "react-router-dom"
import { AdminPage } from "@/components/layout/AdminPage"

type Props = {
  title: string
  description?: string
  relatedTables?: string[]
  backHref?: string
}

export default function AdminComingSoonPage({
  title,
  description = "이 관리 화면은 아직 준비중입니다.",
  relatedTables,
  backHref = "/admin/dashboard",
}: Props) {
  const navigate = useNavigate()

  return (
    <AdminPage headerTitle={title}>
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="text-xl font-semibold">{title}</div>
          <div className="text-sm text-muted-foreground">{description}</div>
        </div>

        <Card className="p-4 space-y-3">
          {relatedTables?.length ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">관련 테이블</div>
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                {relatedTables.map((t) => (
                  <li key={t}>
                    <code>{t}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate(backHref)}>
              대시보드로
            </Button>
          </div>
        </Card>
      </div>
    </AdminPage>
  )
}

