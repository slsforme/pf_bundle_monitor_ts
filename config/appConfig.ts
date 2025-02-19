import pino from "pino";

// export const logger = pino({
//   level: "info",
//   transport: {
//     target: "pino-pretty",
//     options: {
//       colorize: true, 
//       translateTime: "yyyy-mm-dd HH:MM:ss",
//       ignore: "pid,hostname",  
//     },
//   },
//   base: { pid: false }, 
// })

import winston, { format } from "winston";
import { DateTime } from 'luxon';


const getLuxonTimestamp = () => {
  return `${DateTime.now().setZone('Europe/Paris').toFormat('yyyy-MM-dd HH:mm:ss.SSS')}`;
};

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




