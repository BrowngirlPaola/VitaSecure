// audit.ts — append-only audit trail (FR-AUD-1).
//
// Increment 1: rows are written to public.audit_log via the service role (no
// client can edit/delete them — FR-AUD-3). Increment 3 adds the on-chain anchor
// (or a periodic Merkle root) recorded in anchor_tx_id.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface AuditEntry {
  userId: string;
  role: string | null;
  action: string;
  objectType?: string;
  objectId?: string;
  patientId?: string | null;
  outcome?: "permitted" | "denied";
}

export async function audit(admin: SupabaseClient, e: AuditEntry): Promise<void> {
  const { error } = await admin.from("audit_log").insert({
    user_id: e.userId,
    role: e.role,
    action: e.action,
    object_type: e.objectType ?? null,
    object_id: e.objectId ?? null,
    patient_id: e.patientId ?? null,
    outcome: e.outcome ?? "permitted",
  });
  // Auditing must never lose the primary action silently, but also must not mask
  // it; log and continue.
  if (error) console.error("audit insert failed", error.message);
}
