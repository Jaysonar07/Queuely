# Clinic Queue Manager Technical & Product Specification

**Version:** 1.0.0  
**Author:** AI Product Designer & Front-End Architect  
**Status:** Approved for Core Development  
**Target Environments:** Tablet/Desktop (Screen A — Receptionist), Large LED TV/Kiosk (Screen B — Patient Waiting Room Display)

---

## 1) Role & Objective
You are designing a high-reliability, low-latency, and highly visual dual-screen **Clinic Queue Manager** application. The single objective of this product is to optimize patient flow and decrease perceived wait times by synchronizing the receptionist control console and the lobby display TV in real-time, backed by a deterministic wait-time estimation engine.

---

## 2) User Personas

### Receptionist (Front-Desk Coordinator)
*   **Primary Goals:** 
    *   Register walk-in and pre-scheduled patients into the digital queue within 30 seconds.
    *   Summon the next waiting patient to the appropriate consulting room with a single primary cursor tab or click.
    *   Monitor the overall clinic volume to quickly adjust pacing.
*   **Main Pain Points:**
    *   High cognitive overhead: Managing telephone inquiries and check-ins while manually keeping track of patient orders.
    *   Friction with anxious patients who repeatedly ask "How much longer?" due to a lack of transparency.
*   **Success Metrics:**
    *   Patient intake registration completed in under 45 seconds.
    *   Zero manual order-tracking errors/mismatch between lobby display and current practitioner status.

### Patient / Waiting-Room Viewer
*   **Primary Goals:**
    *   Clearly see their standing in the clinical queue from 15+ feet away on a dark, high-contrast wall monitor.
    *   Know the estimated wait time (EWT) dynamically calculated and updated based on actual clinic throughput.
    *   Easily distinguish when their number or partial name is summoned so they don't miss their slot.
*   **Main Pain Points:**
    *   "Wait anxiety": Feeling neglected or forgotten due to indeterminate and uncommunicated wait times.
    *   Difficulty reading screens because of poor color contrast, tiny text, or visually cluttered interfaces.
*   **Success Metrics:**
    *   Patient anxiety regarding wait times reduced by 40% (reported through post-visit surveys).
    *   0% missed consults due to missed or misheard lobby announcements.

---

## 3) Core Principles

1.  **Dominant Primary Action:** Screen A (Receptionist Console) must center its entire design hierarchy around a single, highly emphasized action: the **Call Next** trigger. It must bypass auxiliary buttons to control flow quickly and minimize human error.
2.  **Minimal Zones per Screen:** To avoid sensory overload and visual noise, interfaces must adhere to a strict three-zone layout constraint, using generous whitespace and clear spacing variations. No deep nested drawers or complex navigation.
3.  **Real-Time Single Source of Truth:** All updates to the queue are synchronized immediately between Screen A and Screen B via low-friction, same-origin APIs, ensuring instantaneous lobby-wide updates whenever the receptionist takes action.
4.  **Progressive Enhancement for Network Loss:** The application is architected to be "offline-resilient". In the event of loss of connectivity, local queues buffer state changes, display prominent warning badges without breaking, and auto-reconcile using optimistic locking sequence IDs once network returns.
5.  **Accessibility & Legibility on TV/Kiosk:** Screen B must be readable by patients with visually impaired conditions from a distance. Primary text must use high-contrast text layout sizing, large typography metrics, overscan-safe margins, and a single, high-contrast color scheme (dark mode default to keep display fatigue low).

---

## 4) Two-Screen UI Specification

### Screen A — Receptionist Dashboard (Admin Console)

#### Layout Guidance
*   **Structure:** Responsive two-column split.
    *   **Left Column (35% width on desktop):** Zone 1 — Quick-Add Patient Form. Fits comfortably as a static card with strong vertical stacking.
    *   **Right Column (65% width on desktop):** Stacked vertically into Zone 2 (Call Next Hero Area - Top 40% height) and Zone 3 (Active Queue List and Timeline History - Bottom 60% height).
*   **Spacing & Theme:** Light slate base palette (`bg-slate-50` with high-contrast `bg-white` panels). Margins are styled with standard layout rhythm (`space-y-6`, `p-6`). Focus indicators are clear indigo borders with custom double outlines for accessibility.

#### Component Breakdown

##### Zone 1: Add Patient Card
*   **Fields & Control Types:**
    *   `patientName` (Text field, autocomplete: off, placeholder: "e.g. John Doe"). Required.
    *   `patientPhone` (Tel input with country code mask, e.g., "+1 (555) 000-0000"). Optional.
