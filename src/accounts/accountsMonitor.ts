import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc"
import { setTimeout as delay } from "node:timers/promises";
import * as fs from 'fs';
import * as path from 'path';

import { asyncLogger } from "../../config/appConfig";
import { grpcUrl, backupGrpcUrl } from "../../config/config";
import { tOutPut } from "./utils/transactionOutput";

const blacklistFilePath = path.join(__dirname, '../data/blacklist-wallets.txt');
const whitelistFilePath = path.join(__dirname, '../data/whitelist-wallets.txt');

// Cache to prevent duplicate reads of blacklist/whitelist files
let cachedBlacklist: Set<string> | null = null;
let lastBlacklistUpdate = 0;
const CACHE_TTL = 60000; // 1 minute cache TTL

export class BlacklistHandler {
  private blacklist: Set<string> = new Set<string>();
  private accs: Record<string, Set<string>> = {};
  private accsCache = new Map<string, number>();
  private blacklistTracker = new Map<string, Map<string, string[]>>();
  private matchMap = new Map<string, { 
    count: number; 
    keyAccount: string; 
    token: string; 
    relationalAccounts: string[];
    allRelations: string[][];
  }>();
  private printedWallets = new Set<string>();

  // Load blacklist into memory efficiently
  public static async getBlacklist(): Promise<Set<string>> {
    const currentTime = Date.now();
    
    // Return cached data if it's fresh
    if (cachedBlacklist && (currentTime - lastBlacklistUpdate < CACHE_TTL)) {
      return cachedBlacklist;
    }
    
    try {
      // Read both files concurrently
      const [blacklistData, whitelistData] = await Promise.all([
        fs.promises.readFile(blacklistFilePath, 'utf8').catch(() => ''),
        fs.promises.readFile(whitelistFilePath, 'utf8').catch(() => '')
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
      processFile(whitelistData);
      
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

  public static async addWalletToBlacklist(wallet: string): Promise<boolean> {
    try {
      // Check if wallet is already blacklisted to prevent duplicates
      const blacklist = await BlacklistHandler.getBlacklist();
      if (blacklist.has(wallet)) {
        return false; // Already exists
      }
      
      // Add to file and update cache
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

  public async trackMatchMapChanges(): Promise<void> {
    while (true) {
      for (const [key, value] of this.matchMap.entries()) {
        if (value.count >= 3 && !this.printedWallets.has(key)) { 
          asyncLogger.info(`Found new relations for blacklist.
            Account: ${key}  
            Совпадений: ${value.count}
            KeyAccount: ${value.keyAccount}
            Token Mint Address: ${value.token}
            Relational Accounts: ${value.relationalAccounts.join(', ')}
            All Relations:
            ${value.allRelations.map((relation, index) => `[${index + 1}] ${relation.join(' -> ')}`).join('\n')}
            --------------------------`);            
          this.printedWallets.add(key);
        }
      }
      await delay(1000);
    }
  }
  
  public async addAccountToBlacklistTracker(token: string, keyAccount: string, account: string): Promise<void> {
    // Get or create token map
    if (!this.blacklistTracker.has(token)) {
      this.blacklistTracker.set(token, new Map([[keyAccount, [account]]]));
    } else {
      const tokenMap = this.blacklistTracker.get(token)!;
      
      // Get or create account list for key account
      if (!tokenMap.has(keyAccount)) {
        tokenMap.set(keyAccount, [account]);
      } else {
        const accounts = tokenMap.get(keyAccount)!;
        
        // Add account if not already present
        if (!accounts.includes(account)) {
          accounts.push(account);
        }
      }
    }

    this.updateMatchMap(token);
  }
  
  private updateMatchMap(token: string): void {
    const tokenMap = this.blacklistTracker.get(token);
    if (!tokenMap) return;
    
    const keyAccounts = Array.from(tokenMap.keys());
    
    // For each key account in the token
    for (let i = 0; i < keyAccounts.length; i++) {
      const accounts = tokenMap.get(keyAccounts[i]);
      if (!accounts) continue;

      // Compare with all other key accounts
      for (let j = 0; j < keyAccounts.length; j++) { 
        if (i === j) continue;

        const nextAccounts = tokenMap.get(keyAccounts[j]);
        if (!nextAccounts) continue;
        
        // Check each account for matches
        accounts.forEach(account => {
          if (!this.matchMap.has(account)) {
            this.matchMap.set(account, {
              count: 0,
              keyAccount: "",
              token: "",
              relationalAccounts: [],
              allRelations: [],
            });
          }

          if (nextAccounts.includes(account)) {
            const accountData = this.matchMap.get(account)!;
            
            if (accountData.count < 3) {
              accountData.count += 1;
              accountData.allRelations.push([keyAccounts[j], ...nextAccounts]);
              
              if (accountData.count === 3) { 
                accountData.keyAccount = keyAccounts[i];
                accountData.relationalAccounts = [...nextAccounts];
                accountData.token = token;
              }
            }
          }
        });
      }
    }
  }

  public async addAccountToCache(token: string, account: string): Promise<void> { 
    // Initialize account in cache if not present
    if (!this.accsCache.has(account)) {
      this.accsCache.set(account, 0);
    }
    
    // Initialize token set if not present
    if (!(token in this.accs)) {
      this.accs[token] = new Set<string>();
    }

    // Update account occurrence count
    if (this.accs[token].has(account)) {
      const currentCount = this.accsCache.get(account) ?? 0;
      this.accsCache.set(account, currentCount + 1);
      asyncLogger.info(`Already has this account in cache: ${account}`);
    } else {
      this.accs[token].add(account);
    }
  
    // Check for accounts that need to be blacklisted
    for (const [key, value] of this.accsCache.entries()) {
      if (value >= 3 && !this.blacklist.has(key)) {
        // Check if already blacklisted
        const isBlacklisted = await BlacklistHandler.isWalletOnBlacklist(key);
        if (!isBlacklisted) {
          this.blacklist.add(key);
          const added = await BlacklistHandler.addWalletToBlacklist(key);
          if (added) {
            asyncLogger.info(`Account ${key} got blacklisted.`);
          }
        }
      } 
    }
  }
}

class AccountsMonitor {
  private client: Client;
  private tasks: Promise<void>[] = [];
  private reconnecting = false;

  constructor(private endpoint: string = grpcUrl) {
    this.client = new Client(this.endpoint, undefined, undefined);
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

  private async handleStream(account: string, token: string): Promise<void> {
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
              asyncLogger.info(`Found ${flowType} tx: ${result.signature} by ${account}\n Tracking ${isOutflow ? "receiver" : "sender"} wallet: ${wallet}`);
              
              await this.addAccountMonitoringTask(wallet, token);
              await blacklistHandler.addAccountToCache(token, wallet);
              await blacklistHandler.addAccountToBlacklistTracker(token, account, wallet);
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

  public async addAccountMonitoringTask(account: string, token: string): Promise<void> {
    this.tasks.push(this.handleStream(account, token));
  }

  public async monitorTasks(): Promise<void> {
    try {
      await Promise.all(this.tasks);
    } catch (error) {
      asyncLogger.error(`Monitor tasks error: ${error}`);
      await delay(2000);
      await this.monitorTasks(); // Restart monitoring
    }
  }
}

export const blacklistHandler = new BlacklistHandler();
export const accountsMonitor = new AccountsMonitor();