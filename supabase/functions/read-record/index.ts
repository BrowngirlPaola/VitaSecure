// read-record — the clinical READ pipeline (Directives §4.6.1).
//
//   1. Verify JWT, extract sub + user_role
//   2. Authorize via the capability matrix (read)
//   3. Fetch the encrypted row (service role)
//   4. Decrypt sensitive fields SERVER-SIDE (the browser never holds the AES key)
//   5. Audit the read, return plaintext fields + metadata
//
// RLS already scopes which rows a user can see for LISTING; this endpoint is the
// only way to obtain decrypted CONTENT.

import { preflight, ok, fail } from "../_shared/http.ts";
import { getCaller, checkAccess } from "../_shared/auth.ts";
import { adminClient } from "../_shared/db.ts";
import { audit } from "../_shared/audit.ts";
import { decryptJson } from "../_shared/crypto.ts";
import { SPECS } from "../_shared/records.ts";

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

  if (!checkAccess(caller.role, recordType, "read")) {
    await audit(admin, {
      userId: caller.userId, role: caller.role, action: `read ${recordType}`,
      objectType: recordType, objectId: recordId, outcome: "denied",
    });
    return fail(403, "You are not permitted to read this record.");
  }

  const { data: row, error } = await admin
    .from(spec.table)
    .select("*")
    .eq("id", recordId)
    .single();
  if (error || !row) return fail(404, "Record not found.");

  // If the caller is a PATIENT, confirm the record belongs to them.
  if (caller.role === "PATIENT" && !(await ownsRecord(admin, spec.parentColumn, row, caller.userId))) {
    await audit(admin, {
      userId: caller.userId, role: caller.role, action: `read ${recordType}`,
      objectType: recordType, objectId: recordId, outcome: "denied",
    });
    return fail(403, "You are not permitted to read this record.");
  }

  let fields: Record<string, unknown>;
  try {
    fields = await decryptJson({ ciphertext: row.ciphertext, iv: row.iv, auth_tag: row.auth_tag });
  } catch (e) {
    console.error("decrypt failed", (e as Error).message);
    return fail(500);
  }

  await audit(admin, {
    userId: caller.userId,
    role: caller.role,
    action: `read ${recordType}`,
    objectType: recordType,
    objectId: recordId,
    patientId: spec.parentColumn === "patient_id" ? (row.patient_id as string) : null,
    outcome: "permitted",
  });

  // Return decrypted fields + non-sensitive metadata (never the ciphertext).
  const { ciphertext: _c, iv: _i, auth_tag: _t, ...meta } = row as Record<string, unknown>;
  return ok({ fields, meta });
});

async function ownsRecord(
  admin: ReturnType<typeof adminClient>,
  parentColumn: string,
  row: Record<string, unknown>,
  userId: string,
): Promise<boolean> {
  if (parentColumn === "patient_id") {
    const { data } = await admin.from("patients").select("user_id").eq("id", row.patient_id).single();
    return data?.user_id === userId;
  }
  if (parentColumn === "order_id") {
    const { data } = await admin
      .from("lab_orders")
      .select("patient_id, patients(user_id)")
      .eq("id", row.order_id)
      .single();
    // deno-lint-ignore no-explicit-any
    return (data as any)?.patients?.user_id === userId;
  }
  return false;
}
