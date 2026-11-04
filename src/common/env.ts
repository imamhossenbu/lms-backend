/**
 * Startup checks for required configuration. Fails fast with a clear message instead of booting with
 * an empty JWT secret (anyone could forge tokens) or no database.
 */
const REQUIRED = ["DATABASE_URL", "SUPER_SECRET_KEY"] as const;

export function assertRequiredEnv(env: NodeJS.ProcessEnv = process.env): void {
  const missing = REQUIRED.filter((key) => !env[key]?.trim());
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}. Set them in .env before starting the API.`);
  }
  if (env.SUPER_SECRET_KEY!.length < 32) {
    console.warn("⚠️  SUPER_SECRET_KEY is shorter than 32 characters — use a long random secret in production.");
  }
}

/** Value of a required secret (only call after assertRequiredEnv). */
export const jwtSecret = (): string => {
  const secret = process.env.SUPER_SECRET_KEY;
  if (!secret) throw new Error("SUPER_SECRET_KEY is not set");
  return secret;
};

/** Comma-separated env list → trimmed, non-empty entries. */
export const envList = (value: string | undefined): string[] => (value ?? "").split(",").map((v) => v.trim()).filter(Boolean);
