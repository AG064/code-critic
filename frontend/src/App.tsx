import { useEffect, useState } from "react";

type ServiceState = "checking" | "ready" | "unavailable";

export function App() {
  const [serviceState, setServiceState] = useState<ServiceState>("checking");

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/health", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Health request failed");
        }
        setServiceState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setServiceState("unavailable");
      });

    return () => controller.abort();
  }, []);

  const statusText = {
    checking: "Checking",
    ready: "Ready",
    unavailable: "Unavailable"
  }[serviceState];

  return (
    <main className="shell">
      <h1>Code Critic</h1>
      <p className="intro">Review 100 to 500 lines of source code.</p>
      <div className="status-row">
        <span>Service</span>
        <output data-state={serviceState}>{statusText}</output>
      </div>
    </main>
  );
}
