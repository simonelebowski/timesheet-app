import crypto from "crypto";

type LoginCodeEntry = {
  codeHash: string;
  expiresAt: number;
  attemptsLeft: number;
};

const loginCodes = new Map<string, LoginCodeEntry>();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function createLoginCode(email: string) {
  const normalized = normalizeEmail(email);
  const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
  const codeHash = hashCode(code);
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
  loginCodes.set(normalized, {
    codeHash,
    expiresAt,
    attemptsLeft: 5,
  });
  return code;
}

export function verifyLoginCode(email: string, code: string): "ok" | "expired" | "invalid" {
  const normalized = normalizeEmail(email);
  const entry = loginCodes.get(normalized);
  if (!entry) return "invalid";

  if (Date.now() > entry.expiresAt) {
    loginCodes.delete(normalized);
    return "expired";
  }

  if (entry.attemptsLeft <= 0) {
    loginCodes.delete(normalized);
    return "invalid";
  }

  const isMatch = entry.codeHash === hashCode(code);
  if (!isMatch) {
    entry.attemptsLeft -= 1;
    loginCodes.set(normalized, entry);
    return "invalid";
  }

  // one-time use
  loginCodes.delete(normalized);
  return "ok";
}
