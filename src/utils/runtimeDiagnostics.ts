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
const MAX_DIAGNOSTIC_ENTRIES = 40;

function getStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
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
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(PENDING_RELOAD_KEY, JSON.stringify(entry));
    } catch {
      return entry;
    }
  }
  return entry;
}

export function consumePendingRuntimeDiagnostics(): RuntimeDiagnosticEntry[] {
  const storage = getStorage();
  if (!storage) return [];
  const keys = [PENDING_ERROR_KEY, PENDING_RELOAD_KEY];
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
