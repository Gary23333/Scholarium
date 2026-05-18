import pino from 'pino';

const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

export const logger = {
  debug: (msg, ...args) => pinoLogger.debug(args.length > 0 ? { args } : {}, msg),
  info: (msg, ...args) => pinoLogger.info(args.length > 0 ? { args } : {}, msg),
  warn: (msg, ...args) => pinoLogger.warn(args.length > 0 ? { args } : {}, msg),
  error: (msg, ...args) => pinoLogger.error(args.length > 0 ? { args } : {}, msg),
};
