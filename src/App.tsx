import { useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useSignInAnonymously } from "@convex-dev/auth/methods/anonymous/react";
import { useOauth, useSignInWithGithub } from "@convex-dev/auth/methods/github/react";
import { GithubIcon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@@/components/ui/button";
import { api } from "../convex/_generated/api";

function GuestButton() {
  const { signIn } = useSignInAnonymously(api.auth);
  return (
    <Button variant="outline" onClick={() => void signIn()}>
      Continue as guest
    </Button>
  );
}

function SignedOut() {
  const { signIn } = useSignInWithGithub(api.auth);
  const { flowError } = useOauth();
  const [startFailed, setStartFailed] = useState(false);
  return (
    <>
      <p className="text-muted-foreground">Hide ads on the sites you choose.</p>
      {(flowError !== null || startFailed) && (
        <p role="alert" className="text-destructive">
          {flowError?.error === "ACCESS_DENIED"
            ? "Sign-in was cancelled."
            : "Sign-in failed. Please try again."}
        </p>
      )}
      <Button
        onClick={async () => {
          setStartFailed(false);
          const result = await signIn();
          if (result.status === "error") {
            console.error(result.userError.cause);
            setStartFailed(true);
          }
        }}
      >
        <HugeiconsIcon icon={GithubIcon} aria-hidden />
        Continue with GitHub
      </Button>
      {import.meta.env.DEV && <GuestButton />}
    </>
  );
}

function SignedIn() {
  const { signOut } = useAuthActions();
  const user = useQuery(api.users.getCurrentUser);
  return (
    <>
      <p className="text-muted-foreground">
        Signed in as {user === undefined ? "…" : (user?.name ?? user?.login ?? "guest")}
      </p>
      <Button variant="outline" onClick={() => void signOut()}>
        Sign out
      </Button>
    </>
  );
}

export default function App() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3">
      <span className="grid size-14 place-items-center rounded-3xl bg-emerald-100 text-emerald-700">
        <HugeiconsIcon icon={SparklesIcon} size={28} aria-hidden />
      </span>
      <h1 className="font-heading text-3xl font-semibold tracking-tight">No More Ads</h1>
      {isLoading ? <p>Loading…</p> : isAuthenticated ? <SignedIn /> : <SignedOut />}
    </main>
  );
}
