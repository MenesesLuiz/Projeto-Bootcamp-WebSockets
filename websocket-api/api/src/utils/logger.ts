type LogLevel = "debug" | "info" | "warn" | "error" | "silent";
type LogMeta = Record<string, unknown>;

const LEVEL_WEIGHT: Record<Exclude<LogLevel, "silent">, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveDefaultLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL as LogLevel | undefined;
  if (configured && configured in LEVEL_WEIGHT) {
    return configured;
  }
  // Keep test output clean unless a level is explicitly requested.
  return process.env.NODE_ENV === "test" ? "silent" : "info";
}

/**
 * Minimal structured logger: one JSON object per line, with level filtering
 * and named contexts (e.g. `logger.child("ws")`) so log lines can be traced
 * back to the part of the app that emitted them.
 */
export class Logger {
  private readonly context: string;
  private readonly level: LogLevel;

  constructor(context = "app", level: LogLevel = resolveDefaultLevel()) {
    this.context = context;
    this.level = level;
  }

  child(context: string): Logger {
    return new Logger(`${this.context}:${context}`, this.level);
  }

  debug(message: string, meta?: LogMeta): void {
    this.write("debug", message, meta);
  }

  info(message: string, meta?: LogMeta): void {
    this.write("info", message, meta);
  }

  warn(message: string, meta?: LogMeta): void {
    this.write("warn", message, meta);
  }

  error(message: string, meta?: LogMeta): void {
    this.write("error", message, meta);
  }

  private write(level: Exclude<LogLevel, "silent">, message: string, meta?: LogMeta): void {
    if (this.level === "silent" || LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.level as Exclude<LogLevel, "silent">]) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      ...meta,
    };

    const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    sink(JSON.stringify(entry));
  }
}

export const logger = new Logger();
export type { LogLevel, LogMeta };
