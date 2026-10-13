
import { useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { Toaster } from "sonner";
import { HelmetProvider, Helmet } from "react-helmet-async";

import "./App.css";

import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import { useAuthStore } from "./store/authStore";

import Layout from "./components/Layout";
import FutureFeatures from "./components/FutureFeatures";
import { futureFeatures } from "./config/futureFeatures";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import StudentHome from "./pages/StudentHome";
import Reels from "./pages/Reels";
import PostDetail from "./pages/PostDetail";
import CreatorStorefront from "./pages/CreatorStorefront";

import Courses from "./pages/Courses";
import CourseDetail from "./pages/CourseDetail";
import Gigs from "./pages/Gigs";
import GigManager from "./pages/GigManager";
import Dashboard from "./pages/Dashboard";
import AdminDashboard from "./pages/AdminDashboard";
import CourseStudio from "./pages/CourseStudio";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Learning from "./pages/Learning";
import CRM from "./pages/CRM";
import Wallet from "./pages/Wallet";
import Billing from "./pages/Billing";
import VerifyEmail from "./pages/VerifyEmail";

const LoadingScreen = () => (
  <div className="grid min-h-screen place-items-center text-muted-foreground">
    Loading…
  </div>
);

const Protected = ({ children }) => {
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;

  return children;
};

const CreatorOnly = ({ children }) => {
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;

  if (user.role !== "creator" && user.role !== "admin") {
    return <Navigate to="/home" replace />;
  }

  return children;
};

const AdminOnly = ({ children }) => {
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;

  if (user.role !== "admin") {
    return (
      <Navigate
        to={user.role === "creator" ? "/dashboard" : "/home"}
        replace
      />
    );
  }

  return children;
};

// Shared layout remains in use for regular student and creator pages.
const Shell = ({ children }) => <Layout>{children}</Layout>;

const HomeRoute = () => (
  <Shell>
    <StudentHome />
  </Shell>
);

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />

      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route
        path="/reset-password/:token"
        element={<ResetPassword />}
      />
      <Route
        path="/verify-email/:token"
        element={<VerifyEmail />}
      />

      <Route path="/home" element={<HomeRoute />} />

      <Route
        path="/feed"
        element={
          <Shell>
            <StudentHome />
          </Shell>
        }
      />

      <Route
        path="/reels"
        element={
          <Shell>
            <Reels />
          </Shell>
        }
      />

      <Route
        path="/explore"
        element={
          <Shell>
            <FutureFeatures {...futureFeatures.explore} />
          </Shell>
        }
      />

      <Route
        path="/upload"
        element={
          <Protected>
            <Shell>
              <FutureFeatures {...futureFeatures.upload} />
            </Shell>
          </Protected>
        }
      />

      <Route
        path="/courses"
        element={
          <Shell>
            <Courses />
          </Shell>
        }
      />

      <Route
        path="/courses/:courseId"
        element={
          <Shell>
            <CourseDetail />
          </Shell>
        }
      />

      <Route
        path="/gigs"
        element={
          <Shell>
            <Gigs />
          </Shell>
        }
      />

      <Route
        path="/gigs/manage"
        element={
          <CreatorOnly>
            <Shell>
              <GigManager />
            </Shell>
          </CreatorOnly>
        }
      />

      <Route
        path="/u/:username"
        element={
          <Shell>
            <Profile />
          </Shell>
        }
      />

      <Route
        path="/c/:username"
        element={
          <Shell>
            <CreatorStorefront />
          </Shell>
        }
      />

      <Route
        path="/p/:postId"
        element={
          <Shell>
            <PostDetail />
          </Shell>
        }
      />

      <Route
        path="/leaderboard"
        element={
          <Shell>
            <FutureFeatures {...futureFeatures.leaderboard} />
          </Shell>
        }
      />

      <Route
        path="/search"
        element={
          <Shell>
            <FutureFeatures {...futureFeatures.search} />
          </Shell>
        }
      />

      <Route
        path="/learning"
        element={
          <Protected>
            <Shell>
              <Learning />
            </Shell>
          </Protected>
        }
      />

      <Route
        path="/notifications"
        element={
          <Protected>
            <Shell>
              <FutureFeatures {...futureFeatures.notifications} />
            </Shell>
          </Protected>
        }
      />

      {/* Admin dashboard intentionally has no regular sidebar layout. */}
      <Route
        path="/admin"
        element={
          <Protected>
            <AdminOnly>
              <AdminDashboard />
            </AdminOnly>
          </Protected>
        }
      />

      <Route
        path="/dashboard"
        element={
          <CreatorOnly>
            <Shell>
              <Dashboard />
            </Shell>
          </CreatorOnly>
        }
      />

      <Route
        path="/dashboard/courses"
        element={<Navigate to="/dashboard?tab=courses" replace />}
      />

      <Route
        path="/dashboard/courses/new"
        element={
          <CreatorOnly>
            <Shell>
              <CourseStudio />
            </Shell>
          </CreatorOnly>
        }
      />

      <Route
        path="/dashboard/courses/:courseId/edit"
        element={
          <CreatorOnly>
            <Shell>
              <CourseStudio />
            </Shell>
          </CreatorOnly>
        }
      />

      <Route
        path="/insights"
        element={
          <CreatorOnly>
            <Shell>
              <FutureFeatures {...futureFeatures.insights} />
            </Shell>
          </CreatorOnly>
        }
      />

      <Route
        path="/crm"
        element={
          <CreatorOnly>
            <Shell>
              <CRM />
            </Shell>
          </CreatorOnly>
        }
      />

      <Route
        path="/wallet"
        element={
          <CreatorOnly>
            <Shell>
              <Wallet />
            </Shell>
          </CreatorOnly>
        }
      />

      <Route
        path="/billing"
        element={
          <Protected>
            <Shell>
              <Billing />
            </Shell>
          </Protected>
        }
      />

      <Route
        path="/community"
        element={
          <Protected>
            <Shell>
              <FutureFeatures {...futureFeatures.community} />
            </Shell>
          </Protected>
        }
      />

      <Route
        path="/community/:groupId"
        element={
          <Protected>
            <Shell>
              <FutureFeatures {...futureFeatures.community} />
            </Shell>
          </Protected>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <HelmetProvider>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Helmet
              defaultTitle="Skiller — India's learn-to-earn network"
              titleTemplate="%s · Skiller"
            >
              <meta
                name="description"
                content="Skiller is India's learn-to-earn social network. Watch reels, take courses, post gigs, build your CRM, and earn skill tokens."
              />
              <link
                rel="canonical"
                href={
                  typeof window !== "undefined"
                    ? window.location.href
                    : "https://skiller.app"
                }
              />
              <meta property="og:site_name" content="Skiller" />
              <meta property="og:type" content="website" />
              <meta
                property="og:title"
                content="Skiller — Learn. Ship. Get paid."
              />
              <meta
                property="og:description"
                content="India's learn-to-earn social network. Reels, courses, gigs, AI recommendations, skill tokens."
              />
              <meta
                property="og:image"
                content="https://images.unsplash.com/photo-1648111320024-3a08e28d20ff?w=1200&q=80"
              />
              <meta name="twitter:card" content="summary_large_image" />
              <meta
                name="twitter:title"
                content="Skiller — Learn. Ship. Get paid."
              />
              <meta
                name="twitter:description"
                content="India's learn-to-earn social network."
              />
              <meta
                name="twitter:image"
                content="https://images.unsplash.com/photo-1648111320024-3a08e28d20ff?w=1200&q=80"
              />
              <meta name="theme-color" content="#B91C1C" />
              <meta name="robots" content="index,follow" />
            </Helmet>

            <AppRoutes />

            <Toaster position="top-center" richColors />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </HelmetProvider>
  );
}
