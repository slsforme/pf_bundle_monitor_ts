import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc"
import { setTimeout as delay } from "node:timers/promises";
import { Kafka } from 'kafkajs';
import * as fs from 'fs';
import * as path from 'path';


import { asyncLogger } from "../../config/appConfig";
import { grpcUrl, backupGrpcUrl } from "../../config/config";
import { tOutPut } from "./utils/transactionOutput";
import { parseArgs } from "node:util";

const blacklistFilePath = path.join(__dirname, '../data/blacklist-wallets.txt');
const whitelistFilePath = path.join(__dirname, '../data/whitelist-wallets.txt');


// Cache to prevent duplicate reads of blacklist/whitelist files
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
    BlacklistHandler.whiteList = fs.readFileSync(whitelistFilePath, 'utf8').split('\n');;
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

  public static async isWalletOnWhitelist(wallet: string): Promise<string | undefined> {
      if (this.whiteList.includes(wallet)) {
          return wallet; 
      } else {
          return undefined; 
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
    asyncLogger.info(`${relatedAccounts.length}`);
    relatedAccounts.forEach((related) => {
      asyncLogger.info(related.join(' -> ')); 
    });
  }
}


class AccountsMonitor {
  private client: Client;
  private reconnecting = false;
  private kafkaConsumer: any;
  private wallets = new Set();


  constructor(private endpoint: string = grpcUrl) {
    this.client = new Client(this.endpoint, undefined, undefined);
    this.initKafkaConsumer();
  }

  private async checkConnection(): Promise<boolean> {
    try {
      await this.client.ping(1);
      return true;
    } catch (error) {
      if (!this.reconnecting) {
        this.reconnecting = true;
        asyncLogger.error(`Ping failed for ${this.endpoint}, switching to backup...`);
        this.endpoint = this.endpoint === grpcUrl ? backupGrpcUrl : grpcUrl;
        this.client = new Client(this.endpoint, undefined, undefined);
        this.reconnecting = false;
      }
      return false;
    }
  }

  public async handleStream(account: string, mintAddress: string, keyAccount?: string): Promise<void> {
    if (this.wallets.has(account)){
      return;
    } else {
      this.wallets.add(account);
    }
    const request: SubscribeRequest = {
      accounts: {}, 
      slots: {},
      transactions: {
        "holders": {
          accountInclude: [account],
          accountExclude: [],
          accountRequired: []
        }
      },
      entry: {},
      blocks: {},
      blocksMeta: {},
      accountsDataSlice: [],
      ping: undefined,
      commitment: CommitmentLevel.FINALIZED,
    };

    asyncLogger.info(`Tracking ${account} txs.`)

    while (true) {
      try {
        if (!(await this.checkConnection())) {
          await delay(1000);
          continue;
        }

        const stream = await this.client.subscribe();
        
        // Set up error handling
        const streamClosed = new Promise<void>((resolve, reject) => {
          stream.on("error", (error) => {
            asyncLogger.error(`Stream error for account ${account}: ${error}`);
            reject(error);
            stream.end();
          });
          stream.on("end", resolve);
          stream.on("close", resolve);
        });

        // Set up data processing
        stream.on("data", async (data) => {
          try {
            const result = await tOutPut(data);
            if (!result) return;
            
            const isOutflow = (result.postBalances[0] - result.preBalances[0]) < 0;
            const transferAmount = isOutflow 
              ? (result.preBalances[0] - result.postBalances[0])
              : (result.postBalances[0] - result.preBalances[0]);
              
            if (transferAmount / 1_000_000_000 >= 0.1 && result.message.accountKeys.length < 7) {
              const wallet = result.message.accountKeys[0] === account
                ? result.message.accountKeys[1]
                : result.message.accountKeys[0];
                
              const flowType = isOutflow ? "outflow" : "inflow";
              const walletOnWhitelist: string | undefined = await BlacklistHandler.isWalletOnWhitelist(wallet);
              if (!walletOnWhitelist)
              {
                asyncLogger.info(`Found ${flowType} tx: ${result.signature} by ${account}\n Tracking ${isOutflow ? "receiver" : "sender"} wallet: ${wallet}`);
                if (keyAccount){
                  blacklistHandler.addAccountToCache(mintAddress, wallet, keyAccount);
                  this.handleStream(wallet, mintAddress, keyAccount);
                } else {
                    blacklistHandler.addAccountToCache(mintAddress, wallet, account);
                    this.handleStream(wallet, mintAddress, account);
                }
              } 
              else {
                 if (isOutflow && (result.postBalances[0] / 1_000_000_000) < 0.1)
                 {
                  asyncLogger.info(`Found outflow tx: ${result.signature} by ${account} to exchange - whitelist wallet: ${walletOnWhitelist} `);
                 }
              }
            }
          } catch (error) {
            asyncLogger.error(`Error processing transaction: ${error}`);
          }
        });

        // Start subscription
        await new Promise<void>((resolve, reject) => {
          stream.write(request, (err: any) => {
            if (!err) {
              resolve();
            } else {
              reject(err);
            }
          });
        });

        await streamClosed;
        
      } catch (error) {
        asyncLogger.error(`Stream error for account ${account}, reconnecting in 2 seconds: ${error}`);
        await delay(2000);
      }
    }
  }


  private async initKafkaConsumer() {
    const kafka = new Kafka({
      clientId: 'app',
      brokers: ['localhost:9092'],
    });

    this.kafkaConsumer = kafka.consumer({ groupId: 'accounts-monitor' });

    await this.kafkaConsumer.connect();
    await this.kafkaConsumer.subscribe({ topic: 'topic4', fromBeginning: true });

    await this.kafkaConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const msg = JSON.parse(message.value?.toString());
        
        const mintAddress: string = msg.mintAddress;
        const wallet: string = msg.wallet;

        this.handleStream(wallet, mintAddress);
      },
    });

    asyncLogger.info('accountsMonitor Kafka consumer connected and listening for messages on topic4.');
  }
}


export const blacklistHandler = new BlacklistHandler();
export const accountsMonitor = new AccountsMonitor();

