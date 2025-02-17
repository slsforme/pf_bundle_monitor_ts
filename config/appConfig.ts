import pino from "pino";

// export const logger = pino(pino.destination({
//   dest: './test.log',  // TODO: logs dir
//   sync: false,
//   level: "info",
//   transport: {
//     target: "pino-pretty",
//     options: {
//       colorize: true, 
//       translateTime: "yyyy-mm-dd HH:MM:ss",
//       ignore: "pid,hostname",  
//     },
//   },
// }))


export const logger = pino({
  level: "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true, 
      translateTime: "yyyy-mm-dd HH:MM:ss",
      ignore: "pid,hostname",  
    },
  },
  base: { pid: false }, 
})