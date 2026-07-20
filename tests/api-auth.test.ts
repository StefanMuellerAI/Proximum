import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  generateClientCredentials,
  hashSecret,
  signToken,
  verifyToken,
  authorizeRequest,
  type ApiTokenPayload,
} from "@/lib/api-auth";

beforeAll(() => {
  process.env.API_TOKEN_SECRET = "test-secret-nur-fuer-tests";
});
afterAll(() => {
  delete process.env.API_TOKEN_SECRET;
});

const payload = (over: Partial<ApiTokenPayload> = {}): ApiTokenPayload => ({
  clientId: "pxm_test",
  userId: "user_1",
  orgId: null,
  roles: ["read"],
  exp: Math.floor(Date.now() / 1000) + 600,
  ...over,
});

describe("OAuth-2.0-Client-Credentials (GAP-14)", () => {
  it("erzeugt eindeutige Credentials; Secret wird nur gehasht gespeichert", () => {
    const a = generateClientCredentials();
    const b = generateClientCredentials();
    expect(a.clientId).not.toBe(b.clientId);
    expect(a.clientId).toMatch(/^pxm_/);
    expect(hashSecret(a.clientSecret)).toHaveLength(64);
    expect(hashSecret(a.clientSecret)).not.toContain(a.clientSecret);
  });

  it("signiert und verifiziert Tokens (Roundtrip)", () => {
    const token = signToken(payload());
    const verified = verifyToken(token);
    expect(verified?.clientId).toBe("pxm_test");
    expect(verified?.roles).toEqual(["read"]);
  });

  it("lehnt manipulierte und abgelaufene Tokens ab", () => {
    const token = signToken(payload());
    expect(verifyToken(token + "x")).toBeNull();
    const [body] = token.split(".");
    expect(verifyToken(`${body}.falsche-signatur`)).toBeNull();
    const expired = signToken(payload({ exp: Math.floor(Date.now() / 1000) - 10 }));
    expect(verifyToken(expired)).toBeNull();
  });

  it("erzwingt Rollen (READ-Token darf nicht schreiben)", () => {
    const token = signToken(payload({ roles: ["read"] }));
    const req = new Request("https://example.com", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(authorizeRequest(req, "read")).not.toBeNull();
    expect(authorizeRequest(req, "write")).toBeNull();
  });

  it("lehnt fehlende/kaputte Authorization-Header ab", () => {
    expect(
      authorizeRequest(new Request("https://example.com"), "read"),
    ).toBeNull();
    expect(
      authorizeRequest(
        new Request("https://example.com", {
          headers: { authorization: "Basic abc" },
        }),
        "read",
      ),
    ).toBeNull();
  });
});
