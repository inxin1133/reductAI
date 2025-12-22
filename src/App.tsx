import { Outlet, createBrowserRouter, RouterProvider, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Intro from "./pages/auth/Intro";
import FrontAI from "./pages/aiagent/FrontAI";
import Timeline from "./pages/aiagent/Timeline";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import LanguageManager from "./pages/admin/i18n/LanguageManager";
import NamespaceManager from "./pages/admin/i18n/NamespaceManager";
import TranslationManager from "./pages/admin/i18n/TranslationManager";
import TranslationHistoryPage from "./pages/admin/i18n/TranslationHistory";

import UserManager from "./pages/admin/users/UserManager";
import RoleManager from "./pages/admin/users/RoleManager";
import TenantManager from "./pages/admin/tenants/TenantManager";
import Providers from "./pages/admin/ai/Providers";
import ProviderCredentials from "./pages/admin/ai/ProviderCredentials";

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
        path: "/timeline",
        element: <Timeline />,
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
            path: "i18n/namespaces",
            element: <NamespaceManager />,
          },
          {
            path: "i18n/translations",
            element: <TranslationManager />,
          },
          {
            path: "i18n/history",
            element: <TranslationHistoryPage />,
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
          {
            path: "ai/providers",
            element: <Providers />,
          },
          {
            path: "ai/credentials",
            element: <ProviderCredentials />,
          },
        ],
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
