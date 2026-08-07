import { createBrowserRouter } from "react-router";
import { AppPage } from "./pages/AppPage";

export const router = createBrowserRouter([
  { path: "/", element: <AppPage /> },
  { path: "*", element: <AppPage /> },
]);
