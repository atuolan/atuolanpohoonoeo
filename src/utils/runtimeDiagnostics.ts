export type RuntimeDiagnosticKind = "event" | "error" | "reload";

export interface RuntimeDiagnosticEntry {
  id: string;
  kind: RuntimeDiagnosticKind;
  source: string;
  message: string;
  timestamp: number;
  details?: unknown;
}

const DIAGNOSTIC_LOG_KEY = "aguaphone:runtime-diagnostics";
const PENDING_ERROR_KEY = "aguaphone:pending-runtime-error";
const PENDING_RELOAD_KEY = "aguaphone:pending-reload-reason";
const PENDING_STARTUP_KEY = "aguaphone:pending-startup-diagnostic";
const SESSION_STATE_KEY = "aguaphone:runtime-session-state";
const MAX_DIAGNOSTIC_ENTRIES = 40;

interface RuntimeSessionState {
  sessionId: string;
  startedAt: number;
  lastHeartbeatAt: number;
  lastStage: string;
  lastStageDetails?: unknown;
  endedGracefully: boolean;
}

function getStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readSessionState(): RuntimeSessionState | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(SESSION_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RuntimeSessionState;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionState(state: RuntimeSessionState): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(SESSION_STATE_KEY, JSON.stringify(state));
  } catch {
    return;
  }
}

function writePendingDiagnostic(key: string, entry: RuntimeDiagnosticEntry): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(entry));
  } catch {
    return;
  }
}

function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const errorWithCause = error as Error & { cause?: unknown };
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: normalizeUnknown(errorWithCause.cause),
    };
  }
  return { value: normalizeUnknown(error) };
}

function normalizeUnknown(value: unknown, depth = 0): unknown {
  if (depth >= 4) {
    return "[MaxDepth]";
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Error) {
    return normalizeError(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeUnknown(item, depth + 1));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 20);
    return Object.fromEntries(entries.map(([key, item]) => [key, normalizeUnknown(item, depth + 1)]));
  }
  return String(value);
}

function readEntries(): RuntimeDiagnosticEntry[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(DIAGNOSTIC_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RuntimeDiagnosticEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: RuntimeDiagnosticEntry[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(DIAGNOSTIC_LOG_KEY, JSON.stringify(entries.slice(0, MAX_DIAGNOSTIC_ENTRIES)));
  } catch {
    return;
  }
}

export function recordRuntimeDiagnostic(
  kind: RuntimeDiagnosticKind,
  source: string,
  message: string,
  details?: unknown,
): RuntimeDiagnosticEntry {
  const entry: RuntimeDiagnosticEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    kind,
    source,
    message,
    timestamp: Date.now(),
    details: normalizeUnknown(details),
  };
  const entries = readEntries();
  entries.unshift(entry);
  writeEntries(entries);
  return entry;
}

export function recordRuntimeError(source: string, error: unknown, details?: unknown): RuntimeDiagnosticEntry {
  const entry = recordRuntimeDiagnostic(
    "error",
    source,
    error instanceof Error ? error.message : String(error),
    {
      error: normalizeError(error),
      details: normalizeUnknown(details),
    },
  );
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(PENDING_ERROR_KEY, JSON.stringify(entry));
    } catch {
      return entry;
    }
  }
  return entry;
}

export function recordReloadReason(source: string, message: string, details?: unknown): RuntimeDiagnosticEntry {
  const entry = recordRuntimeDiagnostic("reload", source, message, details);
  writePendingDiagnostic(PENDING_RELOAD_KEY, entry);
  return entry;
}

export function beginRuntimeSession(initialStage: string, details?: unknown): void {
  const previousState = readSessionState();
  if (previousState && !previousState.endedGracefully) {
    const entry = recordRuntimeDiagnostic(
      "error",
      "runtimeSession",
      `Previous session terminated unexpectedly during: ${previousState.lastStage}`,
      {
        previousSessionId: previousState.sessionId,
        startedAt: previousState.startedAt,
        lastHeartbeatAt: previousState.lastHeartbeatAt,
        lastStage: previousState.lastStage,
        lastStageDetails: previousState.lastStageDetails,
      },
    );
    writePendingDiagnostic(PENDING_STARTUP_KEY, entry);
  }

  writeSessionState({
    sessionId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    startedAt: Date.now(),
    lastHeartbeatAt: Date.now(),
    lastStage: initialStage,
    lastStageDetails: normalizeUnknown(details),
    endedGracefully: false,
  });
}

export function updateRuntimeSessionStage(stage: string, details?: unknown): void {
  const currentState = readSessionState();
  if (!currentState) return;
  writeSessionState({
    ...currentState,
    lastHeartbeatAt: Date.now(),
    lastStage: stage,
    lastStageDetails: normalizeUnknown(details),
  });
}

export function heartbeatRuntimeSession(stage?: string, details?: unknown): void {
  const currentState = readSessionState();
  if (!currentState) return;
  writeSessionState({
    ...currentState,
    lastHeartbeatAt: Date.now(),
    lastStage: stage ?? currentState.lastStage,
    lastStageDetails: details === undefined ? currentState.lastStageDetails : normalizeUnknown(details),
  });
}

export function finalizeRuntimeSession(stage = "shutdown"): void {
  const currentState = readSessionState();
  if (!currentState) return;
  writeSessionState({
    ...currentState,
    endedGracefully: true,
    lastHeartbeatAt: Date.now(),
    lastStage: stage,
  });
}

export function consumePendingRuntimeDiagnostics(): RuntimeDiagnosticEntry[] {
  const storage = getStorage();
  if (!storage) return [];
  const keys = [PENDING_ERROR_KEY, PENDING_RELOAD_KEY, PENDING_STARTUP_KEY];
  const results: RuntimeDiagnosticEntry[] = [];
  for (const key of keys) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      storage.removeItem(key);
      const parsed = JSON.parse(raw) as RuntimeDiagnosticEntry;
      if (parsed && typeof parsed === "object") {
        results.push(parsed);
      }
    } catch {
      continue;
    }
  }
  return results.sort((a, b) => a.timestamp - b.timestamp);
}

export function getRuntimeDiagnostics(): RuntimeDiagnosticEntry[] {
  return readEntries();
}
