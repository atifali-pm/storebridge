import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";
const level = process.env.LOG_LEVEL ?? (isDev ? "debug" : "info");

export const logger = pino({
  level,
  base: { service: "storebridge" },
  redact: {
    paths: [
      "access_token",
      "accessToken",
      "*.access_token",
      "*.accessToken",
      "password",
      "*.password",
      "authorization",
      "*.authorization",
      "cookie",
      "*.cookie",
    ],
    censor: "[REDACTED]",
  },
  transport: isDev
    ? {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
      }
    : undefined,
});

export type Logger = typeof logger;
