// create-record — the clinical WRITE pipeline (Directives §4.5, Increment 1).
//
//   1. Verify JWT, extract sub + user_role           (auth.ts / verify_jwt gate)
//   2. Validate the payload at the boundary
//   3. Authorize via the capability matrix           (checkAccess — RBAC contract in Inc. 3)
//   4. Canonicalize (stable ordering)
//   5. AES-256-GCM encrypt sensitive fields
//   6. Insert encrypted row with a new version
//   7. SHA-256 hash the canonical record
//   8. Anchor on-chain  →  DEFERRED (Increment 2): row stays 'pending-anchor'
//   9. Audit the event
//
// Updates never overwrite: passing recordId creates a NEW version of that record.

import { preflight, ok, fail } from "../_shared/http.ts";
import { getCaller, checkAccess } from "../_shared/auth.ts";
import { adminClient } from "../_shared/db.ts";
import { audit } from "../_shared/audit.ts";
import { canonicalize, sha256Hex, encryptJson } from "../_shared/crypto.ts";
import { SPECS, canonicalRecord, pickSensitive } from "../_shared/records.ts";

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
  const spec = SPECS[recordType];
  if (!spec) return fail(400, "Unknown record type.");

  const recordId = payload.recordId ? String(payload.recordId) : null;
  const action = recordId ? "update" : "create";

  // 3. Authorize.
  if (!checkAccess(caller.role, recordType, action)) {
    const admin0 = adminClient();
    await audit(admin0, {
      userId: caller.userId, role: caller.role, action: `${action} ${recordType}`,
      objectType: recordType, objectId: recordId ?? undefined, outcome: "denied",
    });
    return fail(403, "You are not permitted to perform this action.");
  }

  const admin = adminClient();

  // 2. Validate identifiers / determine version + patient scope.
  let version = 1;
  let parentId = payload[spec.parentColumn];
  if (recordId) {
    const { data: prev, error } = await admin
      .from(spec.table)
      .select(`version, ${spec.parentColumn}`)
      .eq("id", recordId)
      .single();
    if (error || !prev) return fail(404, "Record not found.");
    version = (prev.version as number) + 1;
    parentId = (prev as Record<string, unknown>)[spec.parentColumn];
  }
  if (!parentId) return fail(400, `Missing ${spec.parentColumn}.`);

  // 4 + 5. Canonicalize sensitive fields and encrypt.
  const sensitive = pickSensitive(spec, payload);
  let encrypted;
  try {
    encrypted = await encryptJson(sensitive);
  } catch (e) {
    console.error("encrypt failed", (e as Error).message);
    return fail(500);
  }

  // 6. Insert the new (versioned) encrypted row. record_hash is computed AFTER
  //    insert, from the persisted row, so DB-defaulted columns (datetime, status,
  //    …) are included identically to what verify-integrity will re-hash.
  const row: Record<string, unknown> = {
    [spec.authorColumn]: caller.userId,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    auth_tag: encrypted.auth_tag,
    version,
    record_hash: "", // set below
    anchor_status: "pending-anchor", // 8. on-chain anchoring lands in Increment 2
  };
  for (const c of spec.clearColumns) if (payload[c] !== undefined) row[c] = payload[c];
  row[spec.parentColumn] = parentId;

  const { data: inserted, error: insErr } = await admin
    .from(spec.table)
    .insert(row)
    .select("*")
    .single();

  if (insErr || !inserted) {
    console.error("insert failed", insErr?.message);
    return fail(500);
  }

  // 7. Hash the canonical record built from the PERSISTED row (reproducible in
  //    verify-integrity), then store it.
  const identifiers: Record<string, unknown> = {};
  for (const c of spec.clearColumns) {
    if (inserted[c] !== undefined && inserted[c] !== null) identifiers[c] = inserted[c];
  }
  identifiers[spec.parentColumn] = inserted[spec.parentColumn];
  const recordHash = await sha256Hex(
    canonicalize(canonicalRecord(recordType, identifiers, inserted.version, inserted[spec.authorColumn], sensitive)),
  );
  const { error: hashErr } = await admin
    .from(spec.table)
    .update({ record_hash: recordHash })
    .eq("id", inserted.id);
  if (hashErr) {
    console.error("hash update failed", hashErr.message);
    return fail(500);
  }

  // 9. Audit.
  await audit(admin, {
    userId: caller.userId,
    role: caller.role,
    action: `${action} ${recordType}`,
    objectType: recordType,
    objectId: inserted.id,
    patientId: spec.parentColumn === "patient_id" ? (parentId as string) : null,
    outcome: "permitted",
  });

  return ok({
    id: inserted.id,
    version: inserted.version,
    recordHash,
    anchorStatus: inserted.anchor_status,
  });
});
