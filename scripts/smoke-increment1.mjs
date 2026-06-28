#!/usr/bin/env node
// smoke-increment1.mjs — end-to-end verification of the Increment-1 gate.
//
// Drives the LIVE Supabase project (no mocks): logs in as each seeded role and
// exercises the real auth → RLS → Edge Function (AES encrypt / decrypt / hash)
// pipeline, asserting both the happy paths and the deny paths.
//
// Prerequisites (see supabase/SETUP.md):
//   1. migrations applied   (supabase db push)            ✓ already on remote
//   2. seed.sql applied      (Dashboard SQL editor / psql) — creates the logins
//   3. AES_KEY secret set + functions deployed
//        supabase secrets set AES_KEY=<hex>
//        supabase functions deploy create-record read-record verify-integrity
//   4. frontend/js/env.js has the real SUPABASE_URL + anon key
//
// Run:  node scripts/smoke-increment1.mjs
// Exit: 0 if every check passes, 1 otherwise.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ---- config: read SUPABASE_URL + anon key from frontend/js/env.js -----------
function loadEnv() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    return { url: process.env.SUPABASE_URL, anon: process.env.SUPABASE_ANON_KEY };
  }
  const txt = readFileSync(resolve(root, "frontend/js/env.js"), "utf8");
  const url = txt.match(/SUPABASE_URL:\s*['"]([^'"]+)['"]/)?.[1];
  const anon = txt.match(/SUPABASE_ANON_KEY:\s*['"]([^'"]+)['"]/)?.[1];
  if (!url || !anon) throw new Error("Could not read SUPABASE_URL / ANON_KEY from frontend/js/env.js");
  return { url: url.replace(/\/$/, ""), anon };
}
const { url: SUPABASE_URL, anon: ANON } = loadEnv();
const FUNCTIONS = `${SUPABASE_URL}/functions/v1`;
const REST = `${SUPABASE_URL}/rest/v1`;

const PASSWORD = "vitasecure123";
const ACCOUNTS = {
  ADMIN: "admin@vitasecure.org",
  DOCTOR: "doctor@vitasecure.org",
  NURSE: "nurse@vitasecure.org",
  LAB_TECHNICIAN: "lab@vitasecure.org",
  RECEPTIONIST: "reception@vitasecure.org",
  SARAH: "sarah@example.com",
  MARCUS: "marcus@example.com",
};

// ---- tiny test harness ------------------------------------------------------
let pass = 0, fail = 0;
const results = [];
function check(name, condition, detail = "") {
  if (condition) { pass++; results.push(["PASS", name, detail]); }
  else { fail++; results.push(["FAIL", name, detail]); }
}
const tokens = {};

// ---- HTTP helpers -----------------------------------------------------------
async function login(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, token: body.access_token, body };
}

