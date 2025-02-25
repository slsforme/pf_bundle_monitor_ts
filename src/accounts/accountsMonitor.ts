import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc"
import { setTimeout as delay } from "node:timers/promises";
import * as fs from 'fs';
import * as path from 'path';

import { asyncLogger } from "../../config/appConfig";
import { grpcUrl, backupGrpcUrl } from "../../config/config";
import { tOutPut } from "./utils/transactionOutput";

const blacklistFilePath = path.join(__dirname, '../data/blacklist-wallets.txt');
const whitelistFilePath = path.join(__dirname, '../data/whitelist-wallets.txt');

function findAllArraysContaining(matrix: string[][], target: string): string[][] {
  return matrix.filter(row => row.includes(target));
}

function findSequenceInMatrix(matrix: string[][], target: [string, string]): number | null {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const [first, second] = target;
  
  // Проверяем строки
  for (let i = 0; i < rows; i++) {
      const index = checkArray(matrix[i], first, second);
      if (index !== -1) return i;
  }
  
  // Проверяем столбцы
  for (let j = 0; j < cols; j++) {
      const column = matrix.map(row => row[j]);
      const index = checkArray(column, first, second);
      if (index !== -1) return j;
  }
  
  // Проверяем главные и побочные диагонали
  for (let d = -rows + 1; d < cols; d++) {
      const mainDiagonal = [], antiDiagonal = [];
      for (let i = 0; i < rows; i++) {
          if (matrix[i][i + d] !== undefined) {
              mainDiagonal.push(matrix[i][i + d]);
          }
          if (matrix[i][cols - 1 - i - d] !== undefined) {
              antiDiagonal.push(matrix[i][cols - 1 - i - d]);
          }
      }
      if (checkArray(mainDiagonal, first, second) !== -1) return d;
      if (checkArray(antiDiagonal, first, second) !== -1) return d;
  }
  
  return null;
}

function checkArray(arr: string[], first: string, second: string): number {
  for (let i = 0; i < arr.length - 1; i++) {
      if (arr[i] === first && arr[i + 1] === second) return i;
  }
  return -1;
}


// Cache to prevent duplicate reads of blacklist/whitelist files
let cachedBlacklist: Set<string> | null = null;
let lastBlacklistUpdate = 0;
const CACHE_TTL = 60000; // 1 minute cache TTL

export class BlacklistHandler {
  private blacklist: Set<string> = new Set<string>();
  private accs: Record<string, Set<string>> = {};
  private accsCache = new Map<string, number>();
  private blacklistTracker = new Map<string, Array<Array<string>>>();

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
  

  public async addAccountToCache(token: string, account: string, keyAccount: string = null): Promise<void> {
    /**
     * TODO:
     * 
     */
    
    // Initialize account in cache if not present
    if (!this.accsCache.has(account)) {
      this.accsCache.set(account, 0);
    }
    
    // Track relations
    if (!this.blacklistTracker.get(token)){
      this.blacklistTracker.set(token, []);
    } else {
      if (keyAccount !== null){
        const arrayIndex: number | null = findSequenceInMatrix(this.blacklistTracker.get(token), [keyAccount, account]);
        if(arrayIndex){
          this.blacklistTracker.get(token)[arrayIndex].push(account);
        } else {
          this.blacklistTracker.get(token).push([keyAccount, account]);
        }
      }
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
            // findAllArraysContaining();  
            // Вывести все связи + токен
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