// records.ts — per record-type schema for the encrypted clinical tables.
//
// Single source of truth for: which table, which column holds the author, which
// FK ties the row to a patient/order, and which fields are SENSITIVE (encrypted)
// vs CLEAR (queryable). Both create-record and verify-integrity build the
// canonical record the SAME way here so the hash is reproducible.

export interface RecordSpec {
  table: string;
  authorColumn: string; // who created it
  parentColumn: string; // FK used for patient scoping
  clearColumns: string[]; // non-sensitive columns accepted from the payload
  sensitiveFields: string[]; // encrypted into ciphertext/iv/auth_tag
}

export const SPECS: Record<string, RecordSpec> = {
  encounter: {
    table: "encounters",
    authorColumn: "doctor_id",
    parentColumn: "patient_id",
    clearColumns: ["patient_id", "encounter_type", "datetime"],
    sensitiveFields: ["chief_complaint", "examination", "diagnosis", "progress_note"],
  },
  vitals: {
    table: "vitals",
    authorColumn: "nurse_id",
    parentColumn: "patient_id",
    clearColumns: ["patient_id", "kind", "recorded_at"],
    sensitiveFields: ["temperature", "blood_pressure", "heart_rate", "resp_rate", "weight", "spo2", "note"],
  },
  lab_result: {
    table: "lab_results",
    authorColumn: "lab_tech_id",
    parentColumn: "order_id",
    clearColumns: ["order_id", "attachment_ref", "completed_at"],
    sensitiveFields: ["result_payload"],
  },
  prescription: {
    table: "prescriptions",
    authorColumn: "doctor_id",
    parentColumn: "patient_id",
    clearColumns: ["patient_id", "encounter_id", "status"],
    sensitiveFields: ["drug", "dose", "frequency", "duration"],
  },
};

/**
 * The exact object that gets SHA-256 hashed. Decrypt + rebuild this in
 * verify-integrity to reproduce the hash. (canonicalize() sorts keys, so field
 * order here does not matter.)
 */
export function canonicalRecord(
  recordType: string,
  identifiers: Record<string, unknown>,
  version: number,
  authorId: string,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  return { recordType, version, authorId, identifiers, fields };
}

/** Pick only the sensitive fields from a payload (undefined → null for stability). */
export function pickSensitive(spec: RecordSpec, src: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of spec.sensitiveFields) out[f] = src[f] ?? null;
  return out;
}
