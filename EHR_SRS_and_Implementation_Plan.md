



# Software Requirements Specification (SRS) and Implementation Plan

## Secure Electronic Health Record System with Blockchain Integrity Verification and Role-Based Access Control

**Project:** Final Year Project, BSc Software Engineering — Faculty of Information and Communication Technology, The ICT University
**Document type:** SRS + Implementation Plan (engineering artefact supporting Chapter 4)
**Version:** 1.0
**Status:** Draft for supervisor review

---

> **Consistency note (read before submission).** Chapters 1–3 of the dissertation currently define **five** roles in §1.5 (Scope), Table 3.1 (Sample) and Table 3.2 (Roles and permissions): System Administrator, Physician, Nurse, Receptionist, Patient. This document specifies **six** roles by adding **Lab Technician**. Before defence, update three places so the dissertation and the built system agree: (1) §1.5 scope sentence listing the roles, (2) Table 3.2 (add the Lab Technician row), and (3) Table 3.1 (add lab-technician respondents to the sample). An examiner will compare your system's roles against your stated scope; the addition is sensible, but it must be reflected back into Chapters 1 and 3.

---

## Table of Contents

**Part I — Software Requirements Specification**

1. Introduction
2. Overall Description
3. System Roles and User Characteristics
4. Functional Requirements
5. Role–Permission Matrix
6. User Stories (all six roles)
7. Non-Functional Requirements
8. Data Requirements
9. External Interface Requirements
10. Requirements Traceability Matrix

**Part II — Implementation Plan**
11. Development Methodology
12. System Architecture
13. Technology Stack
14. Database Design
15. Smart Contract Design
16. Security Implementation
17. Increment-by-Increment Work Plan
18. Testing Plan
19. Evaluation Plan
20. Risk Management
21. Indicative Timeline
22. Deliverables Checklist

---

# PART I — SOFTWARE REQUIREMENTS SPECIFICATION

## 1. Introduction

### 1.1 Purpose

This document specifies the complete functional and non-functional requirements for a secure Electronic Health Record (EHR) system that protects the **integrity** of patient records using a permissioned blockchain and protects the **confidentiality** of those records using role-based access control (RBAC). It is the requirements baseline against which the prototype is designed, built and evaluated, and it directly realises Specific Objective 1 of the study ("to determine the security, integrity and access-control requirements of an electronic health record system").

### 1.2 Scope

The system is a **web-based EHR prototype for the outpatient record-management workflow of a single medical facility**. In scope:

- Patient registration and demographic management.
- Recording and retrieval of clinical encounter data (progress notes, diagnoses), vitals/nursing notes, lab orders and lab results, and prescriptions.
- Cryptographic integrity verification of every clinical record via SHA-256 hashing anchored on a permissioned blockchain through smart contracts.
- Role-based access control enforced through smart-contract permission checks for six roles.
- An immutable, on-chain audit trail of record creation, modification, verification and access decisions.
- Patient-controlled consent (grant/revoke access visibility).

Explicitly **out of scope** (carried forward from dissertation §1.5): national or multi-facility deployment; integration with external insurance or billing networks; data from IoT/connected medical devices; native mobile applications; machine-learning analytics; and formal verification of cryptographic primitives.

### 1.3 Definitions, Acronyms and Abbreviations

| Term                    | Meaning                                                                   |
| ----------------------- | ------------------------------------------------------------------------- |
| EHR                     | Electronic Health Record                                                  |
| RBAC                    | Role-Based Access Control                                                 |
| Off-chain store         | Conventional encrypted database holding the actual records                |
| On-chain anchor         | The SHA-256 hash of a record committed to the blockchain                  |
| Smart contract          | Self-executing program on the ledger that enforces rules and emits events |
| Permissioned blockchain | Ledger restricted to known, vetted nodes                                  |
| SHA-256                 | Secure Hash Algorithm producing a 256-bit digest                          |
| AES-256-GCM             | Authenticated symmetric encryption used for record fields                 |
| JWT                     | JSON Web Token used for session authentication                            |
| CIA                     | Confidentiality, Integrity, Availability                                  |
| MRN                     | Medical Record Number                                                     |
| MoSCoW                  | Prioritisation scheme: Must / Should / Could / Won't                      |
| TAM                     | Technology Acceptance Model                                               |

### 1.4 Product Perspective

The system is a new, self-contained prototype. It comprises five logical layers consistent with Figure 3.2 of the dissertation: a presentation layer (browser UI), an application/RBAC layer (REST API + access-control engine), an off-chain encrypted data store, a blockchain integrity layer (smart contracts on a permissioned ledger), and the underlying infrastructure. Confidentiality is handled in the upper layers and the encrypted store; integrity is handled in the blockchain layer; the two concerns are deliberately separated so each can be tested independently.

### 1.5 Assumptions and Dependencies

- The facility operates ordinary office hardware with a local network; the prototype is evaluated in a controlled environment, not live clinical operation.
- A local/permissioned blockchain development network is available for development and demonstration.
- All clinical data used in development and testing are synthetic or fully anonymised (per dissertation §3.10 ethics).
- Standard, well-established cryptographic algorithms (SHA-256, AES-256) are adopted on the strength of the literature rather than re-derived.

