import React, { useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
  Navigate,
} from "react-router-dom";

import Sidebar from "./components/Sidebar";
import Footer from "./components/Footer";
import FeedbackBlockAnnotator from "./components/FeedbackBlockAnnotator";
import FloatingFeedbackPanel from "./components/FloatingFeedbackPanel";

import Login from "./pages/Login";
import FeedbackProfile from "./pages/FeedbackProfile";
import ResumeDashboard from "./pages/ResumeDashboard";
import Dashboard from "./pages/Dashboard";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Users from "./pages/Users";

// new pages
import Projects from "./pages/Projects";
import Analytics from "./pages/Analytics";
import Predict from "./pages/Predict";
import UploadUpdate from "./pages/UploadUpdate";
import DeploymentAnalysis from "./pages/DeploymentAnalysis";
import SurveyBasedUpdates from "./pages/SurveyBasedUpdates";
import FacilityAnalysis from "./pages/FacilityAnalysis";
import PlanningAnalysis from "./pages/PlanningAnalysis";
import BenefitCostAnalysis from "./pages/BenefitCostAnalysis";
import ExpertPanelReview from "./pages/ExpertPanelReview";
import DeploymentPreSurvey from "./pages/DeploymentPreSurvey";

import { DashboardProvider } from "./context/DashboardContext";
import {
  getRole,
  hasFeedbackProfile,
  isAuthed,
} from "./utils/auth";

import "./styles/global.css";
import "./styles/responsive.css";

function ProtectedRoute({ children }) {
  if (!isAuthed() || !hasFeedbackProfile()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AdminRoute({ children }) {
  if (!isAuthed() || !hasFeedbackProfile()) {
    return <Navigate to="/login" replace />;
  }
  return getRole() === "admin" ? children : <Navigate to="/home" replace />;
}

function FeedbackProfileRoute() {
  const location = useLocation();

  if (!isAuthed()) return <Navigate to="/login" replace />;
  if (hasFeedbackProfile()) return <Navigate to="/dashboard" replace />;
  return location.state?.fromLogin
    ? <FeedbackProfile />
    : <Navigate to="/login" replace />;
}

function AppLayout({ collapsed, onToggleSidebar }) {
  const location = useLocation();
  const isLoginPage = location.pathname === "/login";
  const isFeedbackProfilePage = location.pathname === "/feedback-profile";
  const isResumePage = location.pathname === "/resume";
  const isEntryPage = isLoginPage || isFeedbackProfilePage || isResumePage;

  return (
    <div
      className={`app-container ${collapsed ? "collapsed" : ""} ${
        isEntryPage ? "login-mode" : ""
      }`}
    >
      {!isEntryPage && (
        <Sidebar collapsed={collapsed} onToggle={onToggleSidebar} />
      )}

      <div className="content">
        <Routes>
          <Route
            path="/login"
            element={
              isAuthed() && hasFeedbackProfile()
                ? <Navigate to="/dashboard" replace />
                : <Login />
            }
          />

          <Route path="/feedback-profile" element={<FeedbackProfileRoute />} />
          <Route path="/resume" element={<ResumeDashboard />} />

          <Route
            path="/"
            element={
              isAuthed() && hasFeedbackProfile() ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

          <Route
            path="/home"
            element={<Navigate to="/dashboard" replace />}
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/projects"
            element={
              <ProtectedRoute>
                <Projects />
              </ProtectedRoute>
            }
          />

          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <Analytics />
              </ProtectedRoute>
            }
          />

          <Route
            path="/predict"
            element={
              <ProtectedRoute>
                <Predict />
              </ProtectedRoute>
            }
          />

          <Route
            path="/upload"
            element={<Navigate to="/upload/files" replace />}
          />

          <Route
            path="/upload/files"
            element={
              <ProtectedRoute>
                <UploadUpdate />
              </ProtectedRoute>
            }
          />

          <Route
            path="/upload/survey-based-updates"
            element={
              <ProtectedRoute>
                <SurveyBasedUpdates />
              </ProtectedRoute>
            }
          />

          <Route
            path="/upload/expert-panel-review"
            element={
              <ProtectedRoute>
                <ExpertPanelReview />
              </ProtectedRoute>
            }
          />

          <Route
            path="/upload/its-deployment-pre-survey"
            element={
              <ProtectedRoute>
                <DeploymentPreSurvey />
              </ProtectedRoute>
            }
          />

          <Route
            path="/scorecards"
            element={<Navigate to="/scorecards/benefit-cost-analysis" replace />}
          />

          <Route
            path="/scorecards/benefit-cost-analysis"
            element={
              <ProtectedRoute>
                <BenefitCostAnalysis />
              </ProtectedRoute>
            }
          />

          <Route
            path="/scorecards/deployment-analysis"
            element={
              <ProtectedRoute>
                <DeploymentAnalysis />
              </ProtectedRoute>
            }
          />

          <Route
            path="/scorecards/legislative-analysis"
            element={
              <ProtectedRoute>
                <Reports />
              </ProtectedRoute>
            }
          />

          <Route
            path="/scorecards/planning-analysis"
            element={
              <ProtectedRoute>
                <PlanningAnalysis />
              </ProtectedRoute>
            }
          />

          <Route
            path="/scorecards/facility-analysis"
            element={
              <ProtectedRoute>
                <FacilityAnalysis />
              </ProtectedRoute>
            }
          />

          <Route
            path="/reports"
            element={<Navigate to="/scorecards/legislative-analysis" replace />}
          />

          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />

          {/* ✅ Vaulted: admin-only */}
          <Route
            path="/users"
            element={
              <AdminRoute>
                <Users />
              </AdminRoute>
            }
          />
        </Routes>

        {!isEntryPage && <Footer />}
      </div>

      {!isEntryPage && isAuthed() && hasFeedbackProfile() ? (
        <>
          <FeedbackBlockAnnotator />
          <FloatingFeedbackPanel />
        </>
      ) : null}
    </div>
  );
}

export default function App() {
  const [collapsed, setCollapsed] = useState(
    () => window.matchMedia("(max-width: 1500px)").matches
  );

  React.useEffect(() => {
    const narrowViewport = window.matchMedia("(max-width: 1500px)");
    const handleViewportChange = (event) => setCollapsed(event.matches);

    narrowViewport.addEventListener("change", handleViewportChange);
    return () => narrowViewport.removeEventListener("change", handleViewportChange);
  }, []);

  const toggleSidebar = () => setCollapsed((c) => !c);

  return (
    <DashboardProvider>
      <Router>
        <AppLayout collapsed={collapsed} onToggleSidebar={toggleSidebar} />
      </Router>
    </DashboardProvider>
  );
}
