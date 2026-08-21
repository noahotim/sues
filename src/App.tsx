import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import AdminLayout from "./components/AdminLayout";
import { PermissionGuard } from "./components/PermissionGuard";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ElectionsPage from "./pages/ElectionsPage";
import CandidatesPage from "./pages/CandidatesPage";
import RosterPage from "./pages/RosterPage";
import ResultsPage from "./pages/ResultsPage";
import UsersPage from "./pages/UsersPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import VotePage from "./pages/VotePage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
      </BrowserRouter>
    </AuthProvider>
  );
}
