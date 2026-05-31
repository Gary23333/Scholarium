// 简化的 logger 实现，兼容 pino API 和旧版自定义 Logger

export function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export const logger = {
  info(tagOrMsg?: string, msg?: unknown, ..._args: any[]) {
    if (!tagOrMsg) return;
    if (msg === undefined || msg === null) {
      console.log(`[INFO] ${tagOrMsg}`);
    } else if (msg instanceof Error) {
      console.log(`[INFO] ${tagOrMsg}`, msg);
    } else {
      console.log(`[INFO] [${tagOrMsg}] ${msg}`);
    }
  },

  warn(tagOrMsg?: string, msg?: unknown, ..._args: any[]) {
    if (!tagOrMsg) return;
    if (msg === undefined || msg === null) {
      console.warn(`[WARN] ${tagOrMsg}`);
    } else if (msg instanceof Error) {
      console.warn(`[WARN] ${tagOrMsg}`, msg);
    } else {
      console.warn(`[WARN] [${tagOrMsg}] ${msg}`);
    }
  },

  error(tagOrMsg?: string, msg?: unknown, ..._args: any[]) {
    if (!tagOrMsg) return;
    if (msg === undefined || msg === null) {
      console.error(`[ERROR] ${tagOrMsg}`);
    } else if (msg instanceof Error) {
      console.error(`[ERROR] ${tagOrMsg}`, msg);
      if (msg.cause) {
        console.error(`[ERROR] Caused by:`, msg.cause instanceof Error ? msg.cause : String(msg.cause));
      }
    } else {
      console.error(`[ERROR] [${tagOrMsg}] ${msg}`);
    }
  },

  debug(tagOrMsg?: string, msg?: unknown, ..._args: any[]) {
    if (!tagOrMsg) return;
    if (process.env.LOG_LEVEL === 'debug') {
      if (msg === undefined || msg === null) {
        console.log(`[DEBUG] ${tagOrMsg}`);
      } else if (msg instanceof Error) {
        console.log(`[DEBUG] ${tagOrMsg}`, msg);
      } else {
        console.log(`[DEBUG] [${tagOrMsg}] ${msg}`);
      }
    }
  },

  setLevel(_level: string) {
    // 兼容旧 API
  },

  setLogFile(_path: string) {
    // 兼容旧 API
  },
};
