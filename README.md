# Queuely
A smart queue management and loging system for efficiancy , can be used in real time events 
Clinic Queue Manager is a real-time, dual-screen queue management system built for medical clinics, hospitals, and private practices. It connects a receptionist control console with a patient waiting room display to streamline patient flow, reduce front-desk chaos, and eliminate the anxiety of uncertain wait times.

The Problem It Solves
Receptionists juggle phone calls, walk-ins, and appointment tracking while patients repeatedly ask "How much longer?" — creating friction for both staff and visitors. This app replaces manual queue tracking with a synchronized digital system that keeps everyone informed without extra verbal back-and-forth.

How It Works
Receptionist (Screen A) registers patients into a digital queue with auto-generated ticket numbers (e.g., A101, EMG102 for emergencies).
Waiting Room (Screen B) displays the current ticket being served, upcoming queue order, and dynamically calculated estimated wait times — in large, high-contrast text readable from across the room.

When the receptionist clicks "Call Next", the waiting room updates instantly via WebSocket, flashes a visual alert, and plays an audio chime so patients never miss their turn.

# 1. Install everything
npm run install:all

# 2. Copy env template and edit
cp .env.example .env

# 3. Run both frontend + backend together
npm run dev:full

Frontend: http://localhost:3000

Backend API: http://localhost:3001

Health check: http://localhost:3001/api/health

Built For
Small to mid-sized clinics needing a lightweight, self-hosted queue system
Receptionists who want one-click patient flow control without complex software
Waiting rooms with large TV displays where patients need clear, glanceable queue info


| Feature                      | Benefit                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| **Dual-Screen Sync**         | Receptionist actions reflect on the lobby display in under a second                            |
| **Smart Wait-Time Engine**   | EMA algorithm learns from actual consultation durations to give accurate ETAs                  |
| **Offline Resilient**        | If the network drops, the app buffers changes locally and syncs automatically when reconnected |
| **HIPAA-Aware Privacy**      | Patient names are masked on public displays; phone numbers are never exposed                   |
| **Thermal Receipt Printing** | Patients get a physical ticket with QR code and position info                                  |
| **Undo Protection**          | 10-second undo window prevents accidental "Call Next" mistakes                                 |

