// auth.ts — verify the caller's Supabase JWT and extract identity + role.
//
// The functions are deployed with verify_jwt = true, so the platform already
// rejects missing/invalid tokens at the gateway. We still decode the token here
// to read `sub` (user id) and the `user_role` claim injected by the custom
// access-token hook — the same claim RLS reads.

export interface Caller {
  userId: string;
  role: string | null;
  jwt: string;
}

/** Pull and decode the bearer token. Throws if absent/malformed. */
export function getCaller(req: Request): Caller {
  const header = req.headers.get("Authorization") ?? "";
  const jwt = header.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) throw new Error("missing bearer token");

  const claims = decodeJwt(jwt);
  const userId = claims.sub as string | undefined;
  if (!userId) throw new Error("token has no sub");

  const role =
    (claims.user_role as string | undefined) ??
    (claims.role as string | undefined) ??
    null;

  return { userId, role, jwt };
}

function decodeJwt(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1];
  if (!part) throw new Error("malformed jwt");
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const json = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="));
  return JSON.parse(json) as Record<string, unknown>;
}

/**
 * Authorize an action for a role against the static capability matrix (SRS §5).
 * This is the DB-side mirror of guard.js; the AUTHORITATIVE check becomes the
 * on-chain RBAC contract in Increment 3 (RBAC.checkAccess). Until then this
 * table is the policy gate inside the privileged backend.
 */
const MATRIX: Record<string, Record<string, string[]>> = {
  encounter:    { create: ["DOCTOR"], read: ["DOCTOR", "NURSE", "PATIENT"], update: ["DOCTOR"], verify: ["DOCTOR", "NURSE", "PATIENT"] },
  vitals:       { create: ["NURSE"], read: ["DOCTOR", "NURSE", "PATIENT"], update: ["NURSE"], verify: ["DOCTOR", "NURSE", "PATIENT"] },
  lab_result:   { create: ["LAB_TECHNICIAN"], read: ["DOCTOR", "NURSE", "LAB_TECHNICIAN", "PATIENT"], update: ["LAB_TECHNICIAN"], verify: ["DOCTOR", "NURSE", "LAB_TECHNICIAN", "PATIENT"] },
  prescription: { create: ["DOCTOR"], read: ["DOCTOR", "NURSE", "PATIENT"], update: ["DOCTOR"], verify: ["DOCTOR", "NURSE", "PATIENT"] },
};

export function checkAccess(role: string | null, recordType: string, action: string): boolean {
  if (!role) return false;
  return MATRIX[recordType]?.[action]?.includes(role) ?? false;
}

/** Tables + the encrypted-field shape per record type. */
export const RECORD_TABLE: Record<string, string> = {
  encounter: "encounters",
  vitals: "vitals",
  lab_result: "lab_results",
  prescription: "prescriptions",
};