*   **Validation Rules:**
    *   Name: Must be trimmed. Minimum 2 characters, maximum 50 characters. Special characters allowed (hyphens, apostrophes) but no script injection.
    *   Phone: Must match global phone regex if supplied; otherwise, flagged as empty.
*   **Button UI:** Block-level "Add Patient to Queue" button. Heavy solid fill (`bg-indigo-600` transition to `bg-indigo-700` on hover, scale down `active:scale-98`). Disabled state uses `bg-slate-200 text-slate-400 cursor-not-allowed`.
*   **Keyboard Shortcuts:** Pressing `Ctrl + N` automatically transfers focus to the `patientName` input field. Pressing `Enter` on any active form field submits immediately if valid.
*   **Microcopy:** *"Fill in full patient initials or legal name. Phone number is optional, used exclusively for automated arrival SMS confirmations."*

##### Zone 2: Call Next Hero Area
*   **Visual Dominance:** A giant central circle with pulsing aura ring (`animate-pulse` on active state) containing the primary "CALL NEXT" action.
*   **Control States:** 
    *   **Default:** Bright indigo core (`bg-indigo-600`), large white text, 64px `UserCheck` or `Volume2` icon. Hover shifts to deep royal blue (`bg-indigo-700`).
    *   **Disabled:** If no patients are waiting in the queue, transitions immediately to disabled state (`bg-slate-100 text-slate-300 border-slate-200 border border-dashed`). Only microcopy is shown: "Waiting Room Empty".
*   **Undo Pattern:** Clicking "Call Next" triggers an immediate optimistic transition, but overlays a high-vibrancy notice bar at the bottom center of Zone 2 with a 10-second visual countdown slider. Re-clicking "Undo Call" rolls back the state safely.
*   **Consultation Time Controls:** Shows the *Currently Serving Patient Name* in bold display type, next to an active, glowing live elapsed time clock (e.g., `04:12` in JetBrains Mono). Below this, a standard Number Input allows the manual override of default estimated consultation times (`manualAvgMinutes`, default 15 minutes, step 1, min 5, max 60).

##### Zone 3: Queue & History Timeline
*   **Active Queue List:** Lists all pending tokens in order of entry. Left margin features large, clear tickets (e.g. "`A102`"). Hover actions let the receptionist cancel the slot or drag-reorder (with secure local state swapping).
*   **History Tab:** Chronological logs of served patient tokens with their respective start times and total durations (e.g., "A101 - Duration: 14 min 32s").

#### Accessibility Details
*   **Focus Order:** Logical tab layout flowing strictly top-to-bottom, left-to-right: `patientName` $\rightarrow$ `patientPhone` $\rightarrow$ `Add Button` $\rightarrow$ `Call Next Circle` $\rightarrow$ `Undo Banner` $\rightarrow$ `Consultation Duration Input`.
*   **ARIA Attributes:** Form utilizes `role="form"`, `aria-describedby="phone-microcopy"`. Live updates alert screen readers with `aria-live="polite"` on the Called Patient block.
*   **High-Contrast Token Roles:** Status chips use explicit high-contrast colors (Waiting = Amber, Serving = green, Served = Slate, Cancelled = Red). Color tokens are validated for a minimum contrast ratio of 4.5:1.

#### Error & Edge Cases UI
*   **Empty Queue state:** Centered, illustration-backed state explaining "No Patients Waiting. Share your registration URL or add a patient manually above."
*   **Offline Mode Indicator:** When navigator connectivity status is lost, a red absolute top utility banner slides down with text: `"⚠️ OFFLINE: Updates are tracking in offline cache and will merge automatically when reconnected."`
*   **Sync Conflict Overlay:** A non-intrusive indicator telling the receptionist: `"🔄 Concurrency Notice: Double call detected. Reconciled state under Master Sequence #024."`

---

### Screen B — Patient Waiting Room Display (TV/Kiosk)

#### Layout Guidance
*   **Scale:** Heavy full-screen container with deep midnight theme (`bg-slate-950`). High contrast text in safety regions to accommodate commercial display screens.
*   **Overscan Safe Margins:** High outer margin spacer structure: `p-12 md:p-16`. Prevents screen elements from clipping on aged TV panels.
*   **Contrast Index:** AAA level contrast ratios mapping bright white text, lime-green neon elements (`text-emerald-400`), and warm marigold highlights (`text-amber-400`) over deep charcoal backdrops.

