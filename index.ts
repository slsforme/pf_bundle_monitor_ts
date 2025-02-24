import { logger } from "./config/appConfig";
import { tokenMonitor } from "./src/pumpfun/tokenMonitor";
import { PumpFunMonitor } from "./src/pumpfun/pumpFunMonitor";
import { accountsMonitor, blacklistHandler } from "./src/accounts/accountsMonitor";
import { tokenBuyMonitor } from "./src/pumpfun/tokenBuysMonitor";



async function monitorMemoryUsage() {
  setInterval(async () => {
    const memoryUsage = process.memoryUsage();

    logger.info(`Heap Used: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    logger.info(`Heap Total: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    logger.info(`RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`);

  }, 5000);
}


async function main() {
  // monitorMemoryUsage();
  tokenMonitor.monitorTokens();
  accountsMonitor.monitorTasks();
  tokenBuyMonitor.monitorTasks();
  blacklistHandler.trackMatchMapChanges();
  const pumpFunMonitor = new PumpFunMonitor(tokenMonitor);
  await pumpFunMonitor.startMonitoring();
}

main().catch((error) => {
  logger.error("Error in main():", error);
  process.exit(1);
});