### 1.6 Prioritisation Convention

Each requirement carries a **MoSCoW** priority: **M** (Must — core to the research questions), **S** (Should — strengthens the artefact), **C** (Could — included if time permits). No "Won't" items are listed; out-of-scope features are excluded in §1.2.

---

## 2. Overall Description

### 2.1 Operating Environment

- **Client:** Modern desktop browser (Chrome, Firefox, Edge).
- **Server:** Application server exposing a REST API; off-chain database; local node of the permissioned blockchain.
- **Network:** Facility LAN; intermittent connectivity is assumed and the design tolerates it (see NFR-ENV).

### 2.2 Design and Implementation Constraints

- The architecture must follow the **off-chain storage + on-chain hash anchoring** pattern; records themselves are never written to the chain.
- Access decisions must be mediated by **smart-contract RBAC**, so the access rules are themselves tamper-evident.
- The blockchain must be **permissioned** (not public), to satisfy confidentiality, throughput and cost constraints.
- The system must run on modest, resource-constrained hardware.

### 2.3 General Constraints on All Records

Every clinical record (encounter note, vitals entry, lab order, lab result, prescription) is, on creation or modification:

1. Encrypted at the field level in the off-chain store.
2. Hashed with SHA-256.
3. Anchored on-chain with its hash, author identity, record type, version and timestamp.
4. Logged as an immutable audit event.

---

## 3. System Roles and User Characteristics

| Role                 | Description                                                                                 | Technical proficiency | Primary concern                             |
| -------------------- | ------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------- |
| System Administrator | Manages accounts, role assignments and system health; performs no clinical editing          | High                  | Security, auditability, availability        |
| Doctor (Physician)   | Creates clinical notes and diagnoses, orders investigations, prescribes, verifies integrity | Medium                | Speed, completeness, trustworthy data       |
| Nurse                | Records vitals and nursing notes; reads relevant clinical data                              | Medium                | Efficient charting, correct patient context |
| Lab Technician       | Receives lab orders, records and uploads results; verifies result integrity                 | Medium                | Correct order matching, result integrity    |
| Receptionist         | Registers patients, manages demographics and appointments; no clinical-note access          | Low–Medium           | Fast check-in, accurate demographics        |
| Patient              | Views own record and the audit of who accessed it; grants/revokes consent                   | Variable              | Privacy, transparency, control              |

**Principle of least privilege** governs every role: each user receives exactly the permissions attached to their role and no more.

---

## 4. Functional Requirements

Each requirement: **ID — description (priority) [traces to Objective]**.

### 4.1 Authentication, Session and Account Security (system-wide)

- **FR-AUTH-1** The system shall authenticate every user with a unique username and password before granting any access. (M) [O3]
- **FR-AUTH-2** The system shall store passwords only as salted one-way hashes (Argon2/bcrypt), never in plaintext or reversible form. (M) [O3]
- **FR-AUTH-3** The system shall issue a signed, time-limited session token (JWT) on successful login and reject expired or tampered tokens. (M) [O3]
- **FR-AUTH-4** The system shall automatically terminate an idle session after a configurable timeout (default 15 minutes). (M) [O2,O3]
- **FR-AUTH-5** The system shall lock an account after a configurable number of consecutive failed login attempts and record the event. (S) [O3]
- **FR-AUTH-6** The system shall allow a user to log out, immediately invalidating the session token. (M) [O3]
- **FR-AUTH-7** The system shall require password change on first login and enforce a minimum password-strength policy. (S) [O3]

### 4.2 Access Control (system-wide)

- **FR-AC-1** The system shall evaluate every operation against the authenticated user's role before execution. (M) [O2,O3]
- **FR-AC-2** The system shall delegate the access decision to the RBAC smart contract, which returns permit/deny for the (user, action, resource) tuple. (M) [O2,O3]
- **FR-AC-3** The system shall deny by default any operation for which the role has no explicit permission. (M) [O3]
- **FR-AC-4** The system shall record every access decision (permit and deny) as an immutable audit event. (M) [O3,O4]
- **FR-AC-5** The system shall enforce that no role — including System Administrator — can edit clinical content outside its defined permissions. (M) [O3]

### 4.3 Record Integrity (system-wide)

- **FR-INT-1** On creation of any clinical record, the system shall compute its SHA-256 hash. (M) [O3]
- **FR-INT-2** The system shall anchor the hash, author ID, record type, version and timestamp on the permissioned blockchain via a smart contract. (M) [O2,O3]
- **FR-INT-3** On any modification of a record, the system shall create a new version, re-hash it, and anchor the new hash without overwriting the prior anchor. (M) [O3]
- **FR-INT-4** The system shall, on demand, verify a record's integrity by re-hashing the stored record and comparing it to the on-chain hash, returning **VERIFIED** or **TAMPERED**. (M) [O3,O4]
- **FR-INT-5** The system shall flag and visibly mark any record whose recomputed hash does not match its on-chain anchor. (M) [O4]
- **FR-INT-6** The system shall expose the full version/anchor history of any record to authorised roles. (S) [O3,O4]

### 4.4 Audit Trail (system-wide)