#### Component Breakdown

##### Component B1: Current Serving Card (Primary Left)
*   Occupies 60% of horizontal layout.
*   **Layout:** Vertical stacking inside a stylized gradient card with massive lettering.
*   **Content:** Large labeling `"NOW IN CONSULTATION"` in high-tracking uppercase. Below it, the giant highlighted ticket number (e.g., **A103**) is shown in a custom display font sizing (`text-9xl` or 144px). The patient name is masked for privacy protection: `"John D."` instead of `"John Doe"`.
*   **Visual Alert Rule:** When a new patient is called, this card initiates a high-visibility transition:
    1.  The card background turns a vibrant highlight color (`bg-indigo-900`/`emerald-900`) for 2 seconds.
    2.  The text flashes twice (alternating opacity via `animate-flash` or custom frame transitions).
    3.  A gentle auditory double-chime is synthesized through the browser's audio interface (Web Audio or SpeechSynthesis option).

##### Component B2: Queue Timeline List (Next Up Column)
*   Occupies 40% of horizontal layout.
*   **Layout:** Stacks the next 3 or 4 ticket numbers in clear vertical sequence lanes.
*   **Content:** Large title `"COMPANIES / PATIENTS UP NEXT"` with corresponding badges (`A104`, `A105`, `A106`). Underneath, a smaller tracking text shows estimated wait times individually for each slot (e.g., *"In ~15 min"*, *"In ~30 min"*).

##### Component B3: Estimation Metrics Panel (Bottom Row Footer)
*   **Estimated Wait Time (EWT) Alert:** Left grid block showing large neon typography: `"Lobby Estimated Wait Time: ~14 minutes"`.
*   **Timestamp / Activity tracker:** Monospace real-time clock in the bottom corner keeping patient displays feeling active and synchronized: `"System Synchronized: 10:46:15"`.
*   **Footer Instruction:** High tracking ticker tape scroll or centered line: `"If your number is called, please proceed directly to Consulting Room 1. Need assistance? Call our clinic desk at (555) 012-3456."`

#### Visual Alert Rules
*   **Transition Chime:** When state shifts, trigger the Web Audio API with a polite pentatonic note combination (e.g., frequencies `523.25Hz` [C5] and `659.25Hz` [E5] sequentially) or a text-to-speech call: `"Now serving token A-1-0-3"`.
*   **Empty State:** If both waiting list and served tokens are null, Screen B renders a large, relaxing, branded screen with animated message: `"All patients are currently served. Thank you for your patience! Welcome to Clinic Central."` with standard clock widget.

#### Offline & Stale Status Cues
*   If the browser tab loses heartbeat response (last synchronized >20 seconds ago), Screen B does not show an ugly error stack. Instead, a clean, low-profile orange text ticker fades in over the footer: `"⚠️ Notice: Retrying live network sync... Wait times may vary temporarily."`

---

## 5) Shared State & Live Sync Architecture

All views must maintain complete state accuracy. We construct a multi-channel synchronization scheme.

