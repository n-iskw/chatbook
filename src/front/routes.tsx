import { createHashRouter, Navigate } from "react-router";
import { HomePage } from "./pages/HomePage";

export const router = createHashRouter([
  { path: "/", element: <Navigate to="/home" replace /> },
  { path: "/home", element: <HomePage /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);