- **FR-AUD-1** The system shall log every create, read, update, verify and access-decision event with user ID, role, action, object type, object ID, timestamp and outcome. (M) [O3,O4]
- **FR-AUD-2** The system shall anchor audit events on-chain (or anchor a periodic Merkle root of the audit batch) so the log itself is tamper-evident. (M) [O3]
- **FR-AUD-3** The system shall prevent any user from editing or deleting audit entries. (M) [O3]
- **FR-AUD-4** The system shall allow authorised roles to query and filter the audit log by patient, user, date range and action. (S) [O4]

### 4.5 Consent (system-wide, patient-centred)

- **FR-CON-1** The system shall record a consent state for each patient governing which roles/users may access their record beyond the treating team. (S) [O2,O3]
- **FR-CON-2** The system shall let a patient grant or revoke consent, anchoring each change on-chain. (S) [O3]
- **FR-CON-3** The system shall enforce active consent as part of the access decision where consent applies. (S) [O2,O3]

### 4.6 System Administrator

- **FR-ADM-1** Create, update, deactivate and reactivate user accounts. (M) [O3]
- **FR-ADM-2** Assign and revoke roles, with each assignment recorded on-chain via the RBAC contract. (M) [O2,O3]
- **FR-ADM-3** View (read-only) the complete audit log and integrity-verification reports. (M) [O3,O4]
- **FR-ADM-4** Manage role and permission definitions (within the fixed six-role model). (S) [O2,O3]
- **FR-ADM-5** Monitor system health (service status, blockchain node status, last backup). (S) [O2]
- **FR-ADM-6** Trigger and review system backups per the backup/recovery plan. (S) [O2]
- **FR-ADM-7** The Administrator shall **not** be able to create, read or modify clinical content (notes, results, prescriptions). (M) [O3]

### 4.7 Doctor (Physician)

- **FR-DOC-1** Search for and open a patient record to which the doctor has authorised access. (M) [O3]
- **FR-DOC-2** Create and read clinical encounter records (chief complaint, examination, diagnosis, progress notes). (M) [O3]
- **FR-DOC-3** Create, read and update prescriptions for a patient under care. (M) [O3]
- **FR-DOC-4** Order laboratory investigations, directing the order to the lab. (M) [O3]
- **FR-DOC-5** View laboratory results returned for the doctor's orders. (M) [O3]
- **FR-DOC-6** Read vitals and nursing notes for the patient under care. (M) [O3]
- **FR-DOC-7** Read and update the patient's allergy and medication lists. (S) [O3]
- **FR-DOC-8** Verify the integrity of any clinical record the doctor can access. (M) [O4]
- **FR-DOC-9** View the version history of a clinical record. (S) [O3]

### 4.8 Nurse

- **FR-NUR-1** Search for and open a patient record to which the nurse has authorised access. (M) [O3]
- **FR-NUR-2** Record and read patient vitals (temperature, blood pressure, heart rate, respiratory rate, weight, etc.). (M) [O3]
- **FR-NUR-3** Create and read nursing notes for the patient. (M) [O3]
- **FR-NUR-4** Read relevant clinical encounter data and the allergy list to inform care. (M) [O3]
- **FR-NUR-5** View laboratory results relevant to the patient under care. (S) [O3]
- **FR-NUR-6** Verify the integrity of vitals/nursing records the nurse can access. (S) [O4]
- **FR-NUR-7** The Nurse shall **not** be able to create diagnoses or prescriptions, or edit doctors' notes. (M) [O3]

### 4.9 Lab Technician

- **FR-LAB-1** View the queue of laboratory orders directed to the lab. (M) [O3]
- **FR-LAB-2** Open a specific lab order and view only the clinical context necessary to fulfil it (test requested, patient identifier, ordering doctor). (M) [O3]
- **FR-LAB-3** Record and upload laboratory results against the corresponding order. (M) [O3]
- **FR-LAB-4** Mark an order's status (received, in progress, completed). (S) [O3]
- **FR-LAB-5** Verify the integrity of lab results the technician created. (M) [O4]
- **FR-LAB-6** The Lab Technician shall **not** be able to view or edit doctors' progress notes, prescriptions, demographics beyond what an order requires, or records unrelated to assigned orders. (M) [O3]

### 4.10 Receptionist

- **FR-REC-1** Register a new patient and create the patient's demographic record and MRN. (M) [O3]
- **FR-REC-2** Search for and update existing patient demographic and contact information. (M) [O3]
- **FR-REC-3** Detect and prevent duplicate patient charts during registration. (S) [O3]
- **FR-REC-4** Create, reschedule and cancel appointments. (M) [O3]
- **FR-REC-5** View the appointment calendar and manage check-in status. (S) [O3]
- **FR-REC-6** Manage chart status (active, inactive, closed). (S) [O3]
- **FR-REC-7** The Receptionist shall **not** be able to view or edit any clinical content (notes, vitals, results, prescriptions). (M) [O3]

### 4.11 Patient

