// import { logger } from "./config/appConfig";
// import { grpcUrl } from "./config/config";
// import { tokenMonitor } from "./src/pumpfun/tokenMonitor";
// import { PumpFunMonitor } from "./src/pumpfun/pumpFunMonitor";
// import { accountsMonitor } from "./src/accounts/accountsMonitor";
// import { tokenBuyMonitor } from "./src/pumpfun/tokenBuysMonitor";


// async function main() {
//   accountsMonitor.monitorTasks();
//   tokenBuyMonitor.monitorTasks();
//   const pumpFunMonitor = new PumpFunMonitor(grpcUrl, tokenMonitor);
//   await pumpFunMonitor.startMonitoring()
// }

// main().catch((error) => {
//   logger.error("Error in main():", error);
//   process.exit(1);
// });
import { Connection, PublicKey, ParsedTransactionWithMeta } from "@solana/web3.js";

// RPC-узел Solana
const RPC_URL = "https://api.mainnet-beta.solana.com"; // Используй mainnet, testnet или devnet
const connection = new Connection(RPC_URL, "confirmed");

/**
 * Получает разобранную транзакцию по сигнатуре.
 * @param signature - Сигнатура (id) транзакции.
 * @returns Разобранные данные о транзакции или `null`, если транзакция не найдена.
 */
export async function getParsedTransaction(signature: string): Promise<ParsedTransactionWithMeta | null> {
  try {
    const parsedTx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0, // Поддержка новых версий транзакций
    });

    if (!parsedTx) {
      console.log("❌ Транзакция не найдена:", signature);
      return null;
    }

    console.log("✅ Разобранная транзакция:", parsedTx);
    return parsedTx;
  } catch (error) {
    console.error("🚨 Ошибка при получении транзакции:", error);
    return null;
  }
}

// 🔥 Пример вызова (замени SIG на реальную сигнатуру транзакции)
const signature = "2jHUbjihhg8LYT3wNWz6cEm4w2fM8FyBcXDHWqXrRGQ6ujLo5jxzViSeDv3Z1frUoqfpncUouYyzaevqqcHyLRsP"; // Укажи реальную sig транзакции
getParsedTransaction(signature).then((tx) => {
  if (tx) {
    console.log(tx.transaction.message.accountKeys);
  }
});
