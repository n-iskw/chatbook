export async function fetcher<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = `request to ${url} failed with status ${res.status}`;
    try {
      const body = await res.json();
      if (body.error?.message) {
        message = body.error.message;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
  return res.json();
}
