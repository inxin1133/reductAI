import { Outlet, createBrowserRouter, RouterProvider, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Intro from "./pages/auth/Intro";
import FrontAI from "./pages/aiagent/FrontAI";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import LanguageManager from "./pages/admin/i18n/LanguageManager";

import UserManager from "./pages/admin/users/UserManager";
import RoleManager from "./pages/admin/users/RoleManager";
import TenantManager from "./pages/admin/tenants/TenantManager";

// Dynamic title per section (User/Admin) - 동적으로 섹션별 타이틀 설정
function TitleLayout() {
  const location = useLocation();

  useEffect(() => {
    const isAdmin = location.pathname.startsWith("/admin");
    document.title = isAdmin ? "Reduct Admin" : "Reduct AI Agent";
  }, [location.pathname]);

  return <Outlet />;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <TitleLayout />,
    children: [
      {
        path: "/",
        element: <Intro />,
      },
      {
        path: "/front-ai",
        element: <FrontAI />,
      },
      {
        path: "/admin/login",
        element: <AdminLogin />,
      },
      {
        path: "/admin",
        element: <AdminLayout />,
        children: [
          {
            path: "/admin/dashboard",
            element: <AdminDashboard />,
          },
          {
            path: "i18n/languages",
            element: <LanguageManager />,
          },
          {
            path: "users",
            element: <UserManager />,
          },
          {
            path: "tenants",
            element: <TenantManager />,
          },
          {
            path: "roles",
            element: <RoleManager />,
          },
        ],
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
