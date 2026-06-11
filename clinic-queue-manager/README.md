# Clinic Queue Manager

A real-time, dual-screen clinic queue management system designed for receptionists and patient waiting rooms. Features live synchronization, dynamic wait-time estimation, thermal receipt printing, and offline resilience.

![License](https://img.shields.io/badge/license-Apache--2.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-green)
![React](https://img.shields.io/badge/react-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/typescript-5.8-3178C6?logo=typescript)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Screens](#screens)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Documentation](#api-documentation)
- [Architecture](#architecture)
- [Security & Privacy](#security--privacy)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

**Clinic Queue Manager** optimizes patient flow and reduces perceived wait times by synchronizing a receptionist control console and a lobby display TV in real time. It includes:

- **Receptionist Dashboard** — Register patients, call next, manage queue order, and track consultation history.
- **Patient Waiting Room Display** — Large-format, high-contrast screen showing current ticket, upcoming queue, and estimated wait times.
- **Real-Time Sync** — WebSocket + Socket.IO for sub-second updates across all connected devices.
- **Offline Resilience** — Falls back to `localStorage` + `BroadcastChannel` when the backend is unreachable.
- **Dynamic EWT Engine** — Exponential Moving Average (EMA) algorithm that adapts to actual clinic throughput.

---

## Features

### Receptionist Dashboard
- One-click patient registration with optional phone number
- Custom or auto-generated ticket numbers (e.g., `A101`, `EMG102`)
- Emergency priority queue insertion
- Giant "Call Next" button with 10-second undo window
- Live consultation timer
- Manual average consultation time override
- Queue reordering (drag up/down)
- Cancel / remove patients
- Thermal receipt printing with QR code
- Telemetry event log

### Waiting Room Display
- Massive, readable ticket numbers (TV-optimized)
- Privacy-masked patient names (`John D.`)
- Dynamic estimated wait time (EWT) per patient
- Visual flash + audio chime when a new patient is called
- Real-time system clock
- Offline warning ticker

### Backend
- REST API for all queue operations
- Socket.IO real-time broadcast
- SQLite persistence (WAL mode)
- Idempotency keys to prevent double-clicks
- Optimistic locking with version numbers
- Zod request validation
- Helmet security headers
- CORS configuration

---

## Screens

| Screen | Description |
|--------|-------------|
| **Screen A — Receptionist** | Two-column layout: patient form (left), call-next hero + queue list (right) |
| **Screen B — Waiting Room** | Full-screen dark mode: current serving card (60%), next-up list (40%), footer metrics |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, Framer Motion, Lucide React |
| **Backend** | Node.js, Express, Socket.IO, TypeScript |
| **Database** | SQLite (better-sqlite3) |
| **Validation** | Zod |
| **Security** | Helmet, CORS, idempotency cache |
| **Real-Time** | Socket.IO (WebSocket + polling fallback) |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- npm or pnpm

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/clinic-queue-manager.git
cd clinic-queue-manager
```

### 2. Install dependencies

```bash
npm run install:all
```

This installs both frontend and backend dependencies.

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your values (see [Environment Variables](#environment-variables)).

### 4. Run in development mode

**Option A — Run both frontend and backend:**

```bash
npm run dev:full
```

**Option B — Run separately:**

```bash
# Terminal 1 — Frontend
npm run dev

# Terminal 2 — Backend
npm run backend:dev
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- API Health Check: http://localhost:3001/api/health

### 5. Build for production

```bash
# Build frontend
npm run build

# Build backend
cd backend && npm run build
```

---

## Environment Variables

All secrets and configuration live in `.env`. **Never commit `.env` to GitHub.**

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend URL used by the frontend | `http://localhost:3001` |
| `VITE_USE_BACKEND` | Enable backend sync (fallback to local if `false`) | `true` |
| `PORT` | Backend server port | `3001` |
| `NODE_ENV` | Runtime environment | `development` |
| `CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:3000,http://localhost:5173` |
| `CLINIC_NAME` | Display name on receipts | `Central Clinic` |
| `DEFAULT_AVG_MINUTES` | Default consultation time estimate | `15` |

> See `.env.example` for the full template.

---

## API Documentation

### Base URL

```
http://localhost:3001/api
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/queue/state` | Get full queue state |
| `POST` | `/queue/patient` | Add a patient to the queue |
| `POST` | `/queue/call-next` | Call the next patient |
| `POST` | `/queue/undo` | Undo the last call (within 10s window) |
| `POST` | `/queue/end-consultation` | End current consultation |
| `POST` | `/queue/reorder` | Move a queue item up or down |
| `DELETE` | `/queue/patient/:tokenId` | Remove / cancel a patient |
| `PUT` | `/queue/config` | Update manual average minutes |
| `POST` | `/queue/reset` | Full reset (queue + history + config) |
| `POST` | `/queue/reset-stats` | Reset queue and history only |
| `GET` | `/health` | Health check + uptime |
| `GET` | `/health/telemetry` | Recent telemetry events |

### WebSocket Events

Connect to the backend via Socket.IO to receive real-time updates.

**Event: `state_sync`**

```json
{
  "type": "call_next",
  "state": { /* full QueueState object */ },
  "senderId": "server",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

---

## Architecture

```
┌─────────────────┐      WebSocket/Socket.IO       ┌─────────────────┐
│  Receptionist   │◄───────────────────────────────►│    Backend      │
│   Dashboard     │         REST API              │  (Express)      │
│  (React + Vite) │◄───────────────────────────────►│   SQLite DB     │
└─────────────────┘                               └─────────────────┘
         │                                                │
         │         BroadcastChannel (same-origin)         │
         │◄───────────────────────────────────────────────►│
         │                                                │
┌─────────────────┐      WebSocket/Socket.IO       ┌─────────────────┐
│  Waiting Room   │◄───────────────────────────────►│   Socket.IO     │
│    Display      │         REST API (fallback)      │   Broadcast     │
│  (React + Vite) │◄───────────────────────────────►│                 │
└─────────────────┘                               └─────────────────┘
```

### State Model

```typescript
interface QueueState {
  currentToken: Token | null;        // Currently serving patient
  queue: Token[];                    // Waiting patients
  history: ConsultationHistory[];    // Completed consultations
  receptionistConfig: {
    manualAvgMinutes: number;        // 5–60
  };
  lastUpdated: string;               // ISO timestamp
  version: number;                   // Optimistic lock sequence
}
```

### Wait-Time Algorithm

The Estimated Wait Time (EWT) uses an **Exponential Moving Average (EMA)** over the last 10 consultations:

```
EMA_t = α × Duration_t + (1 − α) × EMA_t−1
α = 2 / (N + 1) ≈ 0.1818
```

- Falls back to `manualAvgMinutes` when fewer than 3 samples exist
- Outliers (< 90s or > 3× median) are excluded
- Bounded between 3 min and 45 min per patient ahead

---

## Security & Privacy

- **No secrets in Git** — `.env`, database files, and logs are `.gitignore`d
- **HIPAA-aware name masking** — Waiting room display shows `John D.` instead of `John Doe`
- **Phone number zeroization** — Optional phone numbers are not exposed in public APIs
- **Helmet headers** — Content Security Policy, HSTS, X-Frame-Options in production
- **CORS whitelist** — Only configured origins can access the API
- **Idempotency keys** — Prevents duplicate actions from rapid double-clicks
- **Optimistic locking** — Version numbers prevent race conditions on concurrent edits

---

## Deployment

### Deploy Backend (e.g., Railway, Render, Fly.io)

1. Set environment variables in your hosting dashboard
2. Build: `cd backend && npm run build`
3. Start: `cd backend && npm run start`
4. Ensure `CORS_ORIGINS` includes your deployed frontend URL

### Deploy Frontend (e.g., Vercel, Netlify)

1. Build: `npm run build`
2. Set `VITE_API_URL` to your deployed backend URL
3. Deploy the `dist/` folder

### Single-Server Deployment

You can also serve the built frontend statically from the Express backend:

```bash
npm run build          # Build frontend
cp -r dist backend/    # Copy dist into backend (optional)
cd backend && npm run build && npm run start
```

The backend will serve `index.html` for all unmatched routes.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

Please ensure:
- No secrets or `.env` files are committed
- Backend builds successfully: `cd backend && npm run build`
- Frontend lints cleanly: `npm run lint`

---

## License

This project is licensed under the [Apache License 2.0](LICENSE).

---

## Acknowledgments

- Built with [Vite](https://vitejs.dev/), [React](https://react.dev/), and [Tailwind CSS](https://tailwindcss.com/)
- Real-time sync powered by [Socket.IO](https://socket.io/)
- Database via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)

---

<p align="center">
  <strong>Made for clinics that care about patient experience.</strong>
</p>
