import { logger } from "./config/appConfig";
import { grpcUrl } from "./config/config";
import { tokenMonitor } from "./src/pumpfun/tokenMonitor";
import { PumpFunMonitor } from "./src/pumpfun/pumpFunMonitor";
import { accountsMonitor, blacklistHandler } from "./src/accounts/accountsMonitor";
import { tokenBuyMonitor } from "./src/pumpfun/tokenBuysMonitor";

async function main() {
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
