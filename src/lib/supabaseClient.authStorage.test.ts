import { describe, it, expect, beforeEach } from "vitest";
import { tryReadAuthAccessTokenFromStorage } from "./supabaseClient";

describe("tryReadAuthAccessTokenFromStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("devuelve access_token si hay sesión válida en sb-*-auth-token", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem(
      "sb-test-project-auth-token",
      JSON.stringify({
        access_token: "test.jwt.token",
        expires_at: exp,
        refresh_token: "r",
        token_type: "bearer",
      })
    );
    expect(tryReadAuthAccessTokenFromStorage()).toBe("test.jwt.token");
  });

  it("ignora token expirado pronto", () => {
    const exp = Math.floor(Date.now() / 1000) + 30;
    localStorage.setItem(
      "sb-x-auth-token",
      JSON.stringify({ access_token: "old", expires_at: exp })
    );
    expect(tryReadAuthAccessTokenFromStorage()).toBeNull();
  });

  it("devuelve null si no hay claves", () => {
    expect(tryReadAuthAccessTokenFromStorage()).toBeNull();
  });
});
