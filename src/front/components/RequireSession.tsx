import { useState, type FormEvent, type ReactNode } from "react";
import { useSWRConfig } from "swr";
import { SESSION_KEY, useSession } from "../hooks/useSession";
import { resultFetcher } from "../lib/fetcher";
import { sessionSchema } from "../../shared/schemas/auth";

/**
 * The password box, and the app behind it.
 *
 * It stands where the app would be rather than sending the reader to a page of
 * its own. The reader's place in a book lives in the address — the page, the
 * panel, the highlight being discussed — so a redirect to `/login` would have
 * to carry that address there and put it back afterwards. Standing in place,
 * the address never moves: signing in swaps the box for the page that was
 * asked for in the first place.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const session = useSession();
  const { mutate } = useSWRConfig();

  if (session.state === "signed-in") return children;

  if (session.state === "asking") {
    return (
      <div className="flex h-dvh items-center justify-center bg-gray-50 text-gray-500">
        読み込み中...
      </div>
    );
  }

  if (session.state === "unknown") {
    return (
      <div className="flex h-dvh items-center justify-center bg-gray-50 p-6">
        <p role="alert" className="max-w-sm text-center text-red-600">
          ログイン状態を確認できませんでした: {session.reason}
        </p>
      </div>
    );
  }

  // Signing in is told to the rest of the app by re-asking the question this
  // gate is built on, rather than by a second copy of the answer kept here.
  return <LoginForm onSignedIn={() => void mutate(SESSION_KEY)} />;
}

function LoginForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setFailure(null);
    const signedIn = await resultFetcher(SESSION_KEY.replace("/session", "/login"), sessionSchema, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setSubmitting(false);

    signedIn.match(
      () => onSignedIn(),
      // The server words this one: it is the only place that knows whether the
      // refusal was the password or something else entirely.
      (error) => setFailure(error.message),
    );
  };

  return (
    <div className="flex h-dvh items-center justify-center bg-gray-50 p-6">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-lg font-bold text-gray-800">chatbook</h1>

        <label className="flex flex-col gap-1 text-sm text-gray-600">
          ユーザー名
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            // 16px keeps iOS from zooming the page when the field takes focus
            className="rounded-lg border border-gray-300 p-3 text-base text-gray-900 focus:border-blue-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-gray-600">
          パスワード
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="rounded-lg border border-gray-300 p-3 text-base text-gray-900 focus:border-blue-500 focus:outline-none"
          />
        </label>

        {failure !== null && (
          <p role="alert" className="text-sm text-red-600">
            {failure}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="h-11 rounded-lg bg-blue-600 font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "確認中..." : "ログイン"}
        </button>
      </form>
    </div>
  );
}
