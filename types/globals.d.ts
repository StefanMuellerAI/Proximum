export {};

declare global {
  /**
   * Custom Claims im Clerk-Session-Token.
   * Einmalige Konfiguration im Clerk-Dashboard (Sessions -> Customize session
   * token): {"role": "{{user.public_metadata.role}}"}
   * requireAdmin() in lib/auth.ts liest zuerst diesen Claim (kein
   * Backend-Roundtrip); ohne Konfiguration greift der Backend-API-Fallback.
   */
  interface CustomJwtSessionClaims {
    role?: string;
  }
}
