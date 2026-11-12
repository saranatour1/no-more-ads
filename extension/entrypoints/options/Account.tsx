import { useState } from "react";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useSignInAnonymously } from "@convex-dev/auth/methods/anonymous/react";
import { Button } from "@@/components/ui/button";
import { browser } from "wxt/browser";
import { api } from "../../../convex/_generated/api";

function SignedOut() {
  const convex = useConvex();
  const { setSession } = useAuthActions();
  const guest = useSignInAnonymously(api.auth);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    // This runs in the settings tab, which stays open while the GitHub
    // window has focus (a popup would close and kill the flow).
    // Must be listed in AUTH_EXTENSION_ORIGINS on the Convex deployment.
    const redirectTo = browser.identity.getRedirectURL();
    try {
      const { redirect, state } = await convex.mutation(api.auth.startSignInWithGithub, {
        redirectTo,
      });
      const returned = await browser.identity.launchWebAuthFlow({
        url: redirect,
        interactive: true,
      });
      const code = new URL(returned ?? "").searchParams.get("convexAuthCode");
      if (code === null) throw new Error("No sign-in code came back");
      const result = await convex.mutation(api.auth.completeSignInWithGithub, { code, state });
      if (result.status === "error") throw new Error(result.userError.error);
      await setSession(result.tokens);
    } catch (cause) {
      console.error(cause);
      setError(`Sign-in failed. Is ${new URL(redirectTo).origin} an allowed redirect origin?`);
    }
  }

  return (
    <>
      <span>
        <Button variant="link" size="xs" className="px-0" onClick={() => void signIn()}>
          Sign in with GitHub
        </Button>
        {/* Always offered: the backend refuses guests unless AUTH_ALLOW_GUEST is on. */}
        {" or "}
        <Button variant="link" size="xs" className="px-0" onClick={() => void guest.signIn()}>
          as guest
        </Button>
      </span>
      {error !== null && (
        <p role="alert" className="mt-1 text-destructive">
          {error}
        </p>
      )}
    </>
  );
}

function SignedIn() {
  const { signOut } = useAuthActions();
  const user = useQuery(api.users.getCurrentUser);
  return (
    <span className="flex items-center justify-between">
      <span>{user === undefined ? "…" : (user?.name ?? user?.login ?? "Guest")}</span>
      <Button variant="link" size="xs" className="px-0" onClick={() => void signOut()}>
        Sign out
      </Button>
    </span>
  );
}

export default function Account() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading) return null;
  return isAuthenticated ? <SignedIn /> : <SignedOut />;
}