- **FR-PAT-1** View own complete health record (encounters, results, prescriptions, vitals). (M) [O3]
- **FR-PAT-2** View the audit trail of who accessed or modified their record and when. (M) [O3,O4]
- **FR-PAT-3** Grant or revoke consent for access to their record. (S) [O3]
- **FR-PAT-4** Request the integrity verification of any of their own records. (S) [O4]
- **FR-PAT-5** Update own non-clinical contact details (subject to confirmation). (C) [O3]
- **FR-PAT-6** The Patient shall **not** be able to alter clinical content or any other patient's record. (M) [O3]

---

## 5. Role–Permission Matrix

Legend: **C** create, **R** read, **U** update, **V** verify integrity, **—** no access. "Own" = patient's own data only. "Assigned" = limited to records tied to the user's care or orders.

| Data object                         |    Admin    |          Doctor          |      Nurse      |       Lab Tech       |  Receptionist  |    Patient    |
| ----------------------------------- | :---------: | :----------------------: | :-------------: | :-------------------: | :-------------: | :------------: |
| User accounts & roles               |    C R U    |            —            |       —       |          —          |       —       |       —       |
| Patient demographics                |      R      |            R            |        R        |     R (order ctx)     |      C R U      |    R (own)    |
| Appointments                        |      R      |            R            |        R        |          —          |      C R U      |    R (own)    |
| Clinical encounter / progress notes |     —     |         C R U V         |        R        |          —          |       —       |    R (own)    |
| Vitals / nursing notes              |     —     |           R V           |     C R U V     |          —          |       —       |    R (own)    |
| Allergy / medication list           |     —     |          R U V          |        R        |          —          |       —       |    R (own)    |
| Lab orders                          |     —     |          C R V          |        R        |     R (assigned)     |       —       |    R (own)    |
| Lab results                         |     —     |           R V           |        R        | C R U V (own results) |       —       |    R (own)    |
| Prescriptions                       |     —     |         C R U V         |        R        |          —          |       —       |    R (own)    |
| Consent records                     |      R      |            R            |        R        |          —          |       —       |  C R U (own)  |
| Audit log                           |      R      | R (own actions/patients) | R (own actions) |    R (own actions)    | R (own actions) | R (own record) |
| Integrity verification              | R (reports) |            V            |        V        |           V           |       —       |    V (own)    |

> This matrix is the authoritative, expanded version of dissertation Table 3.2 with the Lab Technician added. Copy it back into Table 3.2 when you reconcile the documents.

---

## 6. User Stories (All Six Roles)

Format: *As a [role], I want [capability], so that [benefit].* Each story has acceptance criteria (AC).

### 6.1 System Administrator

**US-ADM-1** — As an administrator, I want to create a user account and assign it a role, so that staff can access only the functions their job requires.

- AC1: I can enter user details and select exactly one role from the six.
- AC2: On save, the role assignment is recorded on-chain and appears in the audit log.
- AC3: The new user must change their password at first login.

**US-ADM-2** — As an administrator, I want to deactivate a departing employee's account, so that former staff can no longer access patient data.

- AC1: A deactivated account cannot authenticate.
- AC2: The deactivation event is logged immutably.

**US-ADM-3** — As an administrator, I want to view the complete audit log and integrity reports, so that I can detect and investigate unauthorised access or tampering.

- AC1: I can filter the log by user, patient, action and date.
- AC2: I cannot edit or delete any log entry.

**US-ADM-4** — As an administrator, I want to monitor blockchain node and backup status, so that I can ensure the system remains available and recoverable.

- AC1: A dashboard shows node connectivity, last successful backup and service health.

**US-ADM-5** — As an administrator, I want to be prevented from reading or editing clinical notes, so that the principle of least privilege holds even for privileged accounts.

- AC1: Any attempt to open clinical content is denied and logged.

### 6.2 Doctor

**US-DOC-1** — As a doctor, I want to open my patient's record, so that I can review their history before consultation.

- AC1: Search returns only patients I am authorised to view.
- AC2: Opening the record is logged.

**US-DOC-2** — As a doctor, I want to write an encounter note and diagnosis, so that the visit is documented as the legal clinical record.

- AC1: On save, the note is encrypted, hashed and anchored on-chain.
- AC2: A later edit creates a new version with a new anchor; the original remains verifiable.

**US-DOC-3** — As a doctor, I want to order a lab test, so that the laboratory receives the request and returns results into the record.

- AC1: The order appears in the lab technician's queue.
- AC2: The order is linked to the encounter and the patient.

**US-DOC-4** — As a doctor, I want to prescribe medication, so that the patient receives correct treatment.

- AC1: The prescription is recorded, hashed and anchored.
- AC2: Known allergies are displayed before I confirm.

**US-DOC-5** — As a doctor, I want to verify a record's integrity, so that I can trust the data I am acting on has not been altered.

- AC1: Verification returns VERIFIED or TAMPERED within the target time.
- AC2: A TAMPERED result is visibly flagged and logged.

### 6.3 Nurse

**US-NUR-1** — As a nurse, I want to record a patient's vitals, so that the care team has current physiological data.

- AC1: Vitals are saved, encrypted, hashed and anchored.
- AC2: The entry is attributed to me with a timestamp.

**US-NUR-2** — As a nurse, I want to write a nursing note, so that I can document observations and care given.

- AC1: The note is saved and anchored; I cannot edit a doctor's diagnosis.

