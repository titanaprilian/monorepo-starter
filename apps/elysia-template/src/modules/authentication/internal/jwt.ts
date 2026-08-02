import { createHmac, createHash } from "node:crypto";

const JWT_SECRET = process.env.JWT_SECRET || "default-jwt-secret-key-change-in-production";

function base64urlEncode(str: string): string {
  return Buffer.from(str).toString("base64url");
}

function base64urlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8");
}

export function signJwt(payload: object, expiresInSeconds: number = 15 * 60): string {
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload = { ...payload, exp };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(fullPayload));

  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", JWT_SECRET)
    .update(signatureInput)
    .digest("base64url");

  return `${signatureInput}.${signature}`;
}

export function verifyJwt(token: string): { sub: string; email?: string; name?: string; exp?: number } {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }
  const [encodedHeader, encodedPayload, signature] = parts;
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = createHmac("sha256", JWT_SECRET)
    .update(signatureInput)
    .digest("base64url");

  if (signature !== expectedSignature) {
    throw new Error("Invalid signature");
  }

  const payload = JSON.parse(base64urlDecode(encodedPayload));
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    throw new Error("Token expired");
  }

  return payload;
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
