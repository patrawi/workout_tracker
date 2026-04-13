// src/lib/logger.ts

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

function formatLogEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

function createLogger(context: string = "app") {
  const logLevel = (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO;
  const levelOrder = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
  const minLevel = levelOrder[logLevel] ?? 1;

  function emit(level: LogLevel, message: string, contextData?: Record<string, unknown>) {
    if (levelOrder[level] < minLevel) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: { ...contextData, source: context },
    };

    const output = formatLogEntry(entry);

    switch (level) {
      case LogLevel.ERROR:
        console.error(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  return {
    debug: (message: string, ctx?: Record<string, unknown>) => emit(LogLevel.DEBUG, message, ctx),
    info: (message: string, ctx?: Record<string, unknown>) => emit(LogLevel.INFO, message, ctx),
    warn: (message: string, ctx?: Record<string, unknown>) => emit(LogLevel.WARN, message, ctx),
    error: (message: string, ctx?: Record<string, unknown>) => emit(LogLevel.ERROR, message, ctx),
  };
}

export const logger = createLogger("app");
export function createChildLogger(context: string) {
  return createLogger(context);
}
