import Client from "@triton-one/yellowstone-grpc";
import winston from "winston";
import { backupGrpcUrl, grpcUrl } from "./config";

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
    new winston.transports.File({ filename: './logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: './logs/info.log', level: 'info' }),
  ],
});

export const client: Client  = new Client(grpcUrl, undefined, undefined);
export const backupClient: Client = new Client(backupGrpcUrl, undefined, undefined);