**US-NUR-3** — As a nurse, I want to read the patient's allergies and recent encounter, so that I deliver safe care.

- AC1: I can read but not modify clinical encounter content.

**US-NUR-4** — As a nurse, I want to be blocked from prescribing or diagnosing, so that scope-of-practice boundaries are technically enforced.

- AC1: Prescription/diagnosis actions are not available to my role and are denied if attempted.

### 6.4 Lab Technician

**US-LAB-1** — As a lab technician, I want to see the queue of orders sent to the lab, so that I know which tests to perform.

- AC1: The queue shows only orders directed to the lab, with test type and patient identifier.

**US-LAB-2** — As a lab technician, I want to record and upload a test result against its order, so that the doctor receives the result in the patient's record.

- AC1: The result is linked to the correct order.
- AC2: On save, it is encrypted, hashed and anchored on-chain.

**US-LAB-3** — As a lab technician, I want to verify the integrity of a result I uploaded, so that I can confirm it was stored unaltered.

- AC1: Verification returns VERIFIED/TAMPERED for my results.

**US-LAB-4** — As a lab technician, I want to be prevented from reading doctors' notes and unrelated records, so that I only see the minimum needed to do my job.

- AC1: Access to progress notes, prescriptions and non-assigned records is denied and logged.

### 6.5 Receptionist

**US-REC-1** — As a receptionist, I want to register a new patient, so that a single accurate longitudinal record exists.

- AC1: A unique MRN is generated.
- AC2: The system warns if a likely duplicate already exists.

**US-REC-2** — As a receptionist, I want to update demographic and contact details, so that patient information stays current.

- AC1: I can edit demographics; clinical fields are not visible or editable to me.

**US-REC-3** — As a receptionist, I want to schedule, reschedule and cancel appointments, so that patient flow is managed efficiently.

- AC1: The calendar reflects changes immediately; each change is logged.

**US-REC-4** — As a receptionist, I want to be blocked from clinical content, so that confidentiality is preserved.

- AC1: Any attempt to open notes, vitals, results or prescriptions is denied and logged.

### 6.6 Patient

**US-PAT-1** — As a patient, I want to view my own health record, so that I am informed about my care.

- AC1: I see my encounters, results, prescriptions and vitals; I cannot edit clinical content.

**US-PAT-2** — As a patient, I want to see who accessed my record and when, so that I can trust the system protects my privacy.

- AC1: An access log specific to my record is available and cannot be altered.

**US-PAT-3** — As a patient, I want to grant or revoke access consent, so that I control who can see my information beyond the treating team.

- AC1: Consent changes take effect on the next access decision and are anchored on-chain.

**US-PAT-4** — As a patient, I want to verify that my records are intact, so that I am assured they have not been tampered with.

- AC1: I can trigger integrity verification on my own records and see the result.

---

## 7. Non-Functional Requirements

### 7.1 Security

- **NFR-SEC-1 (Integrity)** Any unauthorised modification of a stored record shall be detectable by hash comparison against the on-chain anchor. *Target: 100% tamper-detection rate.* (M) [O4 → tamper-detection rate]
- **NFR-SEC-2 (Confidentiality)** Records shall be stored encrypted at field level using AES-256-GCM; keys shall never be stored alongside ciphertext. (M) [O3]
- **NFR-SEC-3 (Access enforcement)** Every role-violating access attempt shall be denied. *Target: 100% unauthorised-access-prevention rate.* (M) [O4 → unauthorised-access-prevention rate]
- **NFR-SEC-4 (Auditability / non-repudiation)** Every state-changing action and access decision shall produce a tamper-evident, attributable audit record. (M) [O3,O4]
- **NFR-SEC-5 (Transport security)** All client–server traffic shall be encrypted in transit (TLS/HTTPS). (M) [O3]
- **NFR-SEC-6 (Key management)** Encryption keys shall be managed outside the application database, with documented generation, storage and rotation procedures. (M) [O3]
- **NFR-SEC-7 (Tamper-evident rules)** Access-control rules shall reside on-chain so they cannot be silently altered by a single administrator. (M) [O2,O3]
- **NFR-SEC-8 (Least privilege)** No account shall hold privileges beyond those required by its role. (M) [O3]

### 7.2 Performance

- **NFR-PERF-1** Mean integrity-verification (hash-verification) time shall be reported and should remain within an interactive bound (target ≤ 2 s under test conditions). (S) [O4 → hash-verification time]
- **NFR-PERF-2** Mean transaction-commit latency (anchoring a hash on the ledger) shall be measured and reported. (S) [O4 → transaction-commit latency]
- **NFR-PERF-3** Routine read operations (open a record, list a queue) should return within 3 s on the target hardware. (S) [O4]

### 7.3 Usability

- **NFR-USE-1** The interface shall be learnable by staff of low-to-medium computer literacy with minimal training, supporting the perceived-ease-of-use construct of the TAM. (M) [O4 → usability score]
- **NFR-USE-2** The system shall provide clear, role-appropriate navigation and visible integrity status (VERIFIED/TAMPERED badges). (S) [O4]
- **NFR-USE-3** Error messages shall be specific and actionable, never exposing sensitive internals. (S) [O3,O4]

