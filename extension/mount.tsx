import { type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import "../src/index.css";
import { authStorage } from "./authStorage";

/** Renders an extension page (popup or settings) with the backend and sign-in wired up. */
export function mount(page: ReactNode) {
  const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ConvexAuthProvider client={convex} api={api.auth} storage={authStorage}>
        {page}
      </ConvexAuthProvider>
    </StrictMode>,
  );
}
