import { Outlet } from "react-router-dom"
import { AdminSidebar } from "@/components/AdminSidebar"
import { AdminHeader } from "@/components/AdminHeader"
import { AdminHeaderActionProvider } from "@/contexts/AdminHeaderActionContext"

export default function AdminLayout() { 
  return (
    <div className="bg-background flex w-full h-screen overflow-hidden">
      {/* Admin Sidebar */}
      <AdminSidebar />

      {/* Main Content Area */}
      <AdminHeaderActionProvider>
        <div className="flex flex-col flex-1 h-full min-w-0">
          {/* Admin Header */}
          <AdminHeader />

          {/* Page Content */}
          <div className="flex-1 overflow-auto p-6 pt-1 bg-background">
            <Outlet />
          </div>
        </div>
      </AdminHeaderActionProvider>
    </div>
  )
}