### 7.4 Reliability and Availability

- **NFR-REL-1** The system shall maintain a written, tested backup-and-recovery plan with regular backups (offsite or portable). (M) [O2]
- **NFR-REL-2** The off-chain store and the ledger shall remain consistent; a record must always be re-locatable from its on-chain anchor metadata. (M) [O3]
- **NFR-REL-3** The system shall degrade gracefully if the blockchain node is temporarily unreachable, queuing anchors for commit when connectivity resumes. (S) [O2 → low-resource setting]

### 7.5 Maintainability

- **NFR-MAINT-1** The codebase shall be modular along the five architectural layers, with the integrity and access-control concerns separable and independently testable. (M) [O2]
- **NFR-MAINT-2** All code shall be version-controlled (Git) with meaningful history. (M) [O3]
- **NFR-MAINT-3** Smart contracts shall be documented and unit-tested before deployment. (M) [O3,O4]

### 7.6 Portability and Environmental Constraints

- **NFR-PORT-1** The system shall run on modest, commodity hardware suitable for a resource-constrained facility. (M) [O2]
- **NFR-ENV-1** The design shall tolerate intermittent electricity and limited bandwidth (local-first operation, deferred on-chain commit, lightweight payloads). (S) [O2 — limitation acknowledged in §1.7]

### 7.7 Compliance and Ethics

- **NFR-COMP-1** The design shall embody HIPAA-style safeguards conceptually: administrative (account/role policies), physical (deployment guidance) and technical (access control, automatic logoff, audit, encryption). (S) [O1,O2]
- **NFR-COMP-2** No real, identifiable patient data shall be used; only synthetic or anonymised data, consistent with the study's ethical commitments. (M) [O1]

### 7.8 Scalability (bounded)

- **NFR-SCAL-1** Within the single-facility scope, the system shall handle the realistic record volume of an outpatient office without degradation; multi-facility scale is explicitly out of scope. (C) [O4]

---

## 8. Data Requirements

Principal entities and key attributes (full schema in §14):

- **User**: user_id, username, password_hash, role, status, created_at, last_login.
- **Patient**: patient_id, MRN, full_name, DOB, sex, contact, address, emergency_contact, chart_status, created_by.
- **Appointment**: appointment_id, patient_id, provider_id, datetime, reason, status.
- **Encounter**: encounter_id, patient_id, doctor_id, datetime, chief_complaint, diagnosis, progress_note, version, record_hash, anchor_tx_id.
- **Vitals / Nursing note**: vitals_id, patient_id, nurse_id, temperature, blood_pressure, heart_rate, resp_rate, weight, note, timestamp, version, record_hash, anchor_tx_id.
- **Allergy**: allergy_id, patient_id, substance, reaction, severity.
- **Lab order**: order_id, encounter_id, patient_id, ordering_doctor_id, test_type, priority, status, created_at.
- **Lab result**: result_id, order_id, lab_tech_id, result_payload, attachment_ref, completed_at, version, record_hash, anchor_tx_id.
- **Prescription**: prescription_id, encounter_id, patient_id, doctor_id, drug, dose, frequency, duration, version, record_hash, anchor_tx_id.
- **Consent**: consent_id, patient_id, scope, granted_to, granted_at, revoked_at, anchor_tx_id.
- **Audit event**: log_id, user_id, role, action, object_type, object_id, timestamp, outcome, anchor_tx_id.
- **Integrity anchor (on-chain)**: record_id, record_type, sha256_hash, author_id, version, timestamp.

All record-bearing entities carry `record_hash` + `anchor_tx_id` linking the off-chain row to its on-chain anchor.

---

## 9. External Interface Requirements

### 9.1 User Interfaces

- Role-specific dashboards (one landing view per role) presenting only permitted functions.
- Patient-search, record-view, charting forms, lab queue, appointment calendar, audit viewer, integrity-status indicators.

### 9.2 Software Interfaces

- **REST API** between client and application layer (JSON over HTTPS).
- **Blockchain interface** between application layer and the permissioned ledger (smart-contract calls for anchoring, verification and access checks).
- **Database interface** between application layer and the encrypted off-chain store.

### 9.3 Communications Interfaces

- HTTPS/TLS for all client–server traffic; secure RPC to the blockchain node.

---

## 10. Requirements Traceability Matrix

| Specific Objective                          | Requirements that satisfy it                                              | Evaluation metric (Table 3.4)                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **O1** Determine requirements         | This entire SRS (§§4–9)                                                | — (requirements completeness)                                                                                      |
| **O2** Design integrated architecture | FR-AC-2, FR-INT-2, NFR-SEC-7, NFR-MAINT-1, §12 architecture              | — (design models)                                                                                                  |
| **O3** Implement prototype            | FR-AUTH-*, FR-AC-*, FR-INT-1/2/3, FR-AUD-*, all role FRs, NFR-SEC-2/5/6 | — (working artefact)                                                                                               |
| **O4** Verify and evaluate            | FR-INT-4/5, FR-AC-4, FR-AUD-4, NFR-SEC-1/3, NFR-PERF-1/2, NFR-USE-1       | tamper-detection rate; unauthorised-access-prevention rate; hash-verification time; commit latency; usability score |

