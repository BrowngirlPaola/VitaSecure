// verify-integrity — re-hash a stored record and compare (Directives §4.6.3).
//
// Increment 1: the on-chain anchor does not exist yet, so we recompute the
// canonical hash from the (decrypted) stored row and compare it to the
// record_hash persisted at write time. This detects any tampering with the
// stored ciphertext or fields. In Increment 2 the comparison target becomes the
// hash anchored on-chain (IntegrityAnchor) — the function contract stays the
// same: it returns VERIFIED or TAMPERED.
//
// This path produces the tamper-detection-rate + hash-verification-time metrics.

import { preflight, ok, fail } from "../_shared/http.ts";
import { getCaller, checkAccess } from "../_shared/auth.ts";
import { adminClient } from "../_shared/db.ts";
import { audit } from "../_shared/audit.ts";
import { canonicalize, sha256Hex, decryptJson } from "../_shared/crypto.ts";
import { SPECS, canonicalRecord } from "../_shared/records.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  let caller;
  try {
    caller = getCaller(req);
  } catch {
    return fail(401, "Not authenticated.");
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return fail(400, "Invalid request body.");
  }

  const recordType = String(payload.recordType ?? "");
  const recordId = payload.recordId ? String(payload.recordId) : "";
  const spec = SPECS[recordType];
  if (!spec || !recordId) return fail(400, "Unknown record type or id.");

  const admin = adminClient();

  if (!checkAccess(caller.role, recordType, "verify")) {
    return fail(403, "You are not permitted to verify this record.");
  }

  const started = performance.now();

  const { data: row, error } = await admin
    .from(spec.table)
    .select("*")
    .eq("id", recordId)
    .single();
  if (error || !row) return fail(404, "Record not found.");

  let fields: Record<string, unknown>;
  try {
    fields = await decryptJson({ ciphertext: row.ciphertext, iv: row.iv, auth_tag: row.auth_tag });
  } catch {
    // Undecryptable ciphertext is itself a tamper signal.
    await recordOutcome(admin, caller, recordType, recordId, "TAMPERED");
    return ok({ status: "TAMPERED", recordId, ms: Math.round(performance.now() - started) });
  }

  const identifiers: Record<string, unknown> = {};
  for (const c of spec.clearColumns) if (row[c] !== undefined && row[c] !== null) identifiers[c] = row[c];
  identifiers[spec.parentColumn] = row[spec.parentColumn];

  const recomputed = await sha256Hex(
    canonicalize(canonicalRecord(recordType, identifiers, row.version, row[spec.authorColumn], fields)),
  );

  const status = recomputed === row.record_hash ? "VERIFIED" : "TAMPERED";
  await recordOutcome(admin, caller, recordType, recordId, status);

  return ok({
    status,
    recordId,
    version: row.version,
    anchorStatus: row.anchor_status,
    ms: Math.round(performance.now() - started),
  });
});

async function recordOutcome(
  admin: ReturnType<typeof adminClient>,
  caller: { userId: string; role: string | null },
  recordType: string,
  recordId: string,
  status: string,
) {
  await audit(admin, {
    userId: caller.userId,
    role: caller.role,
    action: `verify ${recordType} → ${status}`,
    objectType: recordType,
    objectId: recordId,
    outcome: "permitted",
  });
}
