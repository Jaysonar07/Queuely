/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Clock, 
  UserCheck, 
  Plus, 
  Trash2, 
  RotateCcw, 
  FileText, 
  LayoutDashboard, 
  Wifi, 
  WifiOff, 
  Database, 
  AlertTriangle, 
  CheckCircle, 
  Undo, 
  Terminal, 
  Users, 
  Check, 
  Sliders, 
  Copy, 
  Volume2, 
  ExternalLink,
  ChevronUp,
  ChevronDown,
  Play,
  Settings,
  HelpCircle,
  Eye,
  Speech,
  Printer,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import { Token, QueueState, ConsultationHistory, TelemetryEvent } from './types';
import { INITIAL_QUEUE_STATE, MOCK_PATIENT_POOL } from './data/initialState';
import { calculateEWT } from './utils/waitMinutes';

interface LocalQRCodeImgProps {
  text: string;
  className?: string;
}

const LocalQRCodeImg: React.FC<LocalQRCodeImgProps> = ({ text, className }) => {
  const [src, setSrc] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(text, { margin: 1, width: 250 })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch((err) => {
        console.error('Error generating QR code image:', err);
        if (active) {
          setSrc(`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(text)}`);
        }
      });
    return () => {
      active = false;
    };
  }, [text]);

  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-stone-100/50 ${className}`}>
        <span className="text-[10px] text-stone-400 font-mono">Generating...</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt="QR Code"
      className={className}
      referrerPolicy="no-referrer"
    />
  );
};

const getReceiptQRText = (preview: {
  ticketNumber: string;
  patientName: string;
  position: string;
  waitTimeMinutes: number;
}) => {
  return [
    `🎟️ CENTRAL CLINIC TICKET 🎟️`,
    `--------------------------`,
    `Ticket No: ${preview.ticketNumber}`,
    `Patient  : ${preview.patientName}`,
    `Position : ${preview.position}`,
    `EstWait  : ~${preview.waitTimeMinutes} mins`,
    `--------------------------`,
    `Please watch the lobby monitor.`,
    `We will call you shortly.`,
    `Thank you!`
  ].join('\n');
};

export default function App() {
  // Navigation: 'receptionist' = Front Office Control, 'waiting' = Lobby Display
  const [activeTab, setActiveTab] = useState<'receptionist' | 'waiting'>('receptionist');
  
  // App Sync State
  const [state, setState] = useState<QueueState>(() => {
    const saved = localStorage.getItem('clinic_queue_state');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return INITIAL_QUEUE_STATE;
      }
    }
    return INITIAL_QUEUE_STATE;
  });

  // Simulator Settings & Heartbeats
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [telemetryLogs, setTelemetryLogs] = useState<TelemetryEvent[]>([]);
  const [sandboxFastTesting, setSandboxFastTesting] = useState<boolean>(true);
  
  // Audio Speech Announcer Option
  const [enableVoiceAnnounce, setEnableVoiceAnnounce] = useState<boolean>(true);

  // Administrative / Active consultation states
  const [isDebouncingCall, setIsDebouncingCall] = useState<boolean>(false);
  const [undoTimer, setUndoTimer] = useState<number | null>(null);
  const [lastCalledBackUp, setLastCalledBackUp] = useState<{
    currentToken: Token | null;
    queue: Token[];
    history: ConsultationHistory[];
  } | null>(null);

  // Form Inputs
  const [formName, setFormName] = useState<string>('');
  const [formPhone, setFormPhone] = useState<string>('');
  const [formTicketNumber, setFormTicketNumber] = useState<string>('');
  const [phoneError, setPhoneError] = useState<string>('');
  const [nameError, setNameError] = useState<string>('');
  const [ticketError, setTicketError] = useState<string>('');

  // Selected Simulation View Token
  const [userSelectedTokenId, setUserSelectedTokenId] = useState<string>('');
  const [activeReceiptPreview, setActiveReceiptPreview] = useState<any | null>(null);

  // Active visit elapsed seconds tracker
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const consultTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Real-time broadcast channel reference
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Visual highlight flag for Screen B when update arrives
  const [tvHighlight, setTvHighlight] = useState<boolean>(false);
  const [sysTime, setSysTime] = useState<string>('00:00:00');

  // Multi-tab Sync initialization & Heartbeats
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('clinic_queue_channel');
      channelRef.current = channel;

      channel.onmessage = (event) => {
        if (event.data?.type === 'state_sync') {
          const receivedState: QueueState = event.data.state;
          setState(receivedState);
          
          // Trigger visual highlight on TV tab message reception
          setTvHighlight(true);
          setTimeout(() => setTvHighlight(false), 2000);
          
          logTelemetry('sync_received', {
            version: receivedState.version,
            originTab: event.data.senderId,
            lastUpdated: receivedState.lastUpdated
          });
        }
      };
    } catch (err) {
      console.warn("BroadcastChannel creation blocked by platform sandbox policies. Enabling high-reliability polling fallback:", err);
    }

    // Cross-tab custom synchronization fallback via Storage Events
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'clinic_queue_state' && e.newValue) {
        try {
          const receivedState: QueueState = JSON.parse(e.newValue);
          setState((curr) => {
            if (receivedState.version !== curr.version || receivedState.lastUpdated !== curr.lastUpdated) {
              setTvHighlight(true);
              setTimeout(() => setTvHighlight(false), 2000);
              logTelemetry('sync_received_storage', {
                version: receivedState.version,
                lastUpdated: receivedState.lastUpdated
              });
              return receivedState;
            }
            return curr;
          });
        } catch (err) {
          // Ignore parse errors from stale manual updates
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Highly reactive background polling fallback (every 500ms) to bypass strict cross-origin iframe restrictions
    const pollingInterval = setInterval(() => {
      const saved = localStorage.getItem('clinic_queue_state');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setState((curr) => {
            if (parsed.version !== curr.version || parsed.lastUpdated !== curr.lastUpdated) {
              setTvHighlight(true);
              setTimeout(() => setTvHighlight(false), 2000);
              logTelemetry('sync_received_polling', {
                version: parsed.version,
                lastUpdated: parsed.lastUpdated
              });
              return parsed;
            }
            return curr;
          });
        } catch (err) {
          // Ignore
        }
      }
    }, 500);

    // System clock ticker for TV View B
    const clockTicker = setInterval(() => {
      const now = new Date();
      setSysTime(now.toTimeString().split(' ')[0]);
    }, 1000);

    return () => {
      if (channel) {
        try {
          channel.close();
        } catch (e) {
          // Ignore close errors
        }
      }
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(pollingInterval);
      clearInterval(clockTicker);
    };
  }, []);

  // Sync state to local storage and broadcast changes
  const saveAndBroadcastState = (newState: QueueState, eventOrigin: string) => {
    localStorage.setItem('clinic_queue_state', JSON.stringify(newState));
    setState(newState);
    
    if (isOnline && channelRef.current) {
      channelRef.current.postMessage({
        type: 'state_sync',
        state: newState,
        senderId: 'client-tab-' + Math.floor(Math.random() * 10000)
      });
    }
  };

  // Log telemetry events helper
  const logTelemetry = (name: string, payload: any) => {
    const newLog: TelemetryEvent = {
      id: 'evt-' + Math.round(Math.random() * 1000000),
      eventName: name,
      timestamp: new Date().toISOString(),
      payload
    };
    setTelemetryLogs((prev) => [newLog, ...prev.slice(0, 19)]);
  };

  // Keyboard shortcut Ctrl+N for Quick Register autofocus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        const input = document.getElementById('patientName-Input');
        if (input) input.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Listen to URL token parameters to enable direct Patient Pass perspective on load / transition
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token') || params.get('ticket');
    if (tokenParam) {
      const targetTokenId = tokenParam.trim();
      
      // Look for match in queue or active checkout/token state or history
      const matchedToken = state.queue.find(p => p.id === targetTokenId || p.ticketNumber.toLowerCase() === targetTokenId.toLowerCase()) 
        || (state.currentToken && (state.currentToken.id === targetTokenId || state.currentToken.ticketNumber.toLowerCase() === targetTokenId.toLowerCase()) ? state.currentToken : null)
        || state.history.find(h => h.id === targetTokenId || h.ticketNumber.toLowerCase() === targetTokenId.toLowerCase());
        
      if (matchedToken) {
        // Automatically switch perspective to waiting room tab with the target token selected
        setUserSelectedTokenId(matchedToken.id);
        setActiveTab('waiting');
        
        logTelemetry('url_token_loaded', {
          tokenId: matchedToken.id,
          ticketNumber: matchedToken.ticketNumber
        });
      }
    }
  }, [state.queue, state.currentToken, state.history]);

  // Update consulting Elapsed timer ticker
  useEffect(() => {
    if (state.currentToken && state.currentToken.status === 'serving') {
      const calledAtMs = new Date(state.currentToken.calledAt || '').getTime();
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - calledAtMs) / 1000)));

      consultTimerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
      if (consultTimerRef.current) clearInterval(consultTimerRef.current);
    }
    return () => {
      if (consultTimerRef.current) clearInterval(consultTimerRef.current);
    };
  }, [state.currentToken]);

  // Reactive chime and voice summons announcer on state currentToken change, covering all active display tabs/windows
  const lastServedIdRef = useRef<string | undefined>(state.currentToken?.id);
  useEffect(() => {
    if (state.currentToken && state.currentToken.id !== lastServedIdRef.current) {
      playLobbyChime();
      speakSummonsText(state.currentToken.ticketNumber, state.currentToken.patientName);
    }
    lastServedIdRef.current = state.currentToken?.id;
  }, [state.currentToken?.id]);

  // Set default selected token when queue loads
  useEffect(() => {
    if (state.queue.length > 0 && !userSelectedTokenId) {
      setUserSelectedTokenId(state.queue[0].id);
    }
  }, [state.queue]);

  // Undo Timer countdown effect
  useEffect(() => {
    if (undoTimer !== null) {
      if (undoTimer <= 0) {
        setUndoTimer(null);
        setLastCalledBackUp(null);
      } else {
        const t = setTimeout(() => setUndoTimer(undoTimer - 1), 1000);
        return () => clearTimeout(t);
      }
    }
  }, [undoTimer]);

  // Speech helper to read loud announcements
  const speakSummonsText = (ticket: string, name: string, force = false) => {
    if (!enableVoiceAnnounce && !force) return;
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Clear any ongoing voices
        const spaceSeparatedTicket = ticket.split('').join(' ');
        const speakName = name.replace(/\./g, '');
        const text = `Now serving ticket ${spaceSeparatedTicket}, ${speakName}. Please proceed to consulting room 1.`;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1.05;
        window.speechSynthesis.speak(utterance);
      }
    } catch (err) {
      console.warn("Speech Synthesis blocked in sandbox iframe:", err);
    }
  };

  // Audio synthesizer chime (Section 4: TV Summon Notification)
  const playLobbyChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      gain1.gain.setValueAtTime(0.08, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.5);
      
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.15); // E5
      gain2.gain.setValueAtTime(0.08, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.7);
    } catch (e) {
      console.warn("Web Audio chime blocked", e);
    }
  };

  // Safe prefix-aware incremental ticket generation
  const generateNextTicketNumber = (isEmergency?: boolean): string => {
    const allTokens = [
      ...(state.currentToken ? [state.currentToken] : []),
      ...state.queue,
      ...state.history.map(h => ({ ticketNumber: h.ticketNumber }))
    ];

    if (isEmergency) {
      let maxNum = 100;
      allTokens.forEach((item) => {
        if (item && item.ticketNumber && item.ticketNumber.startsWith('EMG')) {
          const numStr = item.ticketNumber.replace(/^\D+/g, '');
          const parsed = parseInt(numStr, 10);
          if (!isNaN(parsed) && parsed > maxNum) {
            maxNum = parsed;
          }
        }
      });
      return `EMG${maxNum + 1}`;
    }

    const standardTokens = allTokens.filter(item => item && item.ticketNumber && !item.ticketNumber.startsWith('EMG'));
    if (standardTokens.length === 0) return 'A101';
    
    let prefix = 'A';
    let maxNum = 0;
    
    standardTokens.forEach((item) => {
      if (item && item.ticketNumber) {
        const numStr = item.ticketNumber.replace(/^\D+/g, '');
        const parsed = parseInt(numStr, 10);
        if (!isNaN(parsed) && parsed > maxNum) {
          maxNum = parsed;
          const matchPrefix = item.ticketNumber.match(/^\D+/);
          if (matchPrefix) {
            prefix = matchPrefix[0];
          }
        }
      }
    });
    
    const nextVal = maxNum + 1;
    return `${prefix}${nextVal}`;
  };

  // Actions: Add patient to queue
  const handleAddPatient = (e?: React.FormEvent, isEmergency = false) => {
    if (e) e.preventDefault();
    setNameError('');
    setPhoneError('');
    setTicketError('');

    const trimmedName = formName.trim();
    const isNameProvided = trimmedName.length > 0;
    
    // Auto design placeholder name if optional field left blank (HIPAA generic setup)
    const activePatientName = isNameProvided ? trimmedName : (isEmergency ? 'Anonymous Emergency' : 'Anonymous Patient');

    if (formPhone.trim() && !/^\+?[0-9\s\-()]{7,15}$/.test(formPhone.trim())) {
      setPhoneError('Please provide a valid phone number.');
      return;
    }

    let nextTicket = formTicketNumber.trim().toUpperCase();
    if (nextTicket) {
      const isDuplicate = 
        (state.currentToken && state.currentToken.ticketNumber.toUpperCase() === nextTicket) ||
        state.queue.some(p => p.ticketNumber.toUpperCase() === nextTicket);
      if (isDuplicate) {
        setTicketError('This token number is already active in use.');
        return;
      }
    } else {
      nextTicket = generateNextTicketNumber(isEmergency);
    }

    const nextId = 'T' + Math.round(Math.random() * 99999);

    const newPatient: Token = {
      id: nextId,
      ticketNumber: nextTicket,
      patientName: activePatientName,
      patientPhone: formPhone.trim() ? formPhone.trim() : undefined,
      addedAt: new Date().toISOString(),
      status: 'waiting',
      isEmergency: isEmergency
    };

    let updatedQueue;
    if (isEmergency) {
      // Find the first non-emergency item in the queue, or place at front
      const firstNonEmgIdx = state.queue.findIndex(item => !item.isEmergency);
      if (firstNonEmgIdx === -1) {
        updatedQueue = [...state.queue, newPatient];
      } else {
        updatedQueue = [
          ...state.queue.slice(0, firstNonEmgIdx),
          newPatient,
          ...state.queue.slice(firstNonEmgIdx)
        ];
      }
    } else {
      updatedQueue = [...state.queue, newPatient];
    }

    const updatedState: QueueState = {
      ...state,
      queue: updatedQueue,
      lastUpdated: new Date().toISOString(),
      version: state.version + 1
    };

    saveAndBroadcastState(updatedState, isEmergency ? 'add_emergency_patient' : 'add_patient');
    logTelemetry('patient_added', {
      tokenId: nextId,
      ticketNumber: nextTicket,
      currentQueueSize: updatedQueue.length,
      patientName: activePatientName,
      isEmergency: isEmergency
    });

    // Reset Inputs
    setFormName('');
    setFormPhone('');
    setFormTicketNumber('');
    
    if (userSelectedTokenId === '') {
      setUserSelectedTokenId(nextId);
    }
  };

  // Actions: Dispatch Call Next
  const handleCallNext = () => {
    if (state.queue.length === 0) return;
    if (isDebouncingCall) return;

    setIsDebouncingCall(true);
    setTimeout(() => {
      setIsDebouncingCall(false);
    }, 500);

    setTvHighlight(true);
    setTimeout(() => setTvHighlight(false), 2000);

    const nextServing = state.queue[0];
    const remainingQueue = state.queue.slice(1);

    let updatedHistory = [...state.history];
    if (state.currentToken) {
      // Archive current as served
      const durationSecondsNow = Math.round((Date.now() - new Date(state.currentToken.calledAt || '').getTime()) / 1000);
      const historyEntry: ConsultationHistory = {
        tokenId: state.currentToken.id,
        ticketNumber: state.currentToken.ticketNumber,
        durationSeconds: Math.max(12, durationSecondsNow),
        startedAt: state.currentToken.calledAt || new Date().toISOString(),
        endedAt: new Date().toISOString()
      };
      updatedHistory.push(historyEntry);
    }

    setLastCalledBackUp({
      currentToken: state.currentToken,
      queue: state.queue,
      history: state.history
    });
    setUndoTimer(10); // 10s rollback

    const currentServingToken: Token = {
      ...nextServing,
      status: 'serving',
      calledAt: new Date().toISOString()
    };

    const updatedState: QueueState = {
      ...state,
      currentToken: currentServingToken,
      queue: remainingQueue,
      history: updatedHistory,
      lastUpdated: new Date().toISOString(),
      version: state.version + 1
    };

    saveAndBroadcastState(updatedState, 'call_next');
    logTelemetry('call_next', {
      tokenId: currentServingToken.id,
      ticketNumber: currentServingToken.ticketNumber,
      remainingInQueue: remainingQueue.length,
      version: updatedState.version
    });
  };

  // Actions: Undo Summon
  const handleUndoCallNext = () => {
    if (lastCalledBackUp && undoTimer !== null) {
      const updatedState: QueueState = {
        ...state,
        currentToken: lastCalledBackUp.currentToken,
        queue: lastCalledBackUp.queue,
        history: lastCalledBackUp.history,
        lastUpdated: new Date().toISOString(),
        version: state.version + 1
      };
      saveAndBroadcastState(updatedState, 'undo_call');
      logTelemetry('queue_action_undone', {
        tokenId: state.currentToken?.id,
        elapsedSecondsBeforeUndo: 10 - undoTimer
      });
      setUndoTimer(null);
      setLastCalledBackUp(null);
    }
  };

  // Actions: Conclude the active consultation
  const handleEndConsultation = () => {
    if (!state.currentToken) return;

    const secondsSpent = Math.round((Date.now() - new Date(state.currentToken.calledAt || '').getTime()) / 1000);
    const historyEntry: ConsultationHistory = {
      tokenId: state.currentToken.id,
      ticketNumber: state.currentToken.ticketNumber,
      durationSeconds: Math.max(10, secondsSpent),
      startedAt: state.currentToken.calledAt || new Date().toISOString(),
      endedAt: new Date().toISOString()
    };

    const updatedHistory = [...state.history, historyEntry];
    const calculatedWaitAfter = calculateEWT(
      state.queue.length,
      updatedHistory,
      state.receptionistConfig.manualAvgMinutes,
      { allowSandboxFastTesting: sandboxFastTesting }
    );

    const updatedState: QueueState = {
      ...state,
      currentToken: null,
      history: updatedHistory,
      lastUpdated: new Date().toISOString(),
      version: state.version + 1
    };

    saveAndBroadcastState(updatedState, 'end_consultation');
    logTelemetry('consultation_ended', {
      tokenId: historyEntry.tokenId,
      actualDurationSeconds: historyEntry.durationSeconds,
      calculatedEmaSeconds: calculatedWaitAfter.calculatedAvgSeconds
    });
  };

  // Actions: Swap priority rankings up/down in the queue
  const reorderQueueItem = (index: number, direction: 'up' | 'down') => {
    const nextIdx = direction === 'up' ? index - 1 : index + 1;
    if (nextIdx < 0 || nextIdx >= state.queue.length) return;

    const updatedQueue = [...state.queue];
    const temp = updatedQueue[index];
    updatedQueue[index] = updatedQueue[nextIdx];
    updatedQueue[nextIdx] = temp;

    const updatedState: QueueState = {
      ...state,
      queue: updatedQueue,
      lastUpdated: new Date().toISOString(),
      version: state.version + 1
    };

    saveAndBroadcastState(updatedState, 'reorder_queue');
    logTelemetry('queue_reordered', {
      swappedIdx1: index,
      swappedIdx2: nextIdx,
      queueOrder: updatedQueue.map(p => p.ticketNumber)
    });
  };

  // Fast Simulator Action: trigger simulated consult ticks
  const triggerSpeedConsultationSeconds = (addSeconds: number) => {
    if (!state.currentToken) return;
    // Backdate the calledAt timestamp artificially so wait average ticks calculate over real metrics immediately!
    const updatedCalledAt = new Date(
      new Date(state.currentToken.calledAt || '').getTime() - (addSeconds * 1000)
    ).toISOString();

    const updatedState: QueueState = {
      ...state,
      currentToken: {
        ...state.currentToken,
        calledAt: updatedCalledAt
      },
      lastUpdated: new Date().toISOString(),
      version: state.version + 1
    };

    saveAndBroadcastState(updatedState, 'simulated_tick');
    logTelemetry('simulated_consult_time_added', {
      addedSeconds: addSeconds,
      description: 'Prerecorded fake consultation duration for rapid wait-time EMA test'
    });
  };

  // Clean wipe state to completely empty setup
  const handleResetToEmpty = () => {
    const emptyState: QueueState = {
      currentToken: null,
      queue: [],
      history: [],
      receptionistConfig: { manualAvgMinutes: 0 },
      lastUpdated: new Date().toISOString(),
      version: 0
    };
    saveAndBroadcastState(emptyState, 'reset_empty');
    setTelemetryLogs([]);
    setUserSelectedTokenId('');
    logTelemetry('reset_to_empty', { queueCount: 0 });
  };

  // Reset to robust predefined template values
  const handleRestoreHydrated = () => {
    saveAndBroadcastState(INITIAL_QUEUE_STATE, 'restore_hydrated');
    setUserSelectedTokenId('T1004');
    logTelemetry('hydrated_default_restored', {
      activeCount: INITIAL_QUEUE_STATE.queue.length,
      historyCount: INITIAL_QUEUE_STATE.history.length
    });
  };

  // Reset the Seen Today (history), current queue list, active serving slot and average consultation minutes estimate
  const handleResetStats = () => {
    const updatedState: QueueState = {
      currentToken: null,
      queue: [],
      history: [],
      receptionistConfig: {
        manualAvgMinutes: 0
      },
      lastUpdated: new Date().toISOString(),
      version: state.version + 1
    };
    saveAndBroadcastState(updatedState, 'reset_stats');
    setUserSelectedTokenId('');
    logTelemetry('stats_reset', { msg: 'Reset completed queue, token, seen today, and manualAvgMinutes to 0' });
  };

  // Adjust Speed Manual Average slider
  const handleManualAvgChange = (minutes: number) => {
    const updatedState: QueueState = {
      ...state,
      receptionistConfig: {
        ...state.receptionistConfig,
        manualAvgMinutes: minutes
      },
      lastUpdated: new Date().toISOString(),
      version: state.version + 1
    };
    saveAndBroadcastState(updatedState, 'config_update');
    logTelemetry('avg_time_updated', { sliderValueMinutes: minutes });
  };

  // Seed Walk-In with demo data
  const handleSeedWalkIn = () => {
    const candidateIdx = Math.floor(Math.random() * MOCK_PATIENT_POOL.length);
    const chosen = MOCK_PATIENT_POOL[candidateIdx];
    setFormName(chosen.name || '');
    setFormPhone(chosen.phone || '');
    logTelemetry('simulator_seed_ready', { name: chosen.name });
  };

  // Trigger small thermal paper format receipt print dialog
  const handlePrintReceipt = async (pat: Token, waitTimeMinutes: number, idx: number) => {
    // Set state for elegant on-screen Virtual Thermal Receipt preview modal fallback
    setActiveReceiptPreview({
      id: pat.id,
      ticketNumber: pat.ticketNumber,
      patientName: pat.patientName || 'Anonymous',
      position: idx !== -1 ? `#${idx + 1} waiting` : 'Currently serving',
      waitTimeMinutes: waitTimeMinutes,
      patientPhone: pat.patientPhone
    });

    // Log telemetry
    logTelemetry('ticket_printed', {
      tokenId: pat.id,
      ticketNumber: pat.ticketNumber,
      estimatedWaitTimeMinutes: waitTimeMinutes,
      position: idx !== -1 ? idx + 1 : 'Currently serving'
    });

    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) {
      console.error("Could not obtain iframe document for printing.");
      return;
    }

    const printedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const printedDate = new Date().toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });

    // Generate dynamic simple pseudo-barcode
    let barcodeBars = '';
    for (let i = 0; i < 40; i++) {
      const isBlack = (i % 3 !== 0 && i % 7 !== 0 && i % 11 !== 0);
      const barWidth = (i % 5 === 0) ? 3 : (i % 2 === 0) ? 2 : 1;
      barcodeBars += `<div style="background-color: #000; height: 100%; width: ${barWidth}px; margin-right: ${isBlack ? 1 : 2}px;"></div>`;
    }

    const qrText = getReceiptQRText({
      ticketNumber: pat.ticketNumber,
      patientName: pat.patientName || 'Anonymous',
      position: idx !== -1 ? `#${idx + 1} waiting` : 'Currently serving',
      waitTimeMinutes: waitTimeMinutes,
    });
    
    let qrCodeApiUrl = '';
    try {
      qrCodeApiUrl = await QRCode.toDataURL(qrText, { margin: 1, width: 250 });
    } catch (err) {
      console.error('Local QR code print generation failed, fallback applied:', err);
      qrCodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrText)}`;
    }

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Ticket ${pat.ticketNumber}</title>
  <style>
    @page {
      size: 80mm 200mm;
      margin: 0;
    }
    @media print {
      body {
        margin: 0;
        padding: 6mm;
      }
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      width: 250px;
      margin: 0 auto;
      padding: 8px;
      color: #000;
      background: #fff;
      font-size: 11px;
      line-height: 1.4;
      text-align: center;
      box-sizing: border-box;
    }
    .tear-line {
      border-top: 1px dashed #000;
      margin: 10px 0;
    }
    .header {
      font-weight: bold;
      font-size: 12px;
      margin-bottom: 2px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .subheader {
      font-size: 10px;
      margin-bottom: 8px;
      color: #333;
    }
    .ticket-label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-top: 10px;
      color: #444;
    }
    .ticket-number {
      font-size: 48px;
      font-weight: 900;
      margin: 4px 0;
      font-family: 'Arial Black', Gadget, sans-serif;
      letter-spacing: -2px;
    }
    .info-box {
      border: 1px solid #000;
      padding: 6px 8px;
      margin: 10px 0;
      background: #fafafa;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 3px;
      font-size: 10px;
    }
    .info-row:last-child {
      margin-bottom: 0;
    }
    .info-label {
      font-weight: bold;
    }
    .qr-container {
      margin: 14px 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .qr-img {
      width: 110px;
      height: 110px;
      border: 1px dashed #333;
      padding: 4px;
      display: block;
      margin: 0 auto;
    }
    .qr-caption {
      font-size: 8px;
      font-weight: bold;
      margin-top: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .barcode {
      display: flex;
      justify-content: center;
      align-items: flex-end;
      height: 28px;
      margin: 12px auto 4px auto;
      width: fit-content;
    }
    .barcode-numbers {
      font-size: 8px;
      letter-spacing: 3px;
      margin-bottom: 12px;
    }
    .footer-msg {
      font-size: 9px;
      margin-top: 12px;
      font-style: italic;
      line-height: 1.3;
    }
  </style>
</head>
<body>
  <div class="tear-line"></div>
  <div class="header">Central Clinic</div>
  <div class="subheader">Lobby Queue Ticket System</div>
  
  <div class="tear-line"></div>
  
  <div class="ticket-label">Your Queue Number</div>
  <div class="ticket-number">${pat.ticketNumber}</div>
  
  <div class="info-box">
    <div class="info-row">
      <span class="info-label">Patient Name:</span>
      <span>${pat.patientName || 'Walk-In'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Queue Position:</span>
      <span>${idx !== -1 ? `#${idx + 1} waiting` : 'Serving Now'}</span>
    </div>
    <div class="info-row" style="border-top: 1px dotted #000; margin-top: 4px; padding-top: 4px;">
      <span class="info-label">Est. Wait Time:</span>
      <span style="font-weight: bold;">${idx !== -1 ? `~${waitTimeMinutes} mins` : 'Immediate'}</span>
    </div>
    ${pat.patientPhone ? `
    <div class="info-row">
      <span class="info-label">SMS Alerts:</span>
      <span>Enabled</span>
    </div>` : ''}
  </div>

  <div class="qr-container">
    <img src="${qrCodeApiUrl}" class="qr-img" alt="Tracking QR Code" />
    <div class="qr-caption">📱 Scan to instantly see ticket details</div>
  </div>

  <div class="barcode">
    ${barcodeBars}
  </div>
  <div class="barcode-numbers">*${pat.id.slice(0, 8).toUpperCase()}*</div>

  <div class="footer-msg">
    Please watch the main display screen.<br>
    We will summon your ticket shortly.<br>
    Thank you for your cooperation!
  </div>

  <div class="tear-line" style="margin-top: 12px;"></div>
  
  <div style="font-size: 8px; color: #555; margin-top: 4px;">
    Printed via Web Client<br>
    ${printedDate} ${printedAt}
  </div>