> In the viva, this table lets you answer "why does this requirement exist?" by pointing to an objective, and "how will you prove it works?" by pointing to a metric.

---

# PART II — IMPLEMENTATION PLAN

## 11. Development Methodology

The prototype is built with an **iterative and incremental** methodology with prototyping, exactly as committed in dissertation §3.5. The highest-risk work (integrating the blockchain integrity layer with the RBAC layer) is retired early through working increments rather than deferred to a single late integration. Each increment passes through requirements refinement → analysis → design → implementation → testing, and feedback from each increment informs the next.

## 12. System Architecture

Five layers (realising Figure 3.2):

```
┌─────────────────────────────────────────────────────────┐
│ Presentation Layer  — browser UI, role-specific views    │
├─────────────────────────────────────────────────────────┤
│ Application + RBAC Layer — REST API, business logic,      │
│   access-control engine (calls RBAC smart contract)       │
├──────────────────────────────┬──────────────────────────┤
│ Off-chain Encrypted Store     │ Blockchain Integrity Layer │
│  (AES-256 records, versions)  │  (SHA-256 anchors, RBAC &  │
│                               │   audit smart contracts)   │
├──────────────────────────────┴──────────────────────────┤
│ Infrastructure — server, DB engine, permissioned node     │
└─────────────────────────────────────────────────────────┘
```

Confidentiality lives in the upper layers + encrypted store; integrity lives in the blockchain layer. Hashes flow from the store to the chain on write; on verification, the store's recomputed hash is compared with the chain's anchor.

## 13. Technology Stack

These are concrete recommendations that realise the deliberately abstract choices in dissertation Tables 3.2/3.3. Each is defensible; alternatives are noted.

| Layer             | Recommended                                                                                                                               | Defensible alternative         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Front-end         | React + a component library (e.g., Material UI)                                                                                           | Vue + Vuetify                  |
| Application / API | Node.js + Express (REST)                                                                                                                  | Python + Django/FastAPI        |
| Off-chain store   | PostgreSQL with field-level AES-256-GCM                                                                                                   | MongoDB with encrypted fields  |
| Blockchain        | Solidity smart contracts on a**permissioned EVM network** (Hardhat local node for dev; PoA via Geth/Besu for the permissioned demo) | Hyperledger Fabric + chaincode |
| Chain client      | ethers.js / web3.js                                                                                                                       | Fabric SDK                     |
| Hashing           | SHA-256 (Node`crypto`)                                                                                                                  | —                             |
| Record encryption | AES-256-GCM                                                                                                                               | —                             |
| Passwords         | Argon2 (or bcrypt)                                                                                                                        | —                             |
| Sessions          | JWT                                                                                                                                       | Server-side sessions           |
| Modelling / VCS   | UML (use-case, class, sequence, ERD) + Git                                                                                                | —                             |
| Testing           | Jest/Mocha (app) + Hardhat tests (contracts)                                                                                              | PyTest                         |

**Why permissioned EVM over Hyperledger for a one-year project:** EVM tooling (Hardhat, ethers.js) is mature and heavily documented, true smart contracts are first-class, and a PoA network gives you the *permissioned* property your dissertation requires; your Chapter 2 already cites an Ethereum-smart-contract scheme (Yaqub et al., 2025). Hyperledger Fabric is equally defensible but has a steeper setup cost. Pick one and justify it in Chapter 3 — do not leave it ambiguous.

## 14. Database Design (off-chain)

Relational schema, one table per entity in §8. Each clinical table includes `version`, `record_hash` and `anchor_tx_id`. Foreign keys link encounters→patients, lab orders→encounters, lab results→orders, prescriptions→encounters. Sensitive free-text and result fields are stored as AES-256-GCM ciphertext; identifiers and foreign keys remain queryable. Produce an **ERD** for Chapter 4.

## 15. Smart Contract Design

Three logical contracts (can be combined, but separation reads more cleanly in the design chapter):

1. **RBACContract** — stores role→permission mappings and user→role assignments; exposes `assignRole(user, role)`, `revokeRole(user)`, `checkAccess(user, action, resource) → bool`; emits `RoleAssigned`, `AccessChecked`, `AccessDenied`.
2. **IntegrityAnchorContract** — `anchorHash(recordId, recordType, hash, author, version)`, `getAnchor(recordId, version)`, `verify(recordId, version, providedHash) → bool`; emits `HashAnchored`, `RecordVerified`.
3. **AuditContract** (or events on the two above) — records every access decision and state change; the emitted event log *is* the immutable audit trail. For efficiency, audit batches may be committed as a periodic Merkle root.

All three are unit-tested with Hardhat before integration.

## 16. Security Implementation

- **Hashing:** canonicalise the record (stable field ordering/serialisation) before SHA-256 so equal records always hash equally.
- **Encryption:** AES-256-GCM per sensitive field; store IV + auth tag; keys held outside the DB.
- **Auth:** Argon2 password hashing; JWT with short expiry; idle-timeout auto-logoff (FR-AUTH-4).
- **Access:** application calls `RBACContract.checkAccess` before every protected operation; deny-by-default.
- **Audit:** every decision and state change emits an on-chain event; UI surfaces VERIFIED/TAMPERED.
- **Key management:** documented generation, storage, rotation (NFR-SEC-6).

