import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DatabuddyProvider } from "@databuddy/sdk/react";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    {/* The front page only: the extension itself sends no analytics.
        The client ID is public; it ships in the page either way. */}
    <DatabuddyProvider
      clientId="b405381c-5f73-4136-a1ea-2f3b809a8f0c"
      autocapture={{ webVitals: true, errors: true, outgoingLinks: true }}
      replay
    />
  </StrictMode>,
);
