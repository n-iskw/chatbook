import { createBrowserRouter, Navigate } from "react-router";
import { ShelfPage } from "./pages/ShelfPage";
import { AppPage } from "./pages/AppPage";
import { RequireSession } from "./components/RequireSession";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";

/**
 * Both pages carry the same boundary. A throw while rendering cannot be
 * reported as a value the way every other failure in this app is, so without
 * one the reader gets a blank document and no way back to the shelf.
 */
const errorElement = <RouteErrorBoundary />;

/**
 * The gate wraps each page rather than sitting above the router, so the address
 * a reader arrived at is still the address once they have signed in. There is
 * no `/login` route to be sent to and come back from.
 */
export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <RequireSession>
        <ShelfPage />
      </RequireSession>
    ),
    errorElement,
  },
  {
    path: "/books/:pdfId",
    element: (
      <RequireSession>
        <AppPage />
      </RequireSession>
    ),
    errorElement,
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
