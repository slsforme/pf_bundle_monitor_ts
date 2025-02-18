import { logger } from "./config/appConfig";
import { grpcUrl } from "./config/config";
import { PumpFunMonitor } from "./src/pumpfun/pumpFunMonitor";
import { tokenBuyMonitor } from "./src/pumpfun/tokenBuysMonitor";
import { tokenMonitor } from "./src/pumpfun/tokenMonitor";


async function main() {
  tokenBuyMonitor.monitorTasks();
  const pumpFunMonitor = new PumpFunMonitor(grpcUrl, tokenMonitor);
  await pumpFunMonitor.startMonitoring()
}

main().catch((error) => {
  logger.error("Error in main():", error);
  process.exit(1);
});