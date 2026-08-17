import { beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeApiRequest, classifyApiRoute } from "../api-authorization";

function request(url: string, headers?: Record<string, string>): Request {
  return new Request(url, { headers });
}

describe("API authorization boundary", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
  });

  it("keeps public read-only endpoints open", () => {
    const decision = authorizeApiRequest(request("https://remote.example/api/events/conflicts"));
    expect(decision.allowed).toBe(true);
    expect(decision.routeClass).toBe("PUBLIC_READ_ONLY");
  });

  it("rejects a remote-like request to a private Brain route", () => {
    const decision = authorizeApiRequest(request("https://remote.example/api/brain/file?path=09_AI%2Fdashboard_snapshot.json"));
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe(403);
    expect(decision.routeClass).toBe("PRIVATE_DATA_SENSITIVE");
  });

  it("allows legitimate localhost development", () => {
    const decision = authorizeApiRequest(request("http://localhost:3000/api/sentinel/connect"));
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("loopback-local");
  });

  it("allows an explicitly configured internal token", () => {
    vi.stubEnv("CAPITALIFE_LOCAL_API_TOKEN", "local-test-token");
    const decision = authorizeApiRequest(request("https://internal.example/api/investors-crm", {
      authorization: "Bearer local-test-token",
    }));
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("internal-token");
  });

  it("disables dev-only process routes in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const decision = authorizeApiRequest(request("http://localhost:3000/api/start-services"));
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe(404);
    expect(decision.routeClass).toBe("DEV_ONLY");
  });

  it("classifies broker-sensitive execution separately", () => {
    expect(classifyApiRoute("/api/monitoring/trade-execution")).toBe("BROKER_SENSITIVE");
  });
});
