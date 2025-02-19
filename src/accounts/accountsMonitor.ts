import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc";
import * as fs from 'fs';
import * as path from 'path';

import { logger } from "../../config/appConfig";
import { grpcUrl, backupGrpcUrl } from "../../config/config";
import { tOutPut } from "./transactionOutput";


const blacklistFilePath = path.join(__dirname, '../data/blacklist-wallets.txt');
const whitelistFilePath = path.join(__dirname, '../data/whitelist-wallets.txt');


export class BlacklistHandler {
  private accs: {[key: string]: Set<string>} = {};
  private accs_cache = new Map<string, number>();

  public static async isWalletOnBlacklist(wallet: string): Promise<boolean> {
    try {
      const data1 = await fs.promises.readFile(blacklistFilePath, 'utf8');
      const data2 = await fs.promises.readFile(whitelistFilePath, 'utf8');

      const blackList = data1 + "\n" + data2;

      if (blackList.includes(wallet)) {
          return true;
      } else {
          return false;
      }
    } catch (error) {
      logger.error("Ошибка при чтении файлов:", error);
      return false;
    }
  }

  public static async addWalletToBlacklist(wallet: string){
    try {
      await fs.promises.appendFile(blacklistFilePath, wallet + '\n', "utf8");
    } catch (error) {
      logger.error("Error occurred while wallet to blacklist file: " + error)
    }
  }

  public async addAccountToCache(token: string, account: string){ // TODO: impl добавления каждого ПРОВЕРЯЕМОГО кошелька в кэш
    if (!this.accs_cache.has(account)){ // if account is fresh
        this.accs_cache.set(account, 0);
        logger.info("Added new account to cache: " + account);
    }
    
    if (!(token in this.accs)){
        this.accs[token] = new Set<string>;
    }

    if (this.accs[token].has(account)) {
      const currentCount = this.accs_cache.get(account) ?? 0;
      this.accs_cache.set(account, currentCount + 1);
      logger.info("Already has this account in cache: " + account);
    } else {
        this.accs[token].add(account);
    }
  
    for (const [key, value] of this.accs_cache.entries()) {
      if (value >= 3) {
          logger.info(`Account ${key} got blacklisted.`);
          if (!(await BlacklistHandler.isWalletOnBlacklist(key))){
            await BlacklistHandler.addWalletToBlacklist(key);
          }
      } 
    }
  } 
}


class AccountsMonitor {
  private client: Client;
  private request: SubscribeRequest;
  private tasks: Promise<void>[] = [];

  constructor(private endpoint: string = grpcUrl) {
    this.endpoint = endpoint;
    this.client = new Client(this.endpoint, undefined, undefined);
  }

  private async checkConnection() {
    try {
      await this.client.ping(1);
    } catch (error) {
      logger.error(`Ping failed for ${this.endpoint}, switching to backup...`);
      this.endpoint = this.endpoint === grpcUrl ? backupGrpcUrl : grpcUrl;
      this.client = new Client(this.endpoint, undefined, undefined);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  private async handleStream(account: string, token: string) {
    logger.info(`Monitoring ${account} txs.`)
    this.request = {
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
    const stream = await this.client.subscribe();

    const streamClosed = new Promise<void>((resolve, reject) => {
      stream.on("error", (error) => {
        logger.error("Error occurred: " + error);
        reject(error);
        stream.end();
      });
      stream.on("end", resolve);
      stream.on("close", resolve);
    });

    stream.on("data", async (data) => {
      try {

        const result = await tOutPut(data);
        if (!result) return;
        if ((result.postBalances[0] - result.preBalances[0]) < 0){
          // outflow
          // wallet of sender has index '0' (owner)
          // wallet of receiver has index '1'
          if ((result.preBalances[0] - result.postBalances[0]) / 1_000_000_000 >= 0.1){
            logger.info(`TX INFO: outflow: ${result.message.accountKeys} / signature: ${result.signature} `);
            if (result.message.accountKeys.length < 7)
            {
              const wallet: string = result.message.accountKeys[1];
              blacklistHandler.addAccountToCache(token, wallet);
            }

          }
        } else {
          // inflow
          // wallet of sender has index '0' 
          // wallet of receiver has index '1' (owner)
          if ((result.postBalances[0] - result.preBalances[0]) / 1_000_000_000 >= 0.1){
            logger.info(`TX INFO: inflow: ${result.message.accountKeys} / signature: ${result.signature} `);
            if (result.message.accountKeys.length < 7)
              {
                const wallet: string = result.message.accountKeys[0];
                blacklistHandler.addAccountToCache(token, wallet);
              }
          }
        }
      } catch (error) {
        logger.error("Error occurred: " + error);
      }
    });

    await new Promise<void>((resolve, reject) => {
      stream.write(this.request, (err: any) => {
        if (!err) {
          resolve();
        } else {
          reject(err);
        }
      });
    }).catch((reason) => {
      logger.error("Subscription error: " + reason);
      throw reason;
    });

    await streamClosed;
  }

  public async addAccountMonitoringTask(account: string, token: string){
    this.tasks.push(this.handleStream(account, token));
  }

  public async monitorTasks(): Promise<void> {
    while (true) {
      try {
        await this.checkConnection();
        await Promise.allSettled(this.tasks);
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error("Stream error, restarting in 1 second...", error);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
}

export const accountsMonitor = new AccountsMonitor();
export const blacklistHandler = new BlacklistHandler();

const testAccount = "GkhpPJiHeK4TuUsp2Rr1LdbAdbThFkMjKemGxhzuwxxp";
const testToken = "EXAMPLE_TOKEN";


async function main() {
  try {
      
      /*
      accountsMonitor.monitorTasks();
      
      accountsMonitor.addAccountMonitoringTask(testAccount, testToken);
      accountsMonitor.addAccountMonitoringTask(testAccount, testToken);
      accountsMonitor.addAccountMonitoringTask(testAccount, testToken);
      */
    
  } catch (error) {
      logger.error("Critical error in main function:", error);
      process.exit(1); 
  }
}

// Вызов main()


main();




  

