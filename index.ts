import { raydiumMigrationMonitor } from "./src/raydium/raydiumMonitor";
import { asyncLogger } from "./config/appConfig";
import { pumpFunMonitor } from "./src/pumpfun/pumpFunMonitor";
import { tokenBuyMonitor } from "./src/pumpfun/tokenBuysMonitor";

async function main() {
  tokenBuyMonitor.monitorTasks();
  pumpFunMonitor.startMonitoring();
  raydiumMigrationMonitor.startMonitoring();

}

main().catch((error) => {
  asyncLogger.error(`Error in main(): ${error}`);
  process.exit(1);
});
