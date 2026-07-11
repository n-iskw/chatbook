import { createHashRouter, Navigate } from "react-router";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";

export const router = createHashRouter([
  { path: "/", element: <Navigate to="/home" replace /> },
  { path: "/home", element: <HomePage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);
