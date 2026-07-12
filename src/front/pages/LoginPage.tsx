import { useState } from "react";
import { useNavigate } from "react-router";
import { useSWRConfig } from "swr";
import { signIn } from "../lib/cognitoClient";

export function LoginPage() {
  const navigate = useNavigate();
  const { mutate } = useSWRConfig();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signInError, setSignInError] = useState<string | null>(null);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSignInError(null);
          signIn(email, password)
            .then((session) => {
              // RequireAuth/MyPage が同じキーで購読するセッションキャッシュを
              // 即座に最新化する。未ログイン時に一度 /mypage を訪れてキャッシュ
              // が空 (null) のまま残っていると、遷移直後に再度リダイレクトされる。
              return mutate("cognito-session", session, { revalidate: false });
            })
            .then(() => {
              void navigate("/mypage");
            })
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
    </main>
  );
}