### State Model JSON Schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ClinicQueueState",
  "type": "object",
  "required": [
    "currentToken",
    "queue",
    "history",
    "receptionistConfig",
    "lastUpdated",
    "version"
  ],
  "properties": {
    "currentToken": {
      "type": ["object", "null"],
      "properties": {
        "id": { "type": "string" },
        "ticketNumber": { "type": "string" },
        "patientName": { "type": "string" },
        "patientPhone": { "type": "string" },
        "addedAt": { "type": "string", "format": "date-time" },
        "status": { "type": "string", "enum": ["serving"] },
        "calledAt": { "type": "string", "format": "date-time" }
      },
      "required": ["id", "ticketNumber", "patientName", "addedAt", "status", "calledAt"]
    },
    "queue": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "ticketNumber": { "type": "string" },
          "patientName": { "type": "string" },
          "patientPhone": { "type": "string" },
          "addedAt": { "type": "string", "format": "date-time" },
          "status": { "type": "string", "enum": ["waiting", "called"] }
        },
        "required": ["id", "ticketNumber", "patientName", "addedAt", "status"]
      }
    },
    "history": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "tokenId": { "type": "string" },
          "ticketNumber": { "type": "string" },
          "durationSeconds": { "type": "integer" },
          "startedAt": { "type": "string", "format": "date-time" },
          "endedAt": { "type": "string", "format": "date-time" }
        },
        "required": ["tokenId", "ticketNumber", "durationSeconds", "startedAt", "endedAt"]
      }
    },
    "receptionistConfig": {
      "type": "object",
      "properties": {
        "manualAvgMinutes": { "type": "integer", "minimum": 5, "maximum": 60 }
      },
      "required": ["manualAvgMinutes"]
    },
    "lastUpdated": { "type": "string", "format": "date-time" },
    "version": { "type": "integer" }
  }
}
```

### Real-Time Sync Strategy
1.  **Broadcasting Layer (Same-Origin):** We instantiate a browser-native window syncing channel via `new BroadcastChannel('clinic_queue_channel')`. Whenever a mutation is triggered in Screen A, it pushes a transaction packet containing the updated global state to the channel. Screen B listens to this channel and renders revisions with sub-millisecond lag.
2.  **Multi-Device Linkage Fallback:** Since TVs may run on separate physical networks or separate machines/kiosks, WebSocket links should act as the master transport. When connection goes dry, the platform falls back to an API Short Polling pipeline (Interval: 3000ms, with Jitter calculations of +/- 500ms to disperse request peaks).

### Concurrency & Conflict Resolution Rules
*   **Sequence Index Matching:** Every action increment is bundled with a sequential `version` number.
*   **The Double-Call Conflict Scenario:** If Receptionist A and Receptionist B hit "Call Next" at the exact same physical second:
    1.  The client executes local state changes optimistically.
    2.  The action is pushed to the server (or master Broadcaster).
    3.  If the server identifies that a concurrent state adjustment has already processed (the remote state has a superior `version`), the server rejects receptionist B's stale index modification.
    4.  Receptionist B's dashboard receives the corrected sync data, reverses its local optimistic state change, and triggers an overlay warning explaining that the patient is already being served by Receptionist A.
    5.  Master version rule: **Superior Sequence ID Wins.** If sequence IDs align, the earliest timestamp client record wins.

### Double-Click & Debounce Safeguard
To guarantee zero skip intervals in fast pacing scenarios:
*   **Immediate UI Locking:** Once the receptionist clicks `Call Next` or `Add Patient`, the element is given an immediate loading locked state for exactly 500ms.
*   **Idempotency Token Tagging:** Each event dispatched carries an auto-generated client-side event UUID. If a duplicate transaction request with the identical event UUID arrives within a rolling 2-second timeout window, the system discards the secondary action.

### Reconciliation & Stale-Tab Restoration
1.  **Online Recovery Trigger:** When a tab returns from a prolonged suspension state (e.g., computer waking up), the system immediately shoots an HTTP health checkpoint verification query.
2.  **Snapshot Fetch:** It compares the local tracking `version` sequence number with the retrieved server database sequence.
3.  **Local Sync Overwrite:** If out of sync, the local store completely replaces its local collections with the latest incoming server master record. A status banner alerts the receptionist: *"Sync restored. Current queue structure synced."*

---

## 6) Wait-Time Algorithm Specification

The clinic queue system computes dynamic, accurate values of patient wait times.

### Rolling Average Structure
The system estimates patient wait time mathematically:

$$\text{EWT} = W \times \text{Average Duration}$$

Where $W$ represents the number of patients currently ahead in the queue.

For predicting the `Average Duration`, we implement a rolling **Exponential Moving Average (EMA)** model of the last $N = 10$ served patients to adapt quickly to shifting consultation paces:

$$\text{EMA}_t = \alpha \times \text{Duration}_t + (1 - \alpha) \times \text{EMA}_{t-1}$$

Where:
*   $\text{Duration}_t$ is the actual duration of the most recently finished consultation (completed in seconds).
*   $\alpha$ is the smoothing multiplier defined by the tracking index size: $\alpha = \frac{2}{N+1} = \frac{2}{11} \approx 0.1818$.
*   $\text{EMA}_{t-1}$ is the historical tracking average duration calculated immediately prior.

### Initialization & Cold-Start Rules
If the clinic has just started for the day and has sparse metrics, or there have been fewer than $C = 3$ actual served patient records recorded:
*   **Fallback Trigger:** The algorithm completely replaces EMA calculation and substitutes the current receptionist manual override value (`receptionistConfig.manualAvgMinutes * 60` in seconds).
*   **Calculation handoff:** Once the 4th patient completes consultation, the rolling average calculation begins, seeding its initial $\text{EMA}_0$ value with the manual override rating before processing new logs.

### Edge-Case Mitigation
*   **Outliers Exclusion:** Consultation durations that measure less than 1.5 minutes (accidental check-ins) or greater than 3 times the current running median (e.g., patient leaves clinic, complex emergency) are flagged as statistical noise and excluded from the EMA update stack.
*   **Spikes Smoothing:** The computed EWT is bounded to prevent sudden wild jumps:
    $$\text{EWT}_{\text{bounded}} = \max(\text{MinMinutes}, \min(\text{MaxMinutes}, \text{EWT}_{\text{raw}}))$$
    Where `MinMinutes` = 3 minutes per person ahead, and `MaxMinutes` = 45 minutes per person ahead.
*   **Uncertainty Display Representation:** Rather than displaying precise seconds to anxious waiting lobby guests, values are grouped into logical, calm buckets and labeled with clear ranges (e.g., *"approx. 15 - 20 minutes"*).

### Estimation Algorithm Pseudocode

```
Algorithm CalculatePatientEstimatedWaitTime:
    Inputs:
        queueLength (Integer) : Number of patients waiting ahead of target patient
        historyList (Array of Consultation Records) : Completed sessions with durationSeconds
        manualOverrideMinutes (Integer) : Minimal default config from receptionist dashboard
        smoothingWindow N (Integer, default 10)
    
    Output:
        estimatedWaitSeconds (Integer)

    // Step 1: Filter out outliers (keep durations between 90s and 3x running median)
    validDurationList = Array of durations from historyList
    If length of validDurationList > 3:
        medianVal = CalculateMedian(validDurationList)
        filteredHistory = Filter historyList where 90 <= durationSeconds <= (medianVal * 3)
    Else:
        filteredHistory = historyList

    // Step 2: Determine average consultation length
    avgConsultationSeconds = 0
    If length of filteredHistory < 3:
        // Use local receptionist override
        avgConsultationSeconds = manualOverrideMinutes * 60
    Else:
        // Compute EMA running across the filtered list
        alpha = 2.0 / (N + 1)
        
        // Initial seed is the manual duration
        currentEMA = manualOverrideMinutes * 60
        
        For each record in filteredHistory:
            currentEMA = (alpha * record.durationSeconds) + ((1.0 - alpha) * currentEMA)
            
        avgConsultationSeconds = currentEMA

    // Step 3: Compute raw estimation
    rawEstimate = queueLength * avgConsultationSeconds

    // Step 4: Apply safety bounds
    minLimit = queueLength * 180  // 3 minutes minimum per patient ahead
    maxLimit = queueLength * 2700 // 45 minutes maximum per patient ahead
    
    boundedEstimate = Max(minLimit, Min(maxLimit, rawEstimate))
    
    Return RoundToNearestMinute(boundedEstimate)
