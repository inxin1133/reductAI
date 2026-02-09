import { Outlet, createBrowserRouter, RouterProvider, useLocation, useNavigate } from "react-router-dom";
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
import PostEditorPage from "./pages/posts/PostEditorPage";
import PostEntryPage from "./pages/posts/PostEntryPage";
import TrashPage from "./pages/trash/Trash";
import FileAssetsPage from "./pages/files/FileAssetsPage";
import { PersonalFilesPage, SharedFilesPage } from "./pages/files/PageAttachmentsPage";

import UserManager from "./pages/admin/users/UserManager";
import RoleManager from "./pages/admin/users/RoleManager";
import TenantManager from "./pages/admin/tenants/TenantManager";
import Providers from "./pages/admin/ai/Providers";
import ProviderCredentials from "./pages/admin/ai/ProviderCredentials";
import ModelManager from "./pages/admin/ai/ModelManager";
import TenantTypeModelAccess from "./pages/admin/ai/TenantTypeModelAccess";
import ModelUsageLogs from "./pages/admin/ai/ModelUsageLogs";
import ModelRoutingRules from "./pages/admin/ai/ModelRoutingRules";
import PromptTemplates from "./pages/admin/ai/PromptTemplates";
import ResponseSchemas from "./pages/admin/ai/ResponseSchemas";
import PromptSuggestions from "./pages/admin/ai/PromptSuggestions";
import ModelApiProfiles from "./pages/admin/ai/ModelApiProfiles";
import ProviderAuthProfiles from "./pages/admin/ai/ProviderAuthProfiles";
import WebSearchSettings from "./pages/admin/ai/WebSearchSettings";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

// Dynamic title per section (User/Admin) - 동적으로 섹션별 타이틀 설정
function TitleLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const isAdmin = location.pathname.startsWith("/admin");
    document.title = isAdmin ? "Reduct Admin" : "Reduct AI Agent";
  }, [location.pathname]);

  useEffect(() => {
    const handler = (event: Event) => {
      if (location.pathname.startsWith("/timeline")) return;
      const detail = (event as CustomEvent<{ conversationId?: string }>).detail;
      toast("대화에 답변이 생성되었습니다.", {
        action: {
          label: "이동",
          onClick: () => {
            if (detail?.conversationId) {
              try {
                sessionStorage.setItem("reductai.timeline.activeConversationId.v1", detail.conversationId);
              } catch {
                // ignore
              }
            }
            navigate("/timeline");
          },
        },
      });
    };

    window.addEventListener("reductai:timeline:assistant-complete", handler as EventListener);
    return () => window.removeEventListener("reductai:timeline:assistant-complete", handler as EventListener);
  }, [location.pathname, navigate]);

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
        path: "/trash",
        element: <TrashPage />,
      },
      {
        path: "/files",
        element: <FileAssetsPage />,
      },
      {
        path: "/files/personal",
        element: <PersonalFilesPage />,
      },
      {
        path: "/files/shared",
        element: <SharedFilesPage />,
      },
      {
        path: "/posts",
        element: <PostEntryPage />,
      },
      {
        path: "/posts/:id/edit",
        element: <PostEditorPage />,
      },
      {
        path: "/posts/new/edit",
        element: <PostEditorPage />,
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
          {
            path: "ai/models",
            element: <ModelManager />,
          },
          {
            path: "ai/model-access",
            element: <TenantTypeModelAccess />,
          },
          {
            path: "ai/model-usage-logs",
            element: <ModelUsageLogs />,
          },
          {
            path: "ai/model-routing-rules",
            element: <ModelRoutingRules />,
          },
          {
            path: "ai/prompt-templates",
            element: <PromptTemplates />,
          },
          {
            path: "ai/prompt-suggestions",
            element: <PromptSuggestions />,
          },
          {
            path: "ai/response-schemas",
            element: <ResponseSchemas />,
          },
          {
            path: "ai/model-api-profiles",
            element: <ModelApiProfiles />,
          },
          {
            path: "ai/provider-auth-profiles",
            element: <ProviderAuthProfiles />,
          },
          {
            path: "ai/web-search-settings",
            element: <WebSearchSettings />,
          },
        ],
      },
    ],
  },
]);

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="top-right" />
    </>
  );
}
