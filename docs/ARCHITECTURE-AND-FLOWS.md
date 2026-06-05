# Sideline Star — Architecture & User Flows

Visual reference for how the platform is structured and how each role moves through it.
Diagrams use [Mermaid](https://mermaid.js.org) and render automatically on GitHub.

---

## 1. Roles & who reports to whom

```mermaid
graph TD
    GM["🛠️ God Mode<br/>(super admin — platform owner)"]
    SP["🏢 Service Provider<br/>(runs evals for client associations)"]
    A["🏒 Association<br/>(a hockey club / minor org)"]
    D["📋 Director<br/>(runs eval for assigned age categories)"]
    E["⭐ Evaluator<br/>(scores athletes rink-side)"]
    V["✅ Volunteer<br/>(check-in only)"]
    P["👪 Parent<br/>(schedule + player report)"]

    GM -->|creates / approves| SP
    GM -->|creates / approves| A
    SP -->|onboards as client| A
    A -->|assigns| D
    A -->|invites / join code| E
    SP -->|shared evaluator pool| E
    A -->|invites| V
    A -->|registers athletes for| P

    classDef owner fill:#0b5cd6,color:#fff,stroke:#0b5cd6
    classDef mid fill:#eaf1fe,color:#101113,stroke:#0b5cd6
    class GM owner
    class SP,A mid
```

**Two onboarding paths for an association**
- **SP-managed:** a Service Provider creates the association as a client (SP approves).
- **Independent:** an association signs itself up and **God Mode** approves it.

---

## 2. System map (where things live)

```mermaid
graph LR
    subgraph Clients
      EVAL[Evaluator tablet<br/>live scoring · offline]
      ADM[Admin / Director<br/>dashboards]
      PARENT[Parent<br/>report link]
    end

    subgraph App[Next.js App · Vercel]
      UI[Dashboards & scoring UI]
      API[API routes<br/>/api/*]
      LIB[Core libs<br/>rankings · scoring · invites · scheduleNotify · rosterImport]
    end

    DB[(Neon Postgres)]
    MAIL[Resend<br/>transactional email]
    SW[Service Worker<br/>offline cache + bg sync]

    EVAL --> UI
    ADM --> UI
    PARENT --> UI
    UI --> API
    API --> LIB
    LIB --> DB
    API --> MAIL
    EVAL -. caches .-> SW
    SW -. syncs .-> API
```

**Single source of truth:** the `evaluation_schedule` table is shared — when an association/director edits it, the Service Provider's Master Schedule sees the same rows instantly (no copy/sync).

---

## 3. Onboarding flow (SP → association → director → evaluators)

```mermaid
sequenceDiagram
    participant SP as Service Provider
    participant SYS as Sideline Star
    participant AA as Association Admin
    participant DIR as Director
    participant EV as Evaluator

    SP->>SYS: New Client (org name + contact)
    SYS->>AA: Invite email → "Finish setting up" link
    AA->>SYS: Set password, account active
    AA->>SYS: Create age category → Setup wizard
    Note over AA,SYS: Sessions · Scoring · Athletes (RAMP/TeamSnap CSV) · Schedule
    AA->>SYS: Schedule uploaded
    SYS-->>SP: Master Schedule auto-populated
    AA->>DIR: Assign director to category
    AA->>EV: Share join code / invite
    EV->>SYS: Join pool (pending → approved)
    EV->>SYS: Sign up for sessions
```

---

## 4. Evaluation lifecycle (game day → teams)

```mermaid
graph TD
    S1[Athletes registered<br/>roster imported] --> S2[Session scheduled]
    S2 --> S3[Volunteer checks players in<br/>jersey / team color]
    S3 --> S4[Evaluators score live<br/>offline-capable]
    S4 --> S5[Rankings auto-compute<br/>lib/rankings.js]
    S5 --> S6{Flags / consensus<br/>review}
    S6 -->|disagreement| S4
    S6 -->|ok| S7[Build final teams]
    S5 --> S8[Player reports<br/>parents can purchase]
    S2 -.->|rink down / change| SC[Edit / cancel session]
    SC -->|notifies| NOTE[Evaluators · SP · admins · directors<br/>+ auto-offer open spots]
```

---

## 5. Live scoring + offline safety

```mermaid
graph TD
    TAP[Evaluator taps a score] --> LS[Save to device<br/>localStorage + 5 backups]
    LS --> ONLINE{Online?}
    ONLINE -->|yes| SYNC[Auto-sync to server<br/>debounced]
    ONLINE -->|no| QUEUE[Hold as 'pending'<br/>chip shows 'Offline · N on device']
    QUEUE -->|reconnect| SYNC
    SYNC --> SERVER[(Scores on server)]
    SERVER --> HYDRATE[Any device the evaluator<br/>logs into re-loads them]
    LS -.->|worst case| BK[Backup ▾ menu:<br/>Resync now · Download · Restore from file]
    BK -.-> SERVER
```

---

## 6. Key data model (simplified)

```mermaid
erDiagram
    organizations ||--o{ age_categories : has
    organizations ||--o{ sp_association_links : "SP↔association"
    age_categories ||--o{ category_sessions : "session types + weights"
    age_categories ||--o{ evaluation_schedule : "dated group sessions"
    age_categories ||--o{ athletes : roster
    age_categories ||--o{ director_assignments : directors
    evaluation_schedule ||--o{ evaluator_session_signups : signups
    evaluation_schedule ||--o{ player_checkins : checkins
    athletes ||--o{ category_scores : scored
    users ||--o{ category_scores : "by evaluator"
    users ||--o{ evaluator_memberships : "pool membership"
    users ||--o{ messages : "SP↔evaluator"
    users ||--o{ notifications : "in-app"
    users ||--o{ evaluator_unavailability : blackouts
```

> Rankings are **computed**, not stored: `lib/rankings.js` derives them from
> `category_scores` + `category_sessions` weights on demand.
