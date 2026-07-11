import { useEffect, useState } from "react";

type HealthStatus = "loading" | "ok" | "error";

export function HomePage() {
  const [status, setStatus] = useState<HealthStatus>("loading");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => (res.ok ? setStatus("ok") : setStatus("error")))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2">
      <h1 className="text-2xl">Hello, fullstack-worker-template</h1>
      <p data-testid="api-health-status">API status: {status}</p>
    </main>
  );
}
