import useSWR from "swr";
import { fetcher } from "../lib/fetcher";

type HealthResponse = { status: string };

export function HomePage() {
  const { data, error, isLoading } = useSWR<HealthResponse>("/api/health", fetcher);
  const status = isLoading ? "loading" : error ? "error" : (data?.status ?? "error");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2">
      <h1 className="text-2xl">Hello, fullstack-worker-template</h1>
      <p data-testid="api-health-status">API status: {status}</p>
    </main>
  );
}
