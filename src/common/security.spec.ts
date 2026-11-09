import { buildCorsOptions } from "./cors";
import { assertRequiredEnv, envList } from "./env";

const fakePrisma: any = { customDomain: { findMany: async () => [{ domain: "learn.school.com" }] } };
const allowed = (opts: any, origin: string | undefined) =>
  new Promise<boolean>((resolve) => opts.origin(origin, (_err: unknown, ok: boolean) => resolve(ok)));

describe("required env", () => {
  it("fails fast without the JWT secret or database", () => {
    expect(() => assertRequiredEnv({ DATABASE_URL: "x" } as any)).toThrow("SUPER_SECRET_KEY");
    expect(() => assertRequiredEnv({ SUPER_SECRET_KEY: "s".repeat(40) } as any)).toThrow("DATABASE_URL");
    expect(() => assertRequiredEnv({ DATABASE_URL: "x", SUPER_SECRET_KEY: "s".repeat(40) } as any)).not.toThrow();
    expect(envList(" a, ,b ")).toEqual(["a", "b"]);
  });
});

describe("CORS allowlist", () => {
  const opts = buildCorsOptions(fakePrisma, { NODE_ENV: "production", FRONTEND_URL: "https://app.edupro.com/", CORS_ORIGINS: "https://console.edupro.com" } as any);

  it("allows configured origins, tenant subdomains and verified custom domains", async () => {
    expect(await allowed(opts, "https://app.edupro.com")).toBe(true);
    expect(await allowed(opts, "https://console.edupro.com")).toBe(true);
    expect(await allowed(opts, "https://dhaka-coding.edupro.com")).toBe(true);
    expect(await allowed(opts, "https://learn.school.com")).toBe(true);
    expect(await allowed(opts, undefined)).toBe(true); // server-to-server / gateway callbacks
  });

  it("rejects everything else", async () => {
    expect(await allowed(opts, "https://evil.com")).toBe(false);
    expect(await allowed(opts, "https://edupro.com.evil.com")).toBe(false);
    expect(await allowed(opts, "http://learn.school.com")).toBe(false);
    expect(await allowed(opts, "http://localhost:3000")).toBe(false); // not in production
  });

  it("allows localhost outside production", async () => {
    const dev = buildCorsOptions(fakePrisma, { NODE_ENV: "development" } as any);
    expect(await allowed(dev, "http://localhost:3000")).toBe(true);
    expect(await allowed(dev, "http://localhost:3002")).toBe(true);
  });

  it("allows the marketing website (WEBSITE_URL)", async () => {
    const prod = buildCorsOptions(fakePrisma, { NODE_ENV: "production", WEBSITE_URL: "https://edupro.com/" } as any);
    expect(await allowed(prod, "https://edupro.com")).toBe(true);
  });
});
