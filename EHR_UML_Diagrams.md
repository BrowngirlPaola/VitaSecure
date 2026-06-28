# System Diagrams — Secure EHR System

UML and architecture diagrams for the dissertation (Chapter 4). All four reflect the agreed stack: vanilla **HTML/CSS/JS** frontend, **Supabase Auth** (email/password) authentication, **Supabase** (Postgres + Edge Functions) backend/store, and a **permissioned EVM blockchain** for integrity anchoring and authoritative RBAC.

**How to turn these into images for Word:** open [mermaid.live](https://mermaid.live), paste a block, then *Actions → Export → PNG/SVG*. (VS Code with the *Markdown Preview Mermaid Support* extension also renders them.) Word can insert SVG directly and keep it crisp.

---

## 1. Use Case Diagram

The six roles, plus Supabase Auth and the permissioned blockchain as secondary actors, drawn as UML stick figures, with oval use cases inside the system boundary. Dashed `«include»` links show that every protected action includes Authenticate and every create/update includes Anchor Record Hash.

![Use Case Diagram — Secure EHR System](EHR_UseCase_Diagram.svg)

> Keep `EHR_UseCase_Diagram.svg` in the same folder as this file so the image resolves. For the dissertation, insert that SVG into Word directly (it stays sharp at any size).

---

## 2. Sequence Diagrams

Four scenarios covering the main flows — a write, a read, an integrity check, and a cross-role workflow. Together they exercise authentication, on-chain authorization (both permit and deny), encryption, hashing/anchoring, and tamper detection.

### 2.1 Doctor Creates a Clinical Encounter

The core write pipeline: authenticate, authorize on-chain, encrypt, store, hash, anchor, audit. The `alt` fragment shows both the permitted and denied paths.

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#ffffff','primaryBorderColor':'#000000','primaryTextColor':'#000000','lineColor':'#000000','textColor':'#000000','actorBkg':'#ffffff','actorBorder':'#000000','actorTextColor':'#000000','actorLineColor':'#000000','signalColor':'#000000','signalTextColor':'#000000','labelBoxBkgColor':'#ffffff','labelBoxBorderColor':'#000000','labelTextColor':'#000000','loopTextColor':'#000000','noteBkgColor':'#ffffff','noteBorderColor':'#000000','noteTextColor':'#000000','sequenceNumberColor':'#000000','altBackground':'#ffffff'}}}%%
sequenceDiagram
  actor D as Doctor
  participant FE as Frontend (Browser)
  participant SB as Supabase Auth
  participant EF as Edge Function (create-record)
  participant RB as RBAC Contract
  participant DB as Supabase Postgres
  participant IA as IntegrityAnchor Contract

  D->>FE: Fill encounter form & submit
  FE->>SB: getSession()
  SB-->>FE: Supabase JWT (access token, user_role claim)
  FE->>EF: POST /create-record (JWT, data)
  EF->>EF: Verify JWT (Supabase secret), extract sub and user_role = doctor
  EF->>RB: checkAccess(doctor, create, encounter)

  alt Access permitted
    RB-->>EF: PERMIT
    EF->>EF: Canonicalise, AES-256 encrypt, SHA-256 hash
    EF->>DB: INSERT encrypted record (version 1)
    DB-->>EF: record_id
    EF->>IA: anchorHash(record_id, type, hash, author, v1)
    IA-->>EF: tx receipt (anchor_tx_id)
    EF->>DB: UPDATE record SET anchor_tx_id
    EF->>IA: emit AuditEvent(create)
    EF-->>FE: 201 Created (record_id, VERIFIED)
    FE-->>D: Show confirmation + integrity badge
  else Access denied
    RB-->>EF: DENY
    EF->>IA: emit AuditEvent(access_denied)
    EF-->>FE: 403 Forbidden
    FE-->>D: Access denied message
  end
```

### 2.2 Retrieve a Record (read pipeline + RBAC)

A nurse opens a record. The read path authorizes on-chain, fetches the ciphertext, decrypts server-side, and logs the access. The denied branch demonstrates unauthorised-access prevention.

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#ffffff','primaryBorderColor':'#000000','primaryTextColor':'#000000','lineColor':'#000000','textColor':'#000000','actorBkg':'#ffffff','actorBorder':'#000000','actorTextColor':'#000000','actorLineColor':'#000000','signalColor':'#000000','signalTextColor':'#000000','labelBoxBkgColor':'#ffffff','labelBoxBorderColor':'#000000','labelTextColor':'#000000','loopTextColor':'#000000','noteBkgColor':'#ffffff','noteBorderColor':'#000000','noteTextColor':'#000000','sequenceNumberColor':'#000000','altBackground':'#ffffff'}}}%%
sequenceDiagram
  actor N as Nurse
  participant FE as Frontend (Browser)
  participant SB as Supabase Auth
  participant EF as Edge Function (read-record)
  participant RB as RBAC Contract
  participant DB as Supabase Postgres
  participant AU as Audit Log (on-chain)

  N->>FE: Open patient record
  FE->>SB: getSession()
  SB-->>FE: Supabase JWT (access token, user_role claim)
  FE->>EF: GET /read-record (JWT, record_id)
  EF->>EF: Verify JWT (Supabase secret), extract sub and user_role = nurse
  EF->>RB: checkAccess(nurse, read, vitals)

  alt Access permitted
    RB-->>EF: PERMIT
    EF->>DB: SELECT encrypted record
    DB-->>EF: Ciphertext row
    EF->>EF: AES-256 decrypt
    EF->>AU: emit AuditEvent(read)
    EF-->>FE: 200 OK (record)
    FE-->>N: Display record
  else Access denied
    RB-->>EF: DENY
    EF->>AU: emit AuditEvent(access_denied)
    EF-->>FE: 403 Forbidden
    FE-->>N: Access denied message
  end
```

### 2.3 Verify Record Integrity (tamper detection)

The flow that produces the tamper-detection metric: the stored record is decrypted, re-hashed, and compared with the hash anchored on-chain. Matching hashes return VERIFIED; a mismatch returns TAMPERED and is logged.

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#ffffff','primaryBorderColor':'#000000','primaryTextColor':'#000000','lineColor':'#000000','textColor':'#000000','actorBkg':'#ffffff','actorBorder':'#000000','actorTextColor':'#000000','actorLineColor':'#000000','signalColor':'#000000','signalTextColor':'#000000','labelBoxBkgColor':'#ffffff','labelBoxBorderColor':'#000000','labelTextColor':'#000000','loopTextColor':'#000000','noteBkgColor':'#ffffff','noteBorderColor':'#000000','noteTextColor':'#000000','sequenceNumberColor':'#000000','altBackground':'#ffffff'}}}%%
sequenceDiagram
  actor D as Doctor
  participant FE as Frontend (Browser)
  participant SB as Supabase Auth
  participant EF as Edge Function (verify-integrity)
  participant DB as Supabase Postgres
  participant IA as IntegrityAnchor Contract
  participant AU as Audit Log (on-chain)

  D->>FE: Click "Verify integrity" on a record
  FE->>SB: getSession()
  SB-->>FE: Supabase JWT (access token, user_role claim)
  FE->>EF: POST /verify-integrity (JWT, record_id, version)
  EF->>EF: Verify JWT (Supabase secret), extract sub and user_role = doctor
  EF->>DB: SELECT encrypted record (version)
  DB-->>EF: Ciphertext row
  EF->>EF: Decrypt, canonicalise, recompute SHA-256
  EF->>IA: getAnchor(record_id, version)
  IA-->>EF: Stored hash

  alt Hashes match
    EF-->>FE: VERIFIED
    FE-->>D: Show VERIFIED badge
  else Hashes differ
    EF->>AU: emit AuditEvent(tamper_detected)
    EF-->>FE: TAMPERED
    FE-->>D: Show TAMPERED warning
  end
```

### 2.4 Lab Order to Result Workflow (multi-role)

A cross-role flow: a doctor orders a test, then a lab technician picks it up and uploads the result. Each write is hashed and anchored; the order status is updated on completion.

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#ffffff','primaryBorderColor':'#000000','primaryTextColor':'#000000','lineColor':'#000000','textColor':'#000000','actorBkg':'#ffffff','actorBorder':'#000000','actorTextColor':'#000000','actorLineColor':'#000000','signalColor':'#000000','signalTextColor':'#000000','labelBoxBkgColor':'#ffffff','labelBoxBorderColor':'#000000','labelTextColor':'#000000','loopTextColor':'#000000','noteBkgColor':'#ffffff','noteBorderColor':'#000000','noteTextColor':'#000000','sequenceNumberColor':'#000000','altBackground':'#ffffff'}}}%%
sequenceDiagram
  actor D as Doctor
  actor L as Lab Technician
  participant FE as Frontend (Browser)
  participant EF as Edge Function
  participant RB as RBAC Contract
  participant DB as Supabase Postgres
  participant IA as IntegrityAnchor Contract

  Note over D,IA: Phase 1 — Doctor orders the test
  D->>FE: Order lab test (during encounter)
  FE->>EF: POST /create-record (token, lab_order)
  EF->>RB: checkAccess(doctor, create, lab_order)
  RB-->>EF: PERMIT
  EF->>DB: INSERT lab order (status = ordered)
  EF->>IA: anchorHash(order)
  IA-->>EF: tx receipt
  EF-->>FE: Order created

  Note over D,IA: Phase 2 — Lab technician fulfils the order
  L->>FE: Open lab order queue
  FE->>EF: GET /read-record (token, lab orders)
  EF->>RB: checkAccess(labtech, read, lab_order)
  RB-->>EF: PERMIT
  EF->>DB: SELECT pending orders
  DB-->>EF: Order list
  EF-->>FE: Display queue
  L->>FE: Upload result for order
  FE->>EF: POST /create-record (token, lab_result, order_id)
  EF->>RB: checkAccess(labtech, create, lab_result)
  RB-->>EF: PERMIT
  EF->>EF: Encrypt + SHA-256 hash
  EF->>DB: INSERT lab result, UPDATE order status = completed
  EF->>IA: anchorHash(result) + emit AuditEvent
  IA-->>EF: tx receipt
  EF-->>FE: Result saved (VERIFIED)
```

---

## 3. Component Diagram

The deployable components and the interfaces between them — useful for showing separation of concerns and that only the Edge Functions component bears the blockchain and crypto responsibilities.

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#ffffff','primaryBorderColor':'#000000','primaryTextColor':'#000000','secondaryColor':'#ffffff','tertiaryColor':'#ffffff','lineColor':'#000000','textColor':'#000000','mainBkg':'#ffffff','clusterBkg':'#ffffff','clusterBorder':'#000000','edgeLabelBackground':'#ffffff'}}}%%
flowchart LR
  subgraph Client["«component» Frontend"]
    direction TB
    Pages["Role Pages"]
    AuthC["Supabase Auth Client"]
    DataC["Supabase Client"]
    ApiC["API Wrapper"]
  end

  subgraph Backend["«component» Edge Functions"]
    direction TB
    RecSvc["Record Service"]
    IntSvc["Integrity Service"]
    RbacSvc["RBAC Service"]
    CryptoM["Crypto Module"]
    ChainM["Chain Module"]
    AuditM["Audit Module"]
  end

  subgraph Data["«component» Data Store"]
    Tables["Postgres Tables + RLS"]
  end

  subgraph Chain["«component» Smart Contracts"]
    RBACc["RBAC.sol"]
    IAc["IntegrityAnchor.sol"]
    AUDc["Audit.sol"]
  end

  SupaAuth{{"«external» Supabase Auth"}}

  AuthC -->|"auth API (email/password)"| SupaAuth
  DataC -->|"obtain JWT"| SupaAuth
  ApiC -->|"REST / HTTPS"| RecSvc
  ApiC -->|"REST / HTTPS"| IntSvc
  RecSvc --> CryptoM
  RecSvc --> ChainM
  RecSvc --> AuditM
  IntSvc --> ChainM
  RbacSvc --> ChainM
  RecSvc -->|"SQL"| Tables
  IntSvc -->|"SQL"| Tables
  ChainM -->|"JSON-RPC"| RBACc
  ChainM -->|"JSON-RPC"| IAc
  ChainM -->|"JSON-RPC"| AUDc
  DataC -->|"RLS-guarded reads"| Tables
```

---

## 4. Class Diagram

The domain model. Clinical records (Encounter, Vitals, LabResult, Prescription) inherit from an abstract `VerifiableRecord` that carries the version, hash, and on-chain anchor reference plus the `computeHash()` / `verifyIntegrity()` behaviour — so integrity is a shared, reusable property rather than repeated per class. Each verifiable record is anchored by exactly one `IntegrityAnchor`.

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#ffffff','primaryBorderColor':'#000000','primaryTextColor':'#000000','lineColor':'#000000','textColor':'#000000','mainBkg':'#ffffff','classText':'#000000'}}}%%
classDiagram
  class Role {
    <<enumeration>>
    ADMIN
    DOCTOR
    NURSE
    LAB_TECHNICIAN
    RECEPTIONIST
    PATIENT
  }

  class User {
    +authUserId: string
    +username: string
    +role: Role
    +status: string
    +createdAt: datetime
  }

  class Patient {
    +patientId: string
    +mrn: string
    +fullName: string
    +dob: date
    +sex: string
    +contact: string
    +chartStatus: string
  }

  class Appointment {
    +appointmentId: string
    +datetime: datetime
    +reason: string
    +status: string
  }

  class VerifiableRecord {
    <<abstract>>
    +version: int
    +recordHash: string
    +anchorTxId: string
    +computeHash() string
    +verifyIntegrity() bool
  }

  class Encounter {
    +encounterId: string
    +datetime: datetime
    +chiefComplaint: string
    +diagnosis: string
    +progressNote: string
  }

  class Vitals {
    +vitalsId: string
    +temperature: float
    +bloodPressure: string
    +heartRate: int
    +respRate: int
    +weight: float
    +note: string
  }

  class Allergy {
    +allergyId: string
    +substance: string
    +reaction: string
    +severity: string
  }

  class LabOrder {
    +orderId: string
    +testType: string
    +priority: string
    +status: string
    +createdAt: datetime
  }

  class LabResult {
    +resultId: string
    +resultPayload: string
    +attachmentRef: string
    +completedAt: datetime
  }

  class Prescription {
    +prescriptionId: string
    +drug: string
    +dose: string
    +frequency: string
    +duration: string
  }

  class ConsentRecord {
    +consentId: string
    +scope: string
    +grantedTo: string
    +grantedAt: datetime
    +revokedAt: datetime
  }

  class AuditEvent {
    +logId: string
    +action: string
    +objectType: string
    +objectId: string
    +outcome: string
    +timestamp: datetime
    +anchorTxId: string
  }

  class IntegrityAnchor {
    +recordId: string
    +recordType: string
    +sha256Hash: string
    +authorId: string
    +version: int
    +timestamp: datetime
  }

  VerifiableRecord <|-- Encounter
  VerifiableRecord <|-- Vitals
  VerifiableRecord <|-- LabResult
  VerifiableRecord <|-- Prescription

  User "1" --> "0..1" Patient : profile
  User "1" --> "*" AuditEvent : performs
  Patient "1" --> "*" Encounter : has
  Patient "1" --> "*" Appointment : books
  Patient "1" --> "*" Vitals : has
  Patient "1" --> "*" Allergy : has
  Patient "1" --> "*" Prescription : receives
  Patient "1" --> "*" ConsentRecord : controls
  Encounter "1" --> "*" LabOrder : generates
  LabOrder "1" --> "1" LabResult : produces
  Encounter "1" --> "*" Prescription : includes
  VerifiableRecord "1" --> "1" IntegrityAnchor : anchored by
```

---

*End of document.*
