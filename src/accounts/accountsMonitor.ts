import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc"
import { setTimeout as delay } from "node:timers/promises";
import { Kafka } from 'kafkajs';
import * as fs from 'fs';
import * as path from 'path';


import { asyncLogger } from "../../config/appConfig";
import { grpcUrl, backupGrpcUrl } from "../../config/config";
import { tOutPut } from "./utils/transactionOutput";

const blacklistFilePath = path.join(__dirname, '../data/blacklist-wallets.txt');
const whitelistFilePath = path.join(__dirname, '../data/whitelist-wallets.txt');


let cachedBlacklist: Set<string> | null = null;
let lastBlacklistUpdate = 0;
const CACHE_TTL = 60000; 

export class BlacklistHandler {
  private blacklist: Set<string> = new Set<string>();
  private accs: Record<string, Set<string>> = {};
  private accsCache = new Map<string, number>();
  private static whiteList: Array<string>;
  private blacklistTracker = new Map<string, Map<string, Array<string>>>();;
  
  constructor() {
    BlacklistHandler.whiteList = fs.readFileSync(whitelistFilePath, 'utf8')
    .split('\n')
    .map(item => item.replace(/[\r\n\s]+/g, '')); 
  }

  public static async getBlacklist(): Promise<Set<string>> {
    const currentTime = Date.now();
    
    if (cachedBlacklist && (currentTime - lastBlacklistUpdate < CACHE_TTL)) {
      return cachedBlacklist;
    }
    
    try {
      // Read both files concurrently
      const [blacklistData] = await Promise.all([
        fs.promises.readFile(blacklistFilePath, 'utf8').catch(() => ''),
      ]);
      
      // Process wallets from both files
      const wallets = new Set<string>();
      const processFile = (data: string) => {
        data.split('\n').forEach(line => {
          const wallet = line.trim();
          if (wallet) wallets.add(wallet);
        });
      };
      
      processFile(blacklistData);
      
      cachedBlacklist = wallets;
      lastBlacklistUpdate = currentTime;
      
      return wallets;
    } catch (error) {
      asyncLogger.error(`Error loading blacklist: ${error}`);
      return new Set<string>();
    }
  }

  public static async isWalletOnBlacklist(wallet: string): Promise<boolean> {
    try {
      const blacklist = await BlacklistHandler.getBlacklist();
      return blacklist.has(wallet);
    } catch (error) {
      asyncLogger.error(`Error checking blacklist: ${error}`);
      return false;
    }
  }

  public static async isWalletOnWhitelist(wallet: string): Promise<boolean> {
      if (this.whiteList.includes(wallet)) {
          return true; 
      } else {
          return false; 
      }
  }


  public static async addWalletToBlacklist(wallet: string): Promise<boolean> {
    try {
      const blacklist = await BlacklistHandler.getBlacklist();
      if (blacklist.has(wallet)) {
        return false; 
      }
      
      await fs.promises.appendFile(blacklistFilePath, `${wallet}\n`, "utf8");
      blacklist.add(wallet);
      cachedBlacklist = blacklist;
      lastBlacklistUpdate = Date.now();
      
      return true;
    } catch (error) {
      asyncLogger.error(`Error adding wallet to blacklist: ${error}`);
      return false;
    }
  }
  

  public async addAccountToCache(token: string, account: string, keyAccount?: string): Promise<void> {    
    if (keyAccount) {
      this.addAccountToBlacklistTracker(token, account, keyAccount);

      if (!this.accsCache.has(account)) {
        this.accsCache.set(account, 0);
      }

      if (!(token in this.accs)) {
        this.accs[token] = new Set<string>();
      }

      asyncLogger.info(`${keyAccount} -> ${account}`);

      if (this.accs[token].has(account)) {
        const currentCount = this.accsCache.get(account) ?? 0;
        this.accsCache.set(account, currentCount + 1);
        asyncLogger.info(`Already has this account in cache: ${account}`);
      } else {
        this.accs[token].add(account);
      }
    
      for (const [key, value] of this.accsCache.entries()) {
        if (value >= 3 && !this.blacklist.has(key)) {
          const isBlacklisted = await BlacklistHandler.isWalletOnBlacklist(key);
          if (!isBlacklisted) {
            this.blacklist.add(key);
            const added = await BlacklistHandler.addWalletToBlacklist(key);
            if (added) {
              asyncLogger.info(`Account ${key} got blacklisted.`);
              this.findAndLogRelations(token, account);
            }
          }
        } 
      }
    }
  }

  private addAccountToBlacklistTracker(token: string, account: string, keyAccount: string) {
    const keyAccountsMap = this.blacklistTracker.get(token) || new Map<string, Array<string>>();

    const accounts = keyAccountsMap.get(keyAccount) || [];

    accounts.push(account);

    keyAccountsMap.set(keyAccount, accounts);

    this.blacklistTracker.set(token, keyAccountsMap);
  }

  private findAndLogRelations(token: string, account: string){
    const keyAccountsMap = this.blacklistTracker.get(token);

    const relatedAccounts = new Array<Array<string>>();

    keyAccountsMap.forEach((accounts, keyAccount) => {
      if (accounts.includes(account)) {
          relatedAccounts.push([keyAccount, ...accounts]);
      }
    });

    asyncLogger.info("Found relation:")
    relatedAccounts.forEach((related) => {
      asyncLogger.info(related.join(' -> ')); 
      related.forEach(wallet => {
        BlacklistHandler.addWalletToBlacklist(wallet);
      });
    });
  }

}


class AccountsMonitor {
  private kafkaConsumer: any;

  constructor(private endpoint: string = grpcUrl) {
    this.initKafkaConsumer();
  }

  private async initKafkaConsumer() {
    const kafka = new Kafka({
      clientId: 'app',
      brokers: ['localhost:9092'],
    });

    this.kafkaConsumer = kafka.consumer({ groupId: 'accounts-monitor' });

    await this.kafkaConsumer.connect();
    await this.kafkaConsumer.subscribe({ topic: 'topic6', fromBeginning: true });

    await this.kafkaConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const msg = JSON.parse(message.value?.toString());
        
        const mintAddress: string = msg.mintAddress;
        const account: string = msg.account;
        const keyAccount: string = msg.keyAccount;

        blacklistHandler.addAccountToCache(mintAddress, account, keyAccount);
        asyncLogger.info("Received data");

        // TOFIX: data receiving 
      },
    });

    asyncLogger.info('accountsMonitor Kafka consumer connected and listening for messages on topic5.');
  }
}


export const blacklistHandler = new BlacklistHandler();
export const accountsMonitor = new AccountsMonitor();