```

---

## 7) UX Flows & Micro-Interactions

### Flow 1: Add Patient (Receptionist Check-In)
1.  **Triggers:** Receptionist hits `Ctrl + N` or clicks the check-in card input area.
2.  **Data Input:** Keys name and optional cellular contact value. Validation runs smoothly behind typing.
3.  **Action Confirmation:** Pressing `Enter` adds the user. The check-in card triggers a spring-back border flash.
4.  **Local/Network Push:** The new token list updates optimistically. BroadcastChannel shares the state with waiting displays instantly.
5.  **Audit Log:** Dispatch event `patient_added` with client details.

### Flow 2: Call Next (Instant Summon)
1.  **Trigger:** Receptionist clicks the giant circular "Call Next" control widget.
2.  **UI Locking:** The primary button disables instantly for 500ms to ignore duplicate user clicks.
3.  **Buffer Activation:** A 10-second retractable "Undo Summon" prompt reveals at the footer.
4.  **Event Broadcast:** If not undone, transition becomes permanent. Screen B clears the active card and displays the new ticket in a massive size.
5.  **Alerting Chime:** Screen B sounds a high-visibility auditory ring.

### Flow 3: End Consultation (Cycle Transition)
1.  **Trigger:** Receptionist clicks "End Consultation" once the doctor concludes analysis.
2.  **Duration Processing:** System logs the difference (`endedAt - startedAt`), validates against outlier constraints, and updates the EMA Wait-Time algorithm metric.
3.  **State Clean Up:** Currently serving card transitions to neutral, waiting for the receptionist's next summon action.

### Flow 4: Queue Empty Lifecycle
1.  **State Check:** Queue length drops to zero.
2.  **Receptionist console view:** Shows welcoming placeholder card: *"All caught up! Excellent pacing."* Call Next button is disabled.
3.  **Lobby TV representation:** Transition screen reveals high-fidelity clock view, rotating health facts, or standard greeting: *"Welcome! The lobby is quiet. Our consult rooms are available for support."*

### Flow 5: Network Break & Offline Sync Recovery
1.  **Trigger:** Active Wi-Fi connection is dropped.
2.  **UI Feedback:** Top status bars of Screen A and Screen B slide down warnings: `"Working Offline (Cached)"`.
3.  **Local Buffering:** Add Patient inputs and sequence actions save to browser `localStorage` under cached states. All functions remain interactive.
4.  **Auto Reconnect:** Once network connectivity registers, local transactions are dispatched to the server using the client sequence stamp. Stale state overrides are reconciled without disrupting Screen B's view.

### Flow 6: Stale Tab Detection & Self-Heal
1.  **State check:** Monitor inactivity in browser processes (such as tab background freezes).
2.  **Recovery loop:** The system triggers a recovery verify on focus. If local state lags behind current, it applies full transition animations to catch up immediately, ensuring the display is perfectly aligned with the front-desk.

---

## 8) Analytics & Telemetry Schema

Our monitoring schema tracks actual operational efficiency.

### Core Tracking Events
*   `patient_added`:
    *   Parameters: `{ tokenId: String, ticketNumber: String, isPhoneProvided: Boolean, currentQueueSize: Integer, clientTimestamp: ISOString }`
*   `call_next`:
    *   Parameters: `{ tokenId: String, ticketNumber: String, waitTimeSeconds: Integer, seqId: Integer, clientHash: String }`
*   `consultation_ended`:
    *   Parameters: `{ tokenId: String, actualDurationSeconds: Integer, calculatedEmaSeconds: Integer, seqId: Integer }`
*   `queue_action_undone`:
    *   Parameters: `{ tokenId: String, elapsedSecondsBeforeUndo: Integer }`
*   `sync_conflict_detected`:
    *   Parameters: `{ clientSeqId: Integer, serverSeqId: Integer, resolutionAction: String }`

### Optimization Sampling & Log Retention
*   To keep processing lightweight, logging payloads are stored locally and grouped before sending to the database server. Keep telemetry collection clean.

---

## 9) Security, Privacy & Compliance

1.  **Lobby Display Names Masking:** To align strictly with HIPAA and general healthcare privacy regulations, Screen B (TV) must **never** render the full patient name. Convert `"Jane Cooper"` to `"Jane C."` or `"J. Cooper"` as preferred.
2.  **PII Phone Storage Zeroization:** Phone values are captured solely to optionally transmit registration check-ins. Once a patient is checked out (`status: 'served'`), the tracking database replaces the telephone storage string with a secure blank hash.
3.  **Consent Consent Microcopy:** The checkout desk form displays prominent disclosure: `"Phone number is collected strictly for queue arrival confirmations and is scrubbed immediately post-appointment."`
4.  **Display Access Lockouts:** Lobby screens are launched under secure static client configurations. They run in read-only visual modes with all interactive query inputs disabled, ensuring wait-room visitors cannot interact with administrative actions.

---

## 10) Deliverables & Acceptance Criteria

### Engineering Handoff Checklist
- [ ] **Interactive Dual-Dashboard Layout:** Screen A (Receptionist Console) operates in three high-contrast modular grids; Screen B (TV Kiosk) functions as a dark-mode optimized display.
- [ ] **Dual-Screen Real-Time Sync:** Testing BroadcastChannel syncing across two individual browser tabs reflects status updates faster than 100 milliseconds.
- [ ] **Double Click Prevention:** Rapid-fire clicking of administrative buttons displays loading indicators and processes only the original event.
- [ ] **HIPAA Privacy Compliance:** Waiting display TV renders masked names, and phone numbers are completely zeroed out after consultation checkout.
- [ ] **Comprehensive Wait-Time Engine:** Wait predictions fallback gracefully to manual entries on startup, and trigger the EMA calculations once the 4th sample is registered.

### Definition of "Done"
*   **Proof of Concept Execution:** A receptionist registers a token, clicks "Call Next", Screen B flashes visual updates immediately accompanied by a synthetic tone event, and the elapsed consultation timer starts immediately.
*   **Estimated Wait Time Precision:** Within 2 seconds of concluding a consultation, the calculated EWT dashboard updates across both screens using the EMA formula.
*   **Zero Skip Gaps:** Users cannot call multiple patients out of order on double-tap actions. Duplicate synchronization packets are halted.
