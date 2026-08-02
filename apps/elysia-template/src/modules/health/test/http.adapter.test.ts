import { describe, expect, test } from "bun:test";
import type { DbClient } from "@repo/db";
import { healthRoutes } from "../http";

describe("health http adapter (Tier 2)", () => {
  const mockDb = {
    $client: {
      unsafe: async () => [{ ok: 1 }],
    },
  } as unknown as DbClient;

  const app = healthRoutes({ db: mockDb });

  test("returns 200 and ok status when the database is reachable", async () => {
    const response = await app.handle(new Request("http://localhost/health"));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ status: "ok", db: true });
  });

  test("returns 200 and db: false when the database is unreachable", async () => {
    const failingApp = healthRoutes({
      db: {
        $client: {
          unsafe: async () => [],
        },
      } as unknown as DbClient,
    });

    const response = await failingApp.handle(new Request("http://localhost/health"));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ status: "ok", db: false });
  });

  test("returns 404 for non-GET methods on /health", async () => {
    const response = await app.handle(
      new Request("http://localhost/health", { method: "POST" })
    );
    expect(response.status).toBe(404);
  });

  test("returns 404 for routes outside the health plugin", async () => {
    const response = await app.handle(new Request("http://localhost/unknown"));
    expect(response.status).toBe(404);
  });
});
