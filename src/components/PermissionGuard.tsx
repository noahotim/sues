import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Spinner } from "./ui";

export function PermissionGuard({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const { loading, permissions } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="text-primary-500" />
      </div>
    );
  }

  if (!permissions.includes(permission)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <>{children}</>;
}
