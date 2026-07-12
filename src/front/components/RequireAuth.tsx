import type { ReactNode } from "react";
import useSWR from "swr";
import { Navigate } from "react-router";
import { getCurrentSession } from "../lib/cognitoClient";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: session, isLoading } = useSWR("cognito-session", getCurrentSession);

  if (isLoading) return null;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}
