import crypto from "node:crypto";

export function generateOtp6(): string {
  // 000000 - 999999
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
}

export function hmacOtpHash(params: {
  secret: string;
  email: string;
  otp: string;
}): string {
  const { secret, email, otp } = params;
  // Include identifiers so a leaked hash can't be reused for other emails
  const msg = `${email.toLowerCase().trim()}:${otp}`;
  return crypto.createHmac("sha256", secret).update(msg).digest("hex");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

export function isProbablyValidEmail(email: string): boolean {
  // Not RFC-perfect; good enough for input guard.
  if (!email || email.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