</body>
</html>
    `;

    doc.open();
    doc.write(htmlContent);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 7000);
    }, 500);
  };

  // Perform dynamic EWT metrics extraction based on user's local context (takes into account current serving)
  const totalWaitConsultations = state.queue.length + (state.currentToken ? 1 : 0);
  const computedMetrics = calculateEWT(
    totalWaitConsultations,
    state.history,
    state.receptionistConfig.manualAvgMinutes,
    { allowSandboxFastTesting: sandboxFastTesting }
  );

  // HIPAA customer display safe parsing (A103 -> 03, Jane Cooper -> Jane C.)
  const maskPatientName = (fullName: string): string => {
    const parts = fullName.trim().split(' ');
    if (parts.length === 1) {
      if (parts[0].length <= 3) return parts[0];
      return parts[0].substring(0, 3) + '...';
    }
    const firstName = parts[0];
    const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
    return `${firstName} ${lastInitial}.`;
  };

  const getReceiptTrackingUrl = (tokenId: string) => {
    let origin = window.location.origin;
    if (origin.includes('-dev-')) {
      origin = origin.replace('-dev-', '-pre-');
    }
    const pathname = window.location.pathname;
    return `${origin}${pathname}?token=${encodeURIComponent(tokenId)}`;
  };

  // Find your specific index and EWT inside simulation component B
  const getSelectedUserWaitStats = () => {
    const index = state.queue.findIndex(p => p.id === userSelectedTokenId);
    if (index === -1) {
      // Check if it is the current token being served
      if (state.currentToken && state.currentToken.id === userSelectedTokenId) {
        return {
          tokensAheadCount: 0,
          personalEwtMinutes: 0,
          tokenNumber: state.currentToken.ticketNumber,
          patientName: state.currentToken.patientName,
          isNowServing: true,
          isCompleted: false
        };
      }

      // Check if it's already completed in history
      const histMatch = state.history.find(h => h.id === userSelectedTokenId);
      if (histMatch) {
        return {
          tokensAheadCount: 0,
          personalEwtMinutes: 0,
          tokenNumber: histMatch.ticketNumber,
          patientName: histMatch.patientName,
          isNowServing: false,
          isCompleted: true
        };
      }

      return {
        tokensAheadCount: 0,
        personalEwtMinutes: 0,
        tokenNumber: '—',
        patientName: 'Unknown',
        isNowServing: false,
        isCompleted: false
      };
    }

    const patient = state.queue[index];
    const aheadInLine = index; // people ahead is exactly the 0-based index!

    // Personal wait refers to the calculated wait times for people ahead plus the active guest
    const waitConsultations = index + (state.currentToken ? 1 : 0);
    const personalEwtResult = calculateEWT(
      waitConsultations,
      state.history,
      state.receptionistConfig.manualAvgMinutes,
      { allowSandboxFastTesting: sandboxFastTesting }
    );

    return {
      tokensAheadCount: aheadInLine,
      personalEwtMinutes: Math.max(1, personalEwtResult.minutes),
      tokenNumber: patient.ticketNumber,
      patientName: patient.patientName,
      isNowServing: false,
      isCompleted: false
    };
  };

  const userStats = getSelectedUserWaitStats();

  const hasTokenQueryParam = typeof window !== 'undefined' && 
    (new URLSearchParams(window.location.search).has('token') || new URLSearchParams(window.location.search).has('ticket'));

  return (
    <div className="min-h-screen bg-gradient-to-tr from-sky-300/85 via-slate-200/70 to-blue-400/65 text-stone-800 font-sans flex flex-col md:overflow-x-hidden selection:bg-sky-300 selection:text-sky-900">
      
      {hasTokenQueryParam && (
        <div className="bg-[#112D4E] text-white px-6 py-2.5 text-xs font-semibold font-mono flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md border-b border-[#112D4E]/20">
          <div className="flex items-center gap-2 text-center sm:text-left">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block shrink-0" />
            <span>
              Connected to <strong>Clinic Live Queue Feed</strong>. Currently viewing Live waiting status for ticket <strong className="bg-[#FAF8F4]/10 px-1.5 py-0.5 rounded text-white">{userStats.tokenNumber !== '—' ? userStats.tokenNumber : '(Locating...)'}</strong>.
            </span>
          </div>
          <button 
            onClick={() => {
              // Clear query params to return to full staff view
              window.history.pushState({}, '', window.location.pathname);
              setUserSelectedTokenId('');
              setActiveTab('receptionist');
            }}
            className="bg-white/15 hover:bg-white/25 text-white font-bold px-3 py-1 rounded border border-white/25 transition-all font-sans cursor-pointer shrink-0"
          >
            Switch to Staff View
          </button>
        </div>
      )}
      
      {/* Visual Header / Premium Navigation Layout Inspired by screenshots */}
      <header className="border-b border-white/40 bg-white/25 backdrop-blur-md px-6 py-4 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="bg-white/40 backdrop-blur-sm border border-white/50 p-2 rounded-xl text-stone-700 shadow-sm">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-display font-bold text-stone-900 tracking-tight">
                  Queue dashboard
                </h1>
                <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-2 py-0.5 rounded-full font-semibold font-mono animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  Live Sync
                </span>
                {!isOnline && (
                  <span className="flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] px-2 py-0.5 rounded-full font-semibold font-mono">
                    <WifiOff className="w-3 h-3" />
                    Offline
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500 font-sans mt-0.5">
                Real-time patient flow management & wait-time estimates
              </p>
            </div>
          </div>

          {/* Interactive Navigation Pills - Just like the header buttons in inspiration */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-white/30 backdrop-blur-sm p-1 rounded-xl border border-white/40 shadow-inner">
              <button
                onClick={() => {
                  setActiveTab('receptionist');
                  logTelemetry('tab_switched', { tab: 'receptionist' });
                }}
                className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                  activeTab === 'receptionist'
                    ? 'bg-white/70 backdrop-blur-sm text-stone-950 shadow-sm border border-white/60'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-white/20'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Receptionist tab
              </button>
              
              <button
                onClick={() => {
                  setActiveTab('waiting');
                  logTelemetry('tab_switched', { tab: 'waiting' });
                }}
                className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                  activeTab === 'waiting'
                    ? 'bg-white/70 backdrop-blur-sm text-stone-950 shadow-sm border border-white/60'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-white/20'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Waiting room tab
              </button>
            </div>

            <button
              onClick={handleResetStats}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white/45 hover:bg-rose-50 hover:text-rose-700 text-stone-700 border border-white/55 hover:border-rose-200 text-xs font-bold rounded-xl shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer"
              title="Reset Seen Today count and Avg Consultation time metrics"
            >
              <RotateCcw className="w-3.5 text-rose-600 h-3.5" />
              <span>Reset Stats</span>
            </button>
          </div>

        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col gap-6">

        {/* Dynamic Inner Tab Views */}
        <AnimatePresence mode="wait">
          
          {/* TAB 1: RECEPTIONIST VIEW */}
          {activeTab === 'receptionist' && (
            <motion.div
              key="receptionist"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              
              {/* TOP SPLIT: Now Serving & Add Patient Form */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* 1. NOW SERVING CARD (Left) */}
                <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-2xl p-6 flex flex-col justify-between shadow-md relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#112D4E]/3 rounded-full blur-3xl pointer-events-none" />
                  
                  <div>
                    <div className="flex items-center justify-between text-stone-500 text-xs uppercase tracking-wider mb-3">
                      <span className="font-semibold text-stone-700">Now Serving</span>
                      <span className="font-mono bg-white/50 backdrop-blur-sm text-stone-700 px-2 py-0.5 rounded border border-white/60 text-[10px]">
                        Room 1
                      </span>
                    </div>
 
                    <div className="py-4">
                      <div className="text-[100px] font-semibold text-stone-900 leading-none tracking-tighter font-display mb-1">
                        {state.currentToken ? state.currentToken.ticketNumber : "—"}
                      </div>
 
                      <div className="text-sm font-medium text-stone-500 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#112D4E] inline-block animate-pulse" />
                        Seeing:{" "}
                        <span className="text-stone-800 font-semibold">
                          {state.currentToken ? state.currentToken.patientName : "Idle"}
                        </span>
                      </div>
 
                      {state.currentToken && (
                        <div className="mt-3 text-[11px] text-stone-600 font-mono flex items-center gap-2 bg-white/45 backdrop-blur-sm px-2.5 py-1 rounded w-fit border border-white/50">
                          <Clock className="w-3.5 h-3.5 text-stone-400" />
                          <span>
                            Active consultation time:{" "}
                            <strong className="text-[#112D4E]">
                              {Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s
                            </strong>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
 
                  <div className="space-y-3 pt-6 border-t border-white/40">
                    {/* Primary Trigger Button: Call Next Patient */}
                    <button
                      onClick={handleCallNext}
                      disabled={state.queue.length === 0 || isDebouncingCall}
                      className={`w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs font-semibold border transition-all duration-200 uppercase tracking-widest ${
                        state.queue.length === 0
                          ? "bg-white/10 backdrop-blur border-white/20 text-stone-400 cursor-not-allowed border-dashed"
                          : isDebouncingCall
                            ? "bg-[#1E3E62] border-[#1E3E62] text-white animate-pulse"
                            : "bg-[#112D4E] hover:bg-[#1E3E62] border-[#112D4E] text-white cursor-pointer active:scale-[0.99] shadow-sm"
                      }`}
                    >
                      <UserCheck className="w-4 h-4" />
                      {state.queue.length === 0
                        ? "Waiting room empty"
                        : `Call next — Token ${state.queue[0].ticketNumber}`}
                    </button>
 
                    {state.currentToken && (
                      <div className="flex flex-wrap gap-2 text-stone-700">
                        <button
                          onClick={handleEndConsultation}
                          className="flex-1 min-w-[120px] py-2 px-3 bg-white/50 hover:bg-white/75 backdrop-blur-sm text-stone-700 border border-white/60 rounded-lg text-xs font-semibold transition-all shadow-sm active:scale-[0.98]"
                        >
                          Checkout patient
                        </button>
 
                        <button
                          onClick={() => speakSummonsText(state.currentToken!.ticketNumber, state.currentToken!.patientName, true)}
                          className="py-2 px-3 bg-white/50 hover:bg-white/75 backdrop-blur-sm text-stone-700 border border-white/60 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98]"
                          title="Read active patient ticket number aloud"
                        >
                          <Volume2 className="w-4 h-4 text-stone-600" /> Read Aloud
                        </button>
 
                        <button
                          onClick={() => handlePrintReceipt(state.currentToken!, 0, -1)}
                          className="py-2 px-3 bg-white/50 hover:bg-white/75 backdrop-blur-sm text-stone-700 border border-white/60 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 shadow-sm active:scale-[0.98]"
                          title="Re-print active patient ticket receipt"
                        >
                          <Printer className="w-3.5 h-3.5 text-stone-600" />
                        </button>
 
                        <button
                          onClick={() => triggerSpeedConsultationSeconds(120)}
                          title="Simulate adding 2 minutes to consult session"
                          className="py-2 px-3 bg-amber-50/70 text-amber-800 hover:bg-amber-100/80 border border-amber-200/80 rounded-lg text-xs font-mono transition-colors flex items-center gap-1 shadow-sm active:scale-[0.98]"
                        >
                          <Play className="w-3.5 h-3.5 text-amber-600" /> +2m Sim
                        </button>
                      </div>
                    )}

                    {/* Elastic Undo Prompt Option */}
                    <AnimatePresence>
                      {undoTimer !== null && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs flex items-center justify-between gap-3 shadow-sm"
                        >
                          <div className="flex items-center gap-2">
                            <Undo className="w-4 h-4 text-amber-700" />
                            <div className="text-left">
                              <span className="font-semibold block text-amber-900">Summon Sent</span>
                              <span className="text-[10px] text-amber-700 font-mono">
                                Rollback available: {undoTimer}s
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={handleUndoCallNext}
                            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] rounded transition-colors"
                          >
                            Undo Call
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                  </div>
                </div>

                {/* 2. ADD PATIENT CARD (Right) */}
                <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-2xl p-6 flex flex-col justify-between shadow-md relative overflow-hidden">
                  <div>
                    <div className="flex items-center justify-between text-stone-500 text-xs uppercase tracking-wider mb-4 pb-2 border-b border-white/40">
                      <span className="font-semibold text-stone-700">Add patient</span>
                      <span className="text-[10px] text-stone-400 font-mono">Walk-in entry</span>
                    </div>

                    <form onSubmit={handleAddPatient} className="space-y-4">
                      <div>
                        <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block mb-1.5">
                          Patient Name (Optional)
                        </label>
                        <input
                          type="text"
                          id="patientName-Input"
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                          placeholder="Patient name (optional)"
                          className="w-full bg-white/30 backdrop-blur-sm border border-white/50 text-stone-900 px-4 py-2.5 rounded-xl text-xs placeholder-stone-450 focus:bg-white/60 focus:outline-none focus:ring-1 focus:ring-sky-450 transition-all font-sans"
                        />
                        {nameError && (
                          <p className="text-red-500 text-[10px] mt-1 font-sans">{nameError}</p>
                        )}
                      </div>

                      <div>
                        <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block mb-1.5">
                          Phone Number (Optional arrival SMS)
                        </label>
                        <input
                          type="tel"
                          value={formPhone}
                          onChange={(e) => setFormPhone(e.target.value)}
                          placeholder="+1 (555) 000-0000"
                          className="w-full bg-white/30 backdrop-blur-sm border border-white/50 text-stone-900 px-4 py-2.5 rounded-xl text-xs placeholder-stone-450 focus:bg-white/60 focus:outline-none focus:ring-1 focus:ring-sky-450 transition-all font-sans"
                        />
                        {phoneError && (
                          <p className="text-red-500 text-[10px] mt-1 font-sans">{phoneError}</p>
                        )}
                      </div>

                      <div>
                        <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block mb-1.5">
                          Custom Token
                        </label>
                        <input
                          type="text"
                          value={formTicketNumber}
                          onChange={(e) => {
                            setFormTicketNumber(e.target.value);
                            setTicketError('');
                          }}
                          placeholder="e.g. A105, EMG120 (leave blank to auto-generate)"
                          className="w-full bg-white/30 backdrop-blur-sm border border-white/50 text-stone-900 px-4 py-2.5 rounded-xl text-xs placeholder-stone-450 focus:bg-white/60 focus:outline-none focus:ring-1 focus:ring-sky-450 transition-all font-mono"
                        />
                        {ticketError && (
                          <p className="text-red-500 text-[10px] mt-1 font-sans">{ticketError}</p>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 pt-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            title="Add a standard patient registration at the end of the line"
                            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-[#112D4E] hover:bg-[#1E3E62] text-white font-semibold text-xs rounded-lg transition-colors focus:ring-1 focus:ring-stone-500 shadow-sm cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" /> Standard Add
                          </button>
                          
                          <button
                            type="button"
                            onClick={(e) => handleAddPatient(e, true)}
                            title="Add emergency patient directly to the head of the queue with priority"
                            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-lg transition-colors focus:ring-1 focus:ring-rose-500 shadow-sm cursor-pointer border border-rose-700/10"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-100" /> Emergency Add
                          </button>
                        </div>
                        
                        <button
                          type="button"
                          onClick={handleSeedWalkIn}
                          title="Generate fake test candidate data instantly"
                          className="py-1.5 px-3 bg-white/40 hover:bg-white/60 text-stone-700 rounded-lg text-[11px] font-semibold border border-white/50 transition-colors cursor-pointer"
                        >
                          🎲 Roll Demo Data
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Avg Consultation setup slider */}
                  <div className="pt-6 mt-6 border-t border-white/40">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-stone-500 font-bold uppercase tracking-widest text-[9px]">Manual Target time</span>
                      <span className="text-stone-400 text-[10px] font-mono">From {state.history.length} checkout samples</span>
                    </div>

                    <div className="flex items-center justify-between gap-4 p-2.5 bg-white/35 backdrop-blur-sm rounded-xl border border-white/40">
                      <div className="flex-1">
                        <input
                          type="range"
                          min="0"
                          max="20"
                          step="1"
                          value={state.receptionistConfig.manualAvgMinutes}
                          onChange={(e) => handleManualAvgChange(parseInt(e.target.value, 10))}
                          className="w-full h-1 cursor-pointer accent-[#112D4E]"
                        />
                      </div>
                      <div className="font-mono text-xs select-none">
                        <strong className="text-stone-900 text-sm">{state.receptionistConfig.manualAvgMinutes}</strong>
                        <span className="text-stone-500 ml-1">min</span>
                      </div>
                    </div>
                  </div>

                </div>

              </div>

              {/* MIDDLE: Patients waiting list Row */}
              <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-2xl p-6 shadow-md">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/45">
                  <h3 className="text-xs font-display font-bold uppercase tracking-widest text-stone-500">
                    Patients waiting
                  </h3>
                  <div className="text-xs font-mono text-stone-400">
                    <strong className="text-style text-stone-850">{state.queue.length}</strong> in queue
                  </div>
                </div>

                {state.queue.length === 0 ? (
                  <div className="text-center py-10 px-4">
                    <div className="w-12 h-12 rounded-full bg-white/40 border border-white/50 flex items-center justify-center mx-auto mb-3">
                      <RotateCcw className="w-5 h-5 text-stone-400" />
                    </div>
                    <p className="text-sm font-semibold text-stone-800">Lobby waiting line is clear!</p>
                    <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
                      All checked-in patient tickets are currently served. Register a walk-in name or generate test presets to simulate flow.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {state.queue.map((pat, idx) => {
                      // Calculate expected wait individually based on algorithm (taking into account currently serving guest)
                      const waitConsultations = idx + (state.currentToken ? 1 : 0);
                      const personalEstimate = calculateEWT(
                        waitConsultations, // how many patients ahead (including ongoing)
                        state.history,
                        state.receptionistConfig.manualAvgMinutes,
                        { allowSandboxFastTesting: sandboxFastTesting }
                      );

                      const displayedWaitTime = Math.max(1, personalEstimate.minutes);

                      return (
                        <div
                          key={pat.id}
                          className={`flex items-center justify-between border rounded-xl p-3 text-xs transition-all group ${
                            pat.isEmergency
                              ? 'border-rose-300 bg-rose-500/10 shadow-sm'
                              : 'bg-white/30 hover:bg-white/50 border-white/40 hover:border-white/60'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold w-0 h-0 hidden"></span>
                            <span className={`font-mono font-bold w-12 h-8 rounded-lg border flex items-center justify-center text-sm transition-all ${
                              pat.isEmergency
                                ? 'bg-rose-100/70 border-rose-300 text-rose-700 font-extrabold ring-1 ring-rose-200'
                                : 'bg-white/50 border-white/60 text-stone-900 group-hover:bg-white/80'
                            }`}>
                              {pat.ticketNumber}
                            </span>
                            <div>
                              <span className="text-sm font-semibold text-stone-900 flex items-center gap-1.5 flex-wrap">
                                {pat.patientName}
                                {pat.isEmergency && (
                                  <span className="bg-rose-100 text-rose-800 text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-0.5 animate-pulse font-mono">
                                    <AlertTriangle className="w-2.5 h-2.5 shrink-0" /> Priority EMG
                                  </span>
                                )}
                              </span>
                              {pat.patientPhone && (
                                <span className="text-[10px] text-stone-400 font-mono block">
                                  Blocked tracking hash: {pat.patientPhone.replace(/\d(?=\d{4})/g, '*')}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="font-mono font-medium text-stone-600">
                              ~{displayedWaitTime} min
                            </span>

                            {/* Priority queue quick rank tools */}
                            <div className="flex flex-col sm:flex-row gap-1">
                              <button
                                onClick={() => reorderQueueItem(idx, 'up')}
                                disabled={idx === 0}
                                title="Move Priority Up"
                                className={`p-1.5 rounded transition-all ${
                                  idx === 0 ? 'text-stone-200 cursor-not-allowed' : 'text-stone-500 hover:text-stone-800 hover:bg-white/40'
                                }`}
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => reorderQueueItem(idx, 'down')}
                                disabled={idx === state.queue.length - 1}
                                title="Move Priority Down"
                                className={`p-1.5 rounded transition-all ${
                                  idx === state.queue.length - 1 ? 'text-stone-200 cursor-not-allowed' : 'text-stone-500 hover:text-stone-800 hover:bg-white/40'
                                }`}
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                              
                              <button
                                onClick={() => handlePrintReceipt(pat, displayedWaitTime, idx)}
                                className="p-1.5 rounded text-stone-500 hover:text-[#112D4E] hover:bg-white/40 transition-all ml-1"
                                title="Print Ticket Receipt"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => {
                                  const filtered = state.queue.filter(p => p.id !== pat.id);
                                  const updatedState: QueueState = {
                                    ...state,
                                    queue: filtered,
                                    lastUpdated: new Date().toISOString(),
                                    version: state.version + 1
                                  };
                                  saveAndBroadcastState(updatedState, 'cancel_patient');
                                  logTelemetry('patient_cancelled', { tokenId: pat.id, ticket: pat.ticketNumber });
                                }}
                                className="p-1.5 rounded text-stone-500 hover:text-red-650 hover:bg-red-500/10 transition-all ml-1"
                                title="Cancel Ticket"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* THREE SUMMARY DATA BOXES (Bottom row - from Screenshot style) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-sans text-left">
                <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-2xl p-5 shadow-md">
                  <div className="text-stone-500 font-medium text-xs mb-1">Seen today</div>
                  <div className="text-4xl font-display font-bold text-stone-900 leading-none">
                    {state.history.length}
                  </div>
                  <p className="text-[10px] text-stone-400 mt-2 font-mono">Archived consultations</p>
                </div>

                <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-2xl p-5 shadow-md">
                  <div className="text-stone-500 font-medium text-xs mb-1">Avg consult</div>
                  <div className="text-4xl font-display font-bold text-stone-900 leading-none">
                    {state.history.length === 0 
                      ? `${state.receptionistConfig.manualAvgMinutes}m`
                      : `${Math.round(state.history.reduce((acc, current) => acc + current.durationSeconds, 0) / state.history.length / 60)}m`
                    }
                  </div>
                  <p className="text-[10px] text-stone-400 mt-2 font-mono">Based on real analytics logs</p>
                </div>

                <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-2xl p-5 shadow-md">
                  <div className="text-stone-500 font-medium text-xs mb-1">Max wait now</div>
                  <div className="text-4xl font-display font-bold text-stone-900 leading-none">
                    {state.queue.length === 0 ? '—' : `${computedMetrics.minutes}m`}
                  </div>
                  <p className="text-[10px] text-stone-400 mt-2 font-mono">Peak estimated wait backlog</p>
                </div>
              </div>



            </motion.div>
          )}

          {/* TAB 2: WAITING ROOM TV VIEW */}
          {activeTab === 'waiting' && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
                  {/* Patient Selector drop downs for simulating perspective */}
              <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-left shadow-md">
                <div>
                  <span className="text-xs font-semibold text-stone-800 block">Personal perspective simulator</span>
                  <span className="text-[10px] text-stone-500">Pick a queued patient token below to track and highlight of your slot.</span>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <span className="text-xs text-stone-500">Your token:</span>
                  <select
                    value={userSelectedTokenId}
                    onChange={(e) => {
                      setUserSelectedTokenId(e.target.value);
                      logTelemetry('patient_selector_swapped', { selectedId: e.target.value });
                    }}
                    className="bg-white/50 border border-white/60 text-stone-900 rounded-lg px-3 py-1.5 text-xs text-left cursor-pointer font-medium focus:ring-1 focus:ring-sky-400 focus:outline-none"
                  >
                    <option value="">-- View overall lobby perspective --</option>
                    {state.queue.map(p => (
                      <option key={p.id} value={p.id}>
                        Token {p.ticketNumber} — {p.patientName}
                      </option>
                    ))}
                    {state.currentToken && (
                      <option value={state.currentToken.id}>
                        Token {state.currentToken.ticketNumber} — {state.currentToken.patientName} (Serving Now)
                      </option>
                    )}
                  </select>
                </div>
              </div>

              {/* Screen B TV Lobby Dashboard structure */}
              <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-2xl overflow-hidden p-6 md:p-12 shadow-md space-y-8 relative">
                
                {/* Pulse Glow Alert when TVHighlight matches */}
                <AnimatePresence>
                  {tvHighlight && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.08 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-[#112D4E]/10 pointer-events-none animate-pulse z-10"
                    />
                  )}
                </AnimatePresence>

                {/* Top status rows */}
                <div className="flex flex-col sm:flex-row justify-between items-center pb-6 border-b border-white/40 gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse inline-block" />
                    <span className="text-sm font-semibold text-stone-850 tracking-wider font-display uppercase">
                      Clinic Lobby Patient Monitor
                    </span>
                  </div>

                  <div className="text-stone-600 font-mono text-xs flex items-center gap-2 bg-white/40 px-3 py-1 rounded border border-white/50 animate-pulse">
                    <span>Clock: <strong>{sysTime}</strong></span>
                  </div>
                </div>

                {/* Queue list sequence cards */}
                <div className="pb-6 border-b border-white/40">
                  <span className="text-sm font-extrabold text-stone-700 uppercase tracking-wider block mb-4 text-left">
                    Tokens ahead
                  </span>

                  {state.queue.length === 0 ? (
                    <div className="text-xs text-stone-400 italic text-center py-6">
                      Quiet lobby. Welcome inside Clinic central lobby!
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-3.5 justify-start">
                      {state.queue.map((pat, idx) => {
                        const isSelectedUser = pat.id === userSelectedTokenId;
                        return (
                          <div
                            key={pat.id}
                            className={`px-5.5 py-3.5 rounded-2xl text-base md:text-lg font-mono flex items-center gap-3 transition-all text-center border shadow-sm ${
                              isSelectedUser
                                ? pat.isEmergency
                                  ? 'bg-rose-700 text-white border-rose-700 shadow-md ring-2 ring-rose-200 font-bold animate-pulse'
                                  : 'bg-[#112D4E] text-white border-[#112D4E] shadow-sm font-bold'
                                : pat.isEmergency
                                  ? 'bg-rose-50 text-rose-700 border-rose-300 font-bold shadow-sm ring-1 ring-rose-150 animate-pulse'
                                  : 'bg-white/40 text-stone-600 border-white/40 hover:bg-white/50'
                            }`}
                          >
                            <span className={`font-bold ${
                              isSelectedUser 
                                ? 'text-white' 
                                : pat.isEmergency 
                                  ? 'text-rose-700' 
                                  : 'text-stone-900'
                            }`}>{pat.ticketNumber}</span>
                            <span className="opacity-40">|</span>
                            <span className={`font-sans font-medium ${
                              isSelectedUser 
                                ? 'text-white/90' 
                                : pat.isEmergency 
                                  ? 'text-rose-800 font-bold' 
                                  : 'text-stone-600'
                            }`}>
                              {maskPatientName(pat.patientName)}
                            </span>
                            {isSelectedUser && (
                              <span className="text-[11px] bg-white/20 px-1.5 py-0.5 rounded text-white font-sans font-semibold">
                                you
                              </span>
                            )}
                            {pat.isEmergency && !isSelectedUser && (
                              <span className="text-[10px] bg-rose-200 text-rose-850 px-1.5 rounded font-sans font-bold uppercase tracking-wider">
                                EMG
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* MAIN SPLIT: Now serving and Estimated waits (from Screens 2 inspiration) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-left">
                  
                  {/* Left Column (Now serving) */}
                  <div className="lg:col-span-7 bg-white/30 backdrop-blur-sm border border-white/40 rounded-2xl p-8 relative flex flex-col justify-between shadow-sm">
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-xs font-semibold text-stone-500 uppercase tracking-widest block">
                          Now serving
                        </span>
                        {state.currentToken && (
                          <button
                            onClick={() => speakSummonsText(state.currentToken!.ticketNumber, state.currentToken!.patientName, true)}
                            className="flex items-center gap-1.5 px-3 py-1 bg-white/50 hover:bg-white/75 border border-white/60 text-stone-700 rounded-lg text-xs font-semibold transition-all shadow-sm cursor-pointer select-none active:scale-[0.98]"
                            title="Read active patient ticket number aloud"
                          >
                            <Volume2 className="w-3.5 h-3.5 text-stone-600" />
                            <span>Read Aloud</span>
                          </button>
                        )}
                      </div>

                      <div className="text-[100px] font-semibold text-stone-900 leading-none tracking-tighter font-display mb-2">
                        {state.currentToken ? state.currentToken.ticketNumber : '—'}
                      </div>

                      <div className="text-lg text-stone-600 font-medium">
                        Patient:{' '}
                        <span className="text-[#112D4E] font-bold ml-1">
                          {state.currentToken ? maskPatientName(state.currentToken.patientName) : 'Preparing...'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-white/40 text-xs text-stone-500 italic">
                      Proceed directly to check-out desk / Consulting Room 1 upon visual chime summons.
                    </div>
                  </div>

                  {/* Right Column (Your estimated wait) */}
                  <div className="lg:col-span-5 bg-white/30 backdrop-blur-sm border border-white/40 rounded-2xl p-8 flex flex-col justify-between shadow-sm">
                    <div>
                      <div className="flex justify-between items-start text-xs font-semibold text-stone-500 uppercase tracking-widest mb-4">
                        <span>ESTIMATED LOBBY WAIT</span>
                        <span className="text-[10px] bg-white/60 text-stone-700 px-2 py-0.5 rounded border border-white/50 font-mono lowercase">
                          {computedMetrics.calculationMethod}
                        </span>
                      </div>

                      {userSelectedTokenId ? (
                        userStats.isNowServing ? (
                          <div className="text-right">
                            <div className="text-4xl md:text-5xl font-extrabold text-[#112D4E] leading-tight tracking-tight pt-6 pb-2">
                              SUMMONED
                            </div>
                            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded inline-block">
                              🔔 Serving Now!
                            </span>
                            <span className="text-xs text-stone-500 block mt-2 text-right">
                              Proceed to Consulting Room for <strong className="text-stone-850">{maskPatientName(userStats.patientName)}</strong>
                            </span>
                          </div>
                        ) : userStats.isCompleted ? (
                          <div className="text-right">
                            <div className="text-4xl md:text-5xl font-extrabold text-[#112D4E] leading-tight tracking-tight pt-6 pb-2">
                              FINALISED
                            </div>
                            <span className="text-xs font-semibold text-stone-500 bg-white/40 px-2 py-1 rounded inline-block">
                              ✓ Consultation Finished
                            </span>
                            <span className="text-xs text-stone-500 block mt-2 text-right">
                              Session record finalized for <strong className="text-stone-850">{maskPatientName(userStats.patientName)}</strong>
                            </span>
                          </div>
                        ) : state.queue.some(p => p.id === userSelectedTokenId) ? (
                          <div>
                            <div className="text-[100px] font-semibold text-[#112D4E] leading-none tracking-tighter font-display text-right pr-2">
                              {userStats.personalEwtMinutes}
                            </div>
                            <span className="text-xs text-stone-500 block text-right">
                              minutes estimated wait for <strong className="text-stone-800">{maskPatientName(userStats.patientName)}</strong>
                            </span>
                          </div>
                        ) : (
                          <div>
                            <div className="text-[100px] font-semibold text-stone-950 leading-none tracking-tighter font-display text-right pr-2">
                              {computedMetrics.minutes}
                            </div>
                            <span className="text-xs text-stone-500 block text-right mb-1">
                              minutes peak estimated wait
                            </span>
                          </div>
                        )
                      ) : (
                        <div>
                          <div className="text-[100px] font-semibold text-stone-950 leading-none tracking-tighter font-display text-right pr-2">
                            {computedMetrics.minutes}
                          </div>
                          <span className="text-xs text-stone-500 block text-right mb-1">
                            minutes peak estimated wait
                          </span>
                        </div>
                      )}

                    </div>

                    <div className="mt-8 pt-6 border-t border-white/40">
                      {userSelectedTokenId ? (
                        userStats.isNowServing ? (
                          <div className="text-xs flex justify-between text-stone-500 font-mono">
                            <span>Status:</span>
                            <strong className="text-emerald-600 uppercase tracking-wider font-bold">Active in Consultation</strong>
                          </div>
                        ) : userStats.isCompleted ? (
                          <div className="text-xs flex justify-between text-stone-500 font-mono">
                            <span>Status:</span>
                            <strong className="text-stone-500 uppercase tracking-wider font-bold">Safely Checked-Out</strong>
                          </div>
                        ) : state.queue.some(p => p.id === userSelectedTokenId) ? (
                          <div className="text-sm flex justify-between items-center text-stone-600 font-mono">
                            <span className="font-semibold">Tokens Ahead in line:</span>
                            <strong className="text-[#112D4E] text-xl font-bold bg-[#112D4E]/5 px-2.5 py-0.5 rounded-lg border border-[#112D4E]/10">{userStats.tokensAheadCount}</strong>
                          </div>
                        ) : (
                          <div className="text-xs flex justify-between text-stone-500 font-mono">
                            <span>Total checked in awaiting:</span>
                            <strong className="text-[#112D4E]">{state.queue.length} patients</strong>
                          </div>
                        )
                      ) : (
                        <div className="text-xs flex justify-between text-stone-500 font-mono">
                          <span>Total checked in awaiting:</span>
                          <strong className="text-[#112D4E]">{state.queue.length} patients</strong>
                        </div>
                      )}
                    </div>
                  </div>

                </div>

                {/* Bottom ticker banner alerts */}
                <div className="bg-white/30 backdrop-blur-sm py-2 px-4 rounded-lg overflow-hidden border border-white/40 text-[10px] text-stone-600 font-mono text-left relative flex items-center">
                  <div className="bg-transparent pr-2 font-bold uppercase tracking-wider text-[#112D4E] z-10 select-none flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#112D4E]" /> NOTE:
                  </div>
                  <div className="animate-marquee whitespace-nowrap pl-2 text-stone-600">
                    If your ticket number has been called out by voice, proceed directly to consulting desk. Dynamic lobby estimates updates instantly in real-time. For questions, call our central desk helpline: (555) 012-3456. Thank you for your cooperation.
                  </div>
                </div>

              </div>

            </motion.div>
          )}

        </AnimatePresence>

      </main>



      {/* Stunning physical/thermal virtual receipt overlay popup */}
      {activeReceiptPreview && (
        <div 
          id="receipt-modal-backdrop" 
          className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
          onClick={() => setActiveReceiptPreview(null)}
        >
          <div 
            id="receipt-modal-card" 
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-[#E5DFD3] flex flex-col relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Real aesthetic design: warm subtle grid ticket pattern header background */}
            <div className="bg-[#FAF8F4] border-b border-[#E5DFD3] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[#112D4E] font-bold text-xs uppercase tracking-wider">
                <Printer className="w-4 h-4 text-stone-600" />
                <span>Virtual Queue Ticket</span>
              </div>
              <button 
                onClick={() => setActiveReceiptPreview(null)}
                className="p-1 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-all font-sans"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Simulated Thermal Ticket Body */}
            <div className="p-6 flex-1 bg-[#FDFCF7] flex flex-col items-center">
              <div className="w-full bg-white border border-[#E5DFD3] p-6 rounded-xl flex flex-col items-center text-center relative max-w-xs font-mono">
                <div className="text-[10px] uppercase font-bold tracking-widest text-[#112D4E] mb-1">Central Clinic</div>
                <div className="text-[9px] text-stone-500 uppercase tracking-wider mb-4">Lobby Queue Ticket System</div>

                <div className="w-full border-t border-dashed border-stone-300 my-2"></div>

                <div className="text-[9px] text-stone-500 uppercase tracking-widest mt-2">Your Queue Number</div>
                <div className="text-5xl font-black font-sans text-stone-900 tracking-tighter my-2">
                  {activeReceiptPreview.ticketNumber}
                </div>

                <div className="w-full border-t border-dashed border-stone-300 my-2"></div>

                <div className="w-full space-y-1.5 text-left text-xs my-3 text-stone-800">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Patient:</span>
                    <span className="font-bold text-stone-900">{activeReceiptPreview.patientName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Queue Position:</span>
                    <span className="font-bold text-stone-900">
                      {activeReceiptPreview.position}
                    </span>
                  </div>
                  <div className="flex justify-between text-[#112D4E] pt-1.5 border-t border-dotted border-stone-300">
                    <span className="font-semibold">Est. Wait Time:</span>
                    <span className="font-bold">~{activeReceiptPreview.waitTimeMinutes} mins</span>
                  </div>
                </div>

                <div className="w-full border-t border-dashed border-stone-300 my-2"></div>

                {/* QR Code and Mobile Track message */}
                <div className="my-2 flex flex-col items-center">
                  <div className="bg-white p-2 border border-[#E5DFD3] rounded-xl shadow-sm">
                    <LocalQRCodeImg 
                      text={getReceiptQRText(activeReceiptPreview)} 
                      className="w-24 h-24 block" 
                    />
                  </div>
                  <span className="text-[9px] text-[#112D4E] font-bold tracking-tight mt-1.5 text-center px-1">
                    📱 Scan to instantly see your ticket on your phone
                  </span>
                </div>

                <div className="w-full border-t border-dashed border-stone-300 my-2"></div>

                {/* Simulated Barcode visual */}
                <div className="flex items-end justify-center h-8 mt-4 mb-1 select-none opacity-80 w-full px-2">
                  {Array.from({ length: 42 }).map((_, i) => {
                    const isBlack = (i % 3 !== 0 && i % 7 !== 0 && i % 11 !== 0);
                    const barWidth = (i % 5 === 0) ? "w-[3px]" : (i % 2 === 0) ? "w-[1.5px]" : "w-[2px]";
                    return (
                      <div 
                        key={i} 
                        className={`h-full bg-stone-900 ${barWidth} ${isBlack ? 'opacity-100' : 'opacity-0'} mx-[0.5px]`}
                      />
                    );
                  })}
                </div>
                <div className="text-[8px] tracking-[4px] text-stone-500 uppercase">*{activeReceiptPreview.id.slice(0, 8)}*</div>

                <div className="text-[8px] text-stone-400 mt-4 leading-normal text-center max-w-[200px]">
                  Please watch the main lobby monitor.<br />
                  We will summon your ticket shortly.<br />
                  Thank you!
                </div>

                {/* Date-time receipt print stamp */}
                <div className="text-[8px] text-stone-400 mt-4 pt-4 border-t border-dashed border-stone-300 w-full flex justify-between">
                  <span>{new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                  <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            </div>

            {/* Print Confirmation Footer */}
            <div className="bg-[#FAF8F4] border-t border-[#E5DFD3] px-6 py-4 flex gap-2.5 justify-end">
              <button
                onClick={() => {
                  setActiveReceiptPreview(null);
                }}
                className="px-4 py-1.5 text-xs text-stone-600 hover:text-stone-900 hover:bg-[#FAF8F4] rounded-lg transition-all border border-[#DCD5C6] font-semibold"
              >
                Dismiss
              </button>
              <button
                onClick={() => {
                  try {
                    let iframe = document.getElementById('print-iframe-trigger') as HTMLIFrameElement;
                    if (!iframe) {
                      iframe = document.createElement('iframe');
                      iframe.id = 'print-iframe-trigger';
                      iframe.style.position = 'absolute';
                      iframe.style.width = '0px';
                      iframe.style.height = '0px';
                      iframe.style.border = 'none';
                      iframe.style.visibility = 'hidden';
                      document.body.appendChild(iframe);
                    }
                    const doc = iframe.contentWindow?.document || iframe.contentDocument;
                    if (doc) {
                      doc.open();
                      doc.write(`
                        <html>
                          <head>
                            <title>Print Ticket ${activeReceiptPreview.ticketNumber}</title>
                            <style>
                              @page { size: 80mm auto; margin: 0; }
                              body {
                                font-family: monospace;
                                margin: 0;
                                padding: 20px;
                                max-width: 300px;
                                text-align: center;
                                color: #000;
                              }
                              h1 { font-size: 3rem; margin: 10px 0; font-weight: bold; }
                              .dashed-line { border-top: 1px dashed #000; margin: 15px 0; }
                              .text-left { text-align: left; }
                              .flex-between { display: flex; justify-content: space-between; margin: 5px 0; }
                              .footer { font-size: 0.7rem; color: #555; margin-top: 20px; }
                            </style>
                          </head>
                          <body onload="window.print()">
                            <h3 style="margin: 0; text-transform: uppercase; letter-spacing: 1px;">Central Clinic</h3>
                            <div style="font-size: 0.8rem; margin-top: 3px;">Lobby Queue Receipt</div>
                            <div class="dashed-line"></div>
                            <div style="font-size: 0.8rem; text-transform: uppercase;">Ticket Number</div>
                            <h1>${activeReceiptPreview.ticketNumber}</h1>
                            <div class="dashed-line"></div>
                            <div class="text-left" style="font-size: 0.9rem;">
                              <div class="flex-between"><span>Patient:</span> <strong>${activeReceiptPreview.patientName}</strong></div>
                              <div class="flex-between"><span>Position:</span> <strong>${activeReceiptPreview.position}</strong></div>
                              <div class="flex-between"><span>Est. Wait:</span> <strong>~${activeReceiptPreview.waitTimeMinutes} mins</strong></div>
                            </div>
                            <div class="dashed-line"></div>
                            <div class="footer">
                              Please watch the main lobby monitor.<br>
                              We will summon your ticket shortly.<br>
                              <div style="margin-top: 10px;">${new Date().toLocaleString()}</div>
                            </div>
                          </body>
                        </html>
                      `);
                      doc.close();
                      setTimeout(() => {
                        iframe.contentWindow?.focus();
                        iframe.contentWindow?.print();
                      }, 250);
                    } else {
                      window.print();
                    }
                  } catch (e) {
                    window.print();
                  }
                }}
                className="bg-[#112D4E] hover:bg-[#112D4E]/90 text-white text-xs px-4 py-1.5 rounded-lg transition-all font-semibold shadow-sm flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                Trigger Hardware Print
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
