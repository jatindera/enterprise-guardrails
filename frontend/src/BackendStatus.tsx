import { useEffect, useState } from "react";
import { Badge } from "@fluentui/react-components";

type ConnectionStatus = "Checking" | "Connected" | "Unavailable";

export default function BackendStatus() {
  const [status, setStatus] =
    useState<ConnectionStatus>("Checking");

  useEffect(() => {
    let active = true;

    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      5000,
    );

    async function checkConnection() {
      try {
        const baseUrl = (
          import.meta.env.VITE_API_BASE_URL ??
          "http://localhost:8000"
        ).replace(/\/+$/, "");

        const response = await fetch(
          `${baseUrl}/api/health/live`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error("Health request failed");
        }

        const result: unknown = await response.json();

        const healthy =
          typeof result === "object" &&
          result !== null &&
          "status" in result &&
          result.status === "ok";

        if (active) {
          setStatus(healthy ? "Connected" : "Unavailable");
        }
      } catch {
        if (active) setStatus("Unavailable");
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void checkConnection();

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return (
    <span role="status">
      <Badge
        appearance="tint"
        color={
          status === "Connected"
            ? "success"
            : status === "Unavailable"
              ? "danger"
              : "informative"
        }
      >
        API: {status}
      </Badge>
    </span>
  );
}