## 17. Increment-by-Increment Work Plan

Mirrors dissertation §3.5 exactly:

**Increment 1 — Core record management + off-chain encrypted store**
Auth, user/role data model, patient registration, encounter/vitals/prescription CRUD, AES-256 field encryption, base UI. *Exit:* a working EHR with encrypted storage (no chain yet).

**Increment 2 — Blockchain integrity layer**
SHA-256 hashing of records, `IntegrityAnchorContract`, anchoring on create/update, on-demand verification, VERIFIED/TAMPERED UI, version history. *Exit:* tampering with a stored record is detectable.

**Increment 3 — RBAC engine + smart-contract permission checks + consent + on-chain audit**
`RBACContract`, all six roles enforced via `checkAccess`, deny-by-default, consent grant/revoke, on-chain audit events, patient access-log view. *Exit:* role-violating access is denied and logged.

**Increment 4 — Integration, hardening, evaluation**
Full integration, security testing (tamper + unauthorised-access scenarios), performance measurement (verification time, commit latency), usability study, bug-fixing. *Exit:* evaluated artefact + Chapter 4 results.

## 18. Testing Plan

Aligned with dissertation §3.9:

- **Unit testing** — hashing routine, verification routine, permission-check logic, encryption/decryption, smart-contract functions.
- **Integration testing** — application ↔ off-chain store ↔ ledger: a record committed through the app is correctly hashed, anchored and later verified.
- **Functional testing** — each role can perform exactly its permitted operations and no others (drives the role-permission matrix).
- **Security testing** — deliberately modify records at the storage layer (expect TAMPERED); attempt role-violating access (expect deny). These directly feed the O4 metrics.

## 19. Evaluation Plan

Quantitative, per dissertation Table 3.4:

| Metric                              | How measured                                                                       | Target         |
| ----------------------------------- | ---------------------------------------------------------------------------------- | -------------- |
| Tamper-detection rate               | N tampered records, count correctly flagged                                        | 100%           |
| Unauthorised-access-prevention rate | N role-violating attempts, count denied                                            | 100%           |
| Hash-verification time              | Repeated timed verifications, report mean ± dispersion                            | report; ≤ 2 s |
| Transaction-commit latency          | Repeated timed anchorings, report mean ± dispersion                               | report         |
| Usability score                     | Post-use TAM questionnaire (perceived usefulness + ease of use), descriptive stats | report         |

Construct an explicit test-case set for the first two metrics so the result is reproducible and defensible.

## 20. Risk Management

| Risk                                          | Impact              | Mitigation                                                                                               |
| --------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------- |
| Blockchain latency slows commits              | Performance, UX     | Anchor asynchronously; off-chain store stays responsive; report latency honestly as a measured trade-off |
| Key-management complexity                     | Security flaw       | Keep keys out of DB; document procedure; keep scope to standard algorithms                               |
| Scope creep (mobile, multi-facility, billing) | Missed deadline     | Hold the §1.2 exclusions firm; defer extras to "further study"                                          |
| Power/connectivity gaps (local setting)       | Availability        | Local-first operation; deferred commit queue (NFR-REL-3, NFR-ENV-1)                                      |
| Off-chain/on-chain inconsistency              | Integrity confusion | Strong linkage (`anchor_tx_id`); reconciliation check                                                  |
| Late integration failure                      | Project risk        | Iterative increments retire integration risk early (§17)                                                |
| Role/scope mismatch with dissertation         | Viva credibility    | Reconcile Lab Technician into §1.5, Tables 3.1 & 3.2 before defence                                     |

## 21. Indicative Timeline

Week-based so you can map it onto your remaining calendar (adjust to your submission date):

| Phase                                                            | Weeks  | Output                   |
| ---------------------------------------------------------------- | ------ | ------------------------ |
| Requirements finalisation + UML (use-case, class, sequence, ERD) | 1–2   | Design models for Ch4    |
| Increment 1 — core + encrypted store                            | 3–5   | Working base EHR         |
| Increment 2 — integrity layer                                   | 6–8   | Tamper-evident records   |
| Increment 3 — RBAC + consent + audit                            | 9–11  | Enforced six-role access |
| Increment 4 — integration + hardening                           | 12–13 | Stable integrated system |
| Evaluation (security, performance, usability)                    | 14–15 | Ch4 results/data         |
| Write-up of Chapter 4 + buffer                                   | 16     | Chapter 4 + revisions    |

## 22. Deliverables Checklist

- [ ] Reconciled dissertation (§1.5, Table 3.1, Table 3.2 include Lab Technician)
- [ ] UML use-case, class and sequence diagrams + ERD
- [ ] Working prototype (six roles, integrity layer, RBAC, audit)
- [ ] Smart contracts (RBAC, integrity, audit) with unit tests
- [ ] Test-case set for tamper-detection and unauthorised-access
- [ ] Evaluation results table (the five metrics)
- [ ] TAM usability questionnaire + analysed responses
- [ ] Backup-and-recovery plan (written)
- [ ] Git repository with full history

---

*End of document.*
