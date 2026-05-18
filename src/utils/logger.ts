// 简化的 logger 实现，兼容 pino API 和旧版自定义 Logger

export function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try { return JSON.stringify(e); } catch { return String(e); }
}

export const logger = {
  info(tagOrMsg?: string, msg?: string, ...args: any[]) {
    if (!tagOrMsg) return;
    if (!msg) {
      console.log(`[INFO] ${tagOrMsg}`);
    } else {
      console.log(`[INFO] [${tagOrMsg}] ${msg}`);
    }
  },
  
  warn(tagOrMsg?: string, msg?: string, ...args: any[]) {
    if (!tagOrMsg) return;
    if (!msg) {
      console.warn(`[WARN] ${tagOrMsg}`);
    } else {
      console.warn(`[WARN] [${tagOrMsg}] ${msg}`);
    }
  },
  
  error(tagOrMsg?: string, msg?: string, ...args: any[]) {
    if (!tagOrMsg) return;
    if (!msg) {
      console.error(`[ERROR] ${tagOrMsg}`);
    } else {
      console.error(`[ERROR] [${tagOrMsg}] ${msg}`);
    }
  },
  
  debug(tagOrMsg?: string, msg?: string, ...args: any[]) {
    if (!tagOrMsg) return;
    if (process.env.LOG_LEVEL === 'debug') {
      if (!msg) {
        console.log(`[DEBUG] ${tagOrMsg}`);
      } else {
        console.log(`[DEBUG] [${tagOrMsg}] ${msg}`);
      }
    }
  },
  
  setLevel(level: string) {
    // 兼容旧 API
  },
  
  setLogFile(path: string) {
    // 兼容旧 API
  },
};
