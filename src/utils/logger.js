import pino from 'pino';

const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

function serializeArgs(args) {
  const mergingObject = {};
  for (const arg of args) {
    if (arg instanceof Error) {
      mergingObject.err = arg;
      if (arg.cause) {
        mergingObject.cause = arg.cause instanceof Error
          ? { message: arg.cause.message, stack: arg.cause.stack }
          : arg.cause;
      }
    } else if (arg !== undefined && arg !== null) {
      mergingObject.extra = arg;
    }
  }
  return mergingObject;
}

export const logger = {
  debug: (msg, ...args) => pinoLogger.debug(serializeArgs(args), msg),
  info: (msg, ...args) => pinoLogger.info(serializeArgs(args), msg),
  warn: (msg, ...args) => pinoLogger.warn(serializeArgs(args), msg),
  error: (msg, ...args) => pinoLogger.error(serializeArgs(args), msg),
  setLevel(level) {
    pinoLogger.level = level;
  },
  setLogFile(_path) {
    // pino file logging requires pino.destination; no-op for now
  },
};
