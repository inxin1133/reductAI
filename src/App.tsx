import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Intro from "./pages/auth/Intro";
import FrontAI from "./pages/aiagent/FrontAI";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import LanguageManager from "./pages/admin/i18n/LanguageManager";

const router = createBrowserRouter([
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
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
