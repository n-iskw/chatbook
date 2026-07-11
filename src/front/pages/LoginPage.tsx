import { useState } from "react";
import useSWR from "swr";
import { signIn } from "../lib/cognitoClient";
import { fetcher } from "../lib/fetcher";

type MeResponse = { sub: string };

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);

  const { data: me } = useSWR<MeResponse>(
    accessToken ? ["/api/me", accessToken] : null,
    ([url, token]: [string, string]) =>
      fetcher<MeResponse>(url, { headers: { Authorization: `Bearer ${token}` } }),
  );

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSignInError(null);
          signIn(email, password)
            .then(setAccessToken)
            .catch((error: unknown) => {
              setSignInError(error instanceof Error ? error.message : "サインインに失敗しました");
            });
        }}
        className="flex w-64 flex-col gap-2"
      >
        <input
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border p-2"
        />
        <input
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border p-2"
        />
        <button type="submit" className="bg-black p-2 text-white">
          Sign in
        </button>
      </form>
      {signInError && <p data-testid="sign-in-error">{signInError}</p>}
      {me && <p data-testid="me-sub">Signed in as: {me.sub}</p>}
    </main>
  );
}
