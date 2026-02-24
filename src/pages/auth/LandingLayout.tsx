import { Outlet } from "react-router-dom"
import { LandingHeader } from "@/components/LandingHeader"
import { LandingFooter } from "@/components/LandingFooter"

export default function LandingLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans">
      <LandingHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <LandingFooter />
    </div>
  )
}
