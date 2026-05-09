import { SignJWT, jwtVerify } from "jose";

export type JwtService = {
  signAccessToken(userId: string, email: string): Promise<string>;
  verifyAccessToken(token: string): Promise<{ userId: string; email: string }>;
};

export function createJwtService(secret: string, expiresInSec: number): JwtService {
  const key = new TextEncoder().encode(secret);
  return {
    async signAccessToken(userId: string, email: string) {
      return await new SignJWT({ email })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(userId)
        .setIssuedAt()
        .setExpirationTime(`${expiresInSec}s`)
        .sign(key);
    },
    async verifyAccessToken(token: string) {
      const { payload } = await jwtVerify(token, key);
      const sub = payload.sub;
      if (!sub) throw new Error("invalid token");
      return { userId: sub, email: String(payload.email ?? "") };
    },
  };
}
