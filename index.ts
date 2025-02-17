import { Connection, 
  ConfirmedSignatureInfo,
  PublicKey, 
  ParsedTransactionWithMeta,
  GetVersionedTransactionConfig,
  SignaturesForAddressOptions  
} from "@solana/web3.js";

import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';

import { logger } from "./config/appConfig";

const test_array: string[] = [
  "9dj9M3SB3LuTXmJjxHDsnYq3XFDC6T6F8tPSGdn64eFu",
  "86Ddr8gRurNHDjdhUGkkq97BhFqA8Qa6S6yBf733NSoZ",
  "CPzyy7YrnwRYQNgVzpi44ztRsJwgwJKTpUyKgvDqXLZt"
];



async function checkBlacklist(ca: string): Promise<boolean> {
    const blacklistFilePath = path.join(__dirname, './src/data/blacklist-wallets.txt');
    const whitelistFilePath = path.join(__dirname, './src/data/whitelist-wallets.txt');
    try {
      const data1 = await fs.promises.readFile(blacklistFilePath, 'utf8');
      const data2 = await fs.promises.readFile(whitelistFilePath, 'utf8');

      const blackList = data1 + "\n" + data2;

      if (blackList.includes(ca)) {
          console.log("sdkjkjsdksd");
          return true;
      } else {
          return false;
      }
  } catch (error) {
      console.error("Ошибка при чтении файлов:", error);
      return false;
  }
}

const accs: Set<string> = new Set<string>();
const accs_cache = new Map<string, number>();

async function addAccountToCache(account: string){ // TODO: impl добавления каждого ПРОВЕРЯЕМОГО кошелька в кэш
  if (!(account in accs_cache)){
      accs_cache[account] = 0;
  }

  if (accs.has(account)) {
      accs_cache[account] += 1;
  } else {
    accs.add(account);
  }

  for (const [key, value] of accs_cache) {
    if (value >= 3) {
      logger.info(`Account ${key} got blacklisted. Going through txs.`)
      // TODO: добавление в бл и проверка по другим кошам
    }
  }
}



const connection: Connection = new Connection("https://mainnet.helius-rpc.com/?api-key=bb33a1e2-d885-4a6e-af28-453c00cdfdbe");

async function fetchAccountTransactions(account: string) {
    /*
    Для каждого токена парсить все tx каждого холдера - готово
    Добавляем каждого отправителя в Set<T>, если в Set уже есть отправитель - закидываем его в словарь с ключом "pubkey": кол_во_совпадений
    если совпадение >= 3 - кидаем его blacklist и мы идём по тем кошелькам, которым он отправил > 0.1 $SOL, трекаем кошелёк, если на нём баланс стал равен 0, 
    то трекаем валлет, которому он сделал < 0.1 SOL перевод
    */ 
    const isAccountBlacklisted: boolean = await checkBlacklist(account);
    console.log(isAccountBlacklisted);
    if (isAccountBlacklisted) {
      logger.info(`Account ${account} is already blacklisted.`);
      return;  // account check is over, don't need to go any further
    }
    try {
        console.log()
        const pubkey = new PublicKey(account);
        const options: SignaturesForAddressOptions = {
          limit: 10
        }

        const data: Array<ConfirmedSignatureInfo> = await connection.getSignaturesForAddress(pubkey, options);
        const signs: Array<string> =  ["4X7CaB6v7iXwy7Z56e6n6Gp8bbkrzmrzryEDfmVhA9PLJLMg7jsbiQ1foPk6GzQDmWWCnuza5hCLhWG6yuSL5pkw"]// data.map(tx => tx.signature);

        const tx_config: GetVersionedTransactionConfig = {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0
        }
        
        // verification for pump.fun token holders 
        signs.forEach(async (sign: string) => {
          const tx = await connection.getParsedTransaction(sign, tx_config);
          if (tx.meta.preBalances.length === 1) {  // for programs
            if (tx.meta.preBalances[0] < tx.meta.postBalances[0]) {  // checking that tx is an inflow type
              if (((tx.meta.postBalances[0] - tx.meta.preBalances[0]) / 1_000_000_000) > 0.1){  // if amount of tx > 0.1 $SOL
                const keys = tx.transaction.message.accountKeys;
                for (const data of keys) {
                  if (data.signer === true) {
                    console.log(data.pubkey.toBase58());  // TODO: pass an address for another check
                    break; 
                  }
                }
              }
            }
          } else if (tx.meta.preBalances.length > 1 && tx.meta.preBalances.length < 5){  // for usual accounts
            if (tx.meta.postBalances[1] > tx.meta.preBalances[1]) {  // checking that tx is an inflow type
              if (((tx.meta.postBalances[1] - tx.meta.preBalances[1]) / 1_000_000_000) > 0.1){  // if amount of tx > 0.1 $SOL
                const keys = tx.transaction.message.accountKeys;
                for (const data of keys) {
                  if (data.signer === true) {
                    console.log(data.pubkey.toBase58());  // TODO: pass an address for another check
                    break; 
                  }
                }
              }
            }
          }
        });
    } catch (error) {
        console.error("Error:", error);
    }
}

fetchAccountTransactions("CPzyy7YrnwRYQNgVzpi44ztRsJwgwJKTpUyKgvDqXLZt");


  

