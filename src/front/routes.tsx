import { createBrowserRouter, Navigate } from "react-router";
import { ShelfPage } from "./pages/ShelfPage";
import { AppPage } from "./pages/AppPage";

export const router = createBrowserRouter([
  { path: "/", element: <ShelfPage /> },
  { path: "/books/:pdfId", element: <AppPage /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);
