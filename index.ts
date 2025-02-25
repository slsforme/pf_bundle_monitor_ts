import { asyncLogger } from "./config/appConfig";
import { tokenMonitor } from "./src/pumpfun/tokenMonitor";
import { PumpFunMonitor } from "./src/pumpfun/pumpFunMonitor";
import { accountsMonitor } from "./src/accounts/accountsMonitor";
import { tokenBuyMonitor } from "./src/pumpfun/tokenBuysMonitor";

async function main() {
  tokenMonitor.monitorTokens();
  accountsMonitor.monitorTasks();
  tokenBuyMonitor.monitorTasks();
  const pumpFunMonitor = new PumpFunMonitor(tokenMonitor);
  await pumpFunMonitor.startMonitoring();
}

main().catch((error) => {
  asyncLogger.error(`Error in main(): ${error}`);
  process.exit(1);
});
