export {};

declare global {
  namespace Express {
    interface Request {
      authed?: { userId: string; phone: string };
    }
  }
}