function jwtClaims(token) {
  try { return JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8")); }
  catch { return {}; }
}

async function callFn(name, token, payload) {
  const res = await fetch(`${FUNCTIONS}/${name}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ...body }; // { status, data?, error? }
}

async function rest(path, token) {
  const res = await fetch(`${REST}/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  return { status: res.status, rows: await res.json().catch(() => []) };
}

// ---- the verification -------------------------------------------------------
async function main() {
  console.log(`\nVitaSecure · Increment-1 smoke test → ${SUPABASE_URL}\n`);

  // 1. Auth + role claim for every account (proves custom_access_token_hook).
  for (const [role, email] of Object.entries(ACCOUNTS)) {
    const { status, token, body } = await login(email);
    if (status !== 200 || !token) {
      check(`login ${email}`, false, `status ${status} ${JSON.stringify(body).slice(0, 120)}`);
      continue;
    }
    tokens[role] = token;
    const claimRole = jwtClaims(token).user_role;
    const expected = role === "SARAH" || role === "MARCUS" ? "PATIENT" : role;
    check(`login ${email}`, true);
    check(`  JWT user_role=${expected}`, claimRole === expected, `got '${claimRole ?? "—"}'`);
  }
  if (!tokens.DOCTOR) { report(); process.exit(1); }

  // Patient ids via RLS-scoped REST read (doctor may select patients).
  const sarah = (await rest("patients?mrn=eq.MRN-10001&select=id", tokens.DOCTOR)).rows[0]?.id;
  check("RLS: doctor reads patient chart (MRN-10001)", !!sarah);
  const fbcOrder = (await rest("lab_orders?test_type=eq.Full%20Blood%20Count&select=id", tokens.LAB_TECHNICIAN)).rows[0]?.id;
  check("RLS: lab tech reads assigned order (FBC)", !!fbcOrder);

  // 2. Doctor: create → read-back (decrypt) → verify (encounter).
  let encId;
  if (sarah) {
    const c = await callFn("create-record", tokens.DOCTOR, {
      recordType: "encounter", patient_id: sarah, encounter_type: "follow-up",
      chief_complaint: "Headache and elevated BP",
      examination: "BP 148/92, HR 80, no focal deficit",
      diagnosis: "Essential hypertension",
      progress_note: "Continue lisinopril; review in 2 weeks.",
    });
    encId = c.data?.id;
    check("doctor create encounter (AES write)", c.status === 200 && !!encId,
      c.status !== 200 ? JSON.stringify(c).slice(0, 140) : `id ${encId?.slice(0, 8)} ${c.data?.anchorStatus}`);

    if (encId) {
      const r = await callFn("read-record", tokens.DOCTOR, { recordType: "encounter", recordId: encId });
      check("doctor read-record decrypts content",
        r.status === 200 && r.data?.fields?.diagnosis === "Essential hypertension",
        `diagnosis='${r.data?.fields?.diagnosis ?? "—"}'`);

      const v = await callFn("verify-integrity", tokens.DOCTOR, { recordType: "encounter", recordId: encId });
      check("doctor verify-integrity → VERIFIED",
        v.status === 200 && v.data?.status === "VERIFIED", `status=${v.data?.status} ${v.data?.ms}ms`);
    }
  }

  // 3. Nurse: create vitals → verify.
  if (sarah) {
    const c = await callFn("create-record", tokens.NURSE, {
      recordType: "vitals", patient_id: sarah, kind: "vitals",
      temperature: "36.8", blood_pressure: "128/82", heart_rate: "74",
      resp_rate: "16", weight: "70", spo2: "98", note: "Patient comfortable.",
    });
    const vId = c.data?.id;
    check("nurse create vitals (AES write)", c.status === 200 && !!vId,
      c.status !== 200 ? JSON.stringify(c).slice(0, 140) : "");
    if (vId) {
      const v = await callFn("verify-integrity", tokens.NURSE, { recordType: "vitals", recordId: vId });
      check("nurse verify vitals → VERIFIED", v.data?.status === "VERIFIED", `status=${v.data?.status}`);
    }
  }

  // 4. Lab tech: create result against the seeded order → verify.
  if (fbcOrder) {
    const c = await callFn("create-record", tokens.LAB_TECHNICIAN, {
      recordType: "lab_result", order_id: fbcOrder,
      result_payload: "WBC 6.1, Hb 13.8, Plt 250 — within normal limits",
    });
    const lrId = c.data?.id;
    check("lab tech create lab_result (AES write)", c.status === 200 && !!lrId,
      c.status !== 200 ? JSON.stringify(c).slice(0, 140) : "");
    if (lrId) {
      const v = await callFn("verify-integrity", tokens.LAB_TECHNICIAN, { recordType: "lab_result", recordId: lrId });
      check("lab tech verify result → VERIFIED", v.data?.status === "VERIFIED", `status=${v.data?.status}`);
    }
  }

  // 5. Doctor: prescription.
  if (sarah) {
    const c = await callFn("create-record", tokens.DOCTOR, {
      recordType: "prescription", patient_id: sarah,
      drug: "Lisinopril", dose: "10 mg", frequency: "once daily", duration: "30 days",
    });
    check("doctor create prescription (AES write)", c.status === 200 && !!c.data?.id,
      c.status !== 200 ? JSON.stringify(c).slice(0, 140) : "");
  }

  // 6. DENY paths (unauthorised-access-prevention: every one must be blocked).
  if (sarah) {
    const n = await callFn("create-record", tokens.NURSE, {
      recordType: "encounter", patient_id: sarah, diagnosis: "should be denied",
    });
    check("DENY: nurse cannot create encounter (403)", n.status === 403, `got ${n.status}`);

    if (encId) {
      const r = await callFn("read-record", tokens.RECEPTIONIST, { recordType: "encounter", recordId: encId });
      check("DENY: receptionist cannot read encounter (403)", r.status === 403, `got ${r.status}`);

      const p = await callFn("read-record", tokens.SARAH, { recordType: "encounter", recordId: encId });
      check("ALLOW: patient reads OWN encounter (200)", p.status === 200, `got ${p.status}`);

      const m = await callFn("read-record", tokens.MARCUS, { recordType: "encounter", recordId: encId });
      check("DENY: other patient cannot read it (403)", m.status === 403, `got ${m.status}`);
    }
  }

  report();
  process.exit(fail === 0 ? 0 : 1);
}

function report() {
  console.log("");
  for (const [state, name, detail] of results) {
    const mark = state === "PASS" ? "✓" : "✗";
    console.log(`  ${mark} ${name}${detail ? `  — ${detail}` : ""}`);
  }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
}

main().catch((e) => { console.error("smoke test crashed:", e); process.exit(1); });
