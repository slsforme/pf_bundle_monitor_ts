import Client from "@triton-one/yellowstone-grpc";
import winston from "winston";
import fs from "fs";
import path from "path";
import { backupGrpcUrl, grpcUrl } from "./config";
import Redis from "ioredis";

function getDailyLogFolder(): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; 
  const logFolder = path.join('./logs', dateStr);
  
  if (!fs.existsSync(logFolder)) {
    fs.mkdirSync(logFolder, { recursive: true });
  }
  
  return logFolder;
}
function getLogFilePaths() {
  const logFolder = getDailyLogFolder();
  return {
    errorLog: path.join(logFolder, 'error.log'),
    infoLog: path.join(logFolder, 'info.log')
  };
}

if (!fs.existsSync('./logs')) {
  fs.mkdirSync('./logs', { recursive: true });
}

const { errorLog, infoLog } = getLogFilePaths();

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'DD-MM-YYYY HH:mm:ss.SSS' }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
      ),
    }),
    new winston.transports.File({ filename: errorLog, level: 'error' }),
    new winston.transports.File({ filename: infoLog, level: 'info' }),
  ],
});

function updateLogFilePaths() {
  const { errorLog, infoLog } = getLogFilePaths();
  
  logger.transports.forEach((transport, index) => {
    if (transport instanceof winston.transports.File) {
      logger.transports.splice(index, 1);
    }
  });
  
  logger.add(new winston.transports.File({ filename: errorLog, level: 'error' }));
  logger.add(new winston.transports.File({ filename: infoLog, level: 'info' }));
}

function scheduleNextMidnight() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const timeUntilMidnight = tomorrow.getTime() - now.getTime();
  
  setTimeout(() => {
    updateLogFilePaths();
    scheduleNextMidnight(); 
  }, timeUntilMidnight);
}

scheduleNextMidnight();

export const asyncLogger = {
  info: (message: string) => {
    setImmediate(() => logger.info(message));
  },
  error: (message: string) => {
    setImmediate(() => logger.error(message));
  },
  warn: (message: string) => {
    setImmediate(() => logger.warn(message));
  },
  debug: (message: string) => {
    setImmediate(() => logger.debug(message));
  }           
};

// Клиенты
export const client: Client = new Client(grpcUrl, undefined, { "grpc.max_receive_message_length": 64 * 1024 * 1024 });
export const backupClient: Client = new Client(backupGrpcUrl, undefined, { "grpc.max_receive_message_length": 64 * 1024 * 1024 });
export const redis = new Redis();