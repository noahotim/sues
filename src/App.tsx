import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import AdminLayout from "./components/AdminLayout";
import { PermissionGuard } from "./components/PermissionGuard";
import { LoadingState } from "./components/ui";

// Code-split each page so the initial load only downloads what's needed.
const LoginPage = lazy(() => import("./pages/LoginPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ElectionsPage = lazy(() => import("./pages/ElectionsPage"));
const CandidatesPage = lazy(() => import("./pages/CandidatesPage"));
const RosterPage = lazy(() => import("./pages/RosterPage"));
const ResultsPage = lazy(() => import("./pages/ResultsPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const AuditLogsPage = lazy(() => import("./pages/AuditLogsPage"));
const VotePage = lazy(() => import("./pages/VotePage"));

function PageFallback() {
  return <LoadingState message="Loading..." />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/vote" element={<VotePage />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
              <Route
                path="dashboard"
                element={
                  <PermissionGuard permission="VIEW_DASHBOARD">
                    <DashboardPage />
                  </PermissionGuard>
                }
              />
              <Route
                path="elections"
                element={
                  <PermissionGuard permission="MANAGE_ELECTIONS">
                    <ElectionsPage />
                  </PermissionGuard>
                }
              />
              <Route
                path="candidates"
                element={
                  <PermissionGuard permission="MANAGE_CANDIDATES">
                    <CandidatesPage />
                  </PermissionGuard>
                }
              />
              <Route
                path="roster"
                element={
                  <PermissionGuard permission="MANAGE_ROSTER">
                    <RosterPage />
                  </PermissionGuard>
                }
              />
              <Route
                path="results"
                element={
                  <PermissionGuard permission="VIEW_RESULTS">
                    <ResultsPage />
                  </PermissionGuard>
                }
              />
              <Route
                path="users"
                element={
                  <PermissionGuard permission="MANAGE_USERS">
                    <UsersPage />
                  </PermissionGuard>
                }
              />
              <Route
                path="audit"
                element={
                  <PermissionGuard permission="VIEW_AUDIT_LOGS">
                    <AuditLogsPage />
                  </PermissionGuard>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
