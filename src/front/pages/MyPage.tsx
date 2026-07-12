import useSWR, { useSWRConfig } from "swr";
import { useNavigate } from "react-router";
import { fetcher } from "../lib/fetcher";
import { getCurrentSession, signOut } from "../lib/cognitoClient";

type MeResponse = { sub: string };

export function MyPage() {
  const navigate = useNavigate();
  const { mutate } = useSWRConfig();
  const { data: session } = useSWR("cognito-session", getCurrentSession);
  const { data: me } = useSWR<MeResponse>(
    session ? ["/api/me", session.accessToken] : null,
    ([url, token]: [string, string]) =>
      fetcher<MeResponse>(url, { headers: { Authorization: `Bearer ${token}` } }),
  );

  function handleSignOut() {
    signOut();
    void mutate("cognito-session", null, { revalidate: false });
    void navigate("/login");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2">
      {session && <p data-testid="my-email">{session.email}</p>}
      {me && <p data-testid="my-sub">{me.sub}</p>}
      <button type="button" onClick={handleSignOut} className="bg-black p-2 text-white">
        Sign out
      </button>
    </main>
  );
}
