import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc"
import * as fs from 'fs';
import * as path from 'path';

import { logger } from "../../config/appConfig";
import { grpcUrl, backupGrpcUrl } from "../../config/config";
import { tOutPut } from "./transactionOutput";


const blacklistFilePath = path.join(__dirname, '../data/blacklist-wallets.txt');
const whitelistFilePath = path.join(__dirname, '../data/whitelist-wallets.txt');


export class BlacklistHandler {
  private blacklist: Set<string> = new Set<string>;
  private accs: {[key: string]: Set<string>} = {};
  private accsCache = new Map<string, number>();
  private blacklistTracker = new Map<string, Map<string, Array<string>>>();
  private matchMap = new Map<string, { count: number; keyAccount: string; token: string; relationalAccounts: Array<string>, allRelations: Array<Array<string>> }>();
  private processedKeys: Set<string> = new Set();



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

  
public async trackMatchMapChanges() {
    const printedWallets = new Set<string>();

    setInterval(() => {
      for (const [key, value] of this.matchMap.entries()) {
        if (value.count >= 3 && !printedWallets.has(key)) { 
          logger.info(`🔹 Found new relations for blacklist.
            🔸 Account: ${key}
            🔸 Совпадений: ${value.count}
            🔸 KeyAccount: ${value.keyAccount}
            🔸 Token Mint Address: ${value.token}
            🔸 Relational Accounts: ${value.relationalAccounts.join(', ')}
            🔸 All Relations:
            ${value.allRelations.map((relation, index) => `  [${index + 1}] ${relation.join(' -> ')}`).join('\n')}
            --------------------------`);            
            // console.log("🔹 Found new relations for blacklist.");
            // console.log(`🔸 Account: ${key}`); 
            // console.log(`  🔸 Совпадений: ${value.count}`);
            // console.log(`  🔸 KeyAccount: ${value.keyAccount}`);
            // console.log(`  🔸 Token Mint Address: ${value.token}`);
            // console.log(`  🔸 Relational Accounts: ${value.relationalAccounts.join(', ')}`);

            // console.log(`  🔸 All Relations:`);
            // value.allRelations.forEach((relation: string[], index: number) => {
            //     console.log(`    [${index + 1}] ${relation.join(' -> ')}`);
            // });

            // console.log('--------------------------');
            printedWallets.add(key);
        }
    }
  }, 1000);
}
 

  
  public async addAccountToBlacklistTracker(token: string, keyAccount: string, account: string){
    // adding data
    if (!(this.blacklistTracker.has(token))) { // if this token doesn't exists 
      const dict = new Map<string, Array<string>>(); // creating new array
      dict.set(keyAccount, [account])
      this.blacklistTracker.set(token, dict);
    } else { // if token already created
      if (this.blacklistTracker.get(token).get(keyAccount)){ // double check if we have keyAccount in tracker already
         if (this.blacklistTracker.get(token).get(keyAccount).includes(keyAccount)) { // if we already have this wallet in tracker 
            return;
         } else {
          this.blacklistTracker.get(token).get(keyAccount).push(account); // adds account to tracker
         }
      } else { // if it's new keyAccount 
        this.blacklistTracker.get(token).set(keyAccount, [account]);
      }
    }

    // searching for bundles 
    this.blacklistTracker.forEach((accountsMap) => {
      const keyAccounts = Array.from(accountsMap.keys());
      for (let i = 0; i < keyAccounts.length; i++){

        const accounts = accountsMap.get(keyAccounts[i]);
        if (!accounts) continue;

        // going through every accounts relation in one specific token
        for (let j = 0; j < keyAccounts.length; j++) { 
          if (i === j) continue;

          const nextAccounts: string[] = accountsMap.get(keyAccounts[j]);
          const data: string[] = [...[keyAccounts[j]], ...nextAccounts];
          if (!nextAccounts) continue;
          
          accounts.forEach((account: string) => {
          if (!this.matchMap.has(account)) {
              this.matchMap.set(account, {
                count: 0,
                keyAccount: "",
                token: "",
                relationalAccounts: [],
                allRelations: [],
              });
          }

          if(nextAccounts.includes(account)){
            if(this.matchMap.get(account).count < 3){
              this.matchMap.get(account).count += 1;
              this.matchMap.get(account).allRelations.push([keyAccounts[j], ...nextAccounts]);
              if (this.matchMap.get(account).count === 3){ 
                this.matchMap.get(account).keyAccount = keyAccounts[i];
                this.matchMap.get(account).relationalAccounts = nextAccounts;
                this.matchMap.get(account).token = token;
              }
            } 
          } 
          });
        }
      }
    });
  }
  

  public async addAccountToCache(token: string, account: string){ 
    if (!this.accsCache.has(account)){ // if account is fresh
        this.accsCache.set(account, 0);
        // logger.info("Added new account to cache: " + account);
    }
    
    if (!(token in this.accs)){
        this.accs[token] = new Set<string>;
    }

    if (this.accs[token].has(account)) {
      const currentCount = this.accsCache.get(account) ?? 0;
      this.accsCache.set(account, currentCount + 1);
      // logger.info("Already has this account in cache: " + account);
    } else {
        this.accs[token].add(account);
    }
  
    for (const [key, value] of this.accsCache.entries()) {
      if (value >= 3) {
        // logger.info("Already got this acc: " + key);
        if (!(await BlacklistHandler.isWalletOnBlacklist(key))){
          if(!(this.blacklist.has(key))){
              this.blacklist.add(key);
              logger.info(`Account ${key} got blacklisted.`);
              await BlacklistHandler.addWalletToBlacklist(key);
            }
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
    
    logger.info(`Tracking ${account} txs.`)
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
            // logger.info(`TX INFO: outflow: ${result.message.accountKeys} / signature: ${result.signature} `);
            if (result.message.accountKeys.length < 7)
            {
              let wallet: string = "";
              if (result.message.accountKeys[0] === account)
                {
                  wallet = result.message.accountKeys[1];
                } else {
                  wallet = result.message.accountKeys[0];
                }
                blacklistHandler.addAccountToCache(token, wallet);
                logger.info(`Found outflow tx: ${result.signature} by ${account}\n Tracking receiver wallet: ${wallet}`);
                blacklistHandler.addAccountToBlacklistTracker(token, account, wallet);
            }
          }
        } else {
          // inflow
          // wallet of sender has index '0' 
          // wallet of receiver has index '1' (owner)
          if ((result.postBalances[0] - result.preBalances[0]) / 1_000_000_000 >= 0.1){
            // logger.info(`TX INFO: inflow: ${result.message.accountKeys} / signature: ${result.signature} `);
            if (result.message.accountKeys.length < 7)
              {
                let wallet: string = "";
                if (result.message.accountKeys[0] === account)
                  {
                    wallet = result.message.accountKeys[1];
                  } else {
                    wallet = result.message.accountKeys[0];
                  }
                logger.info(`Found inflow tx: ${result.signature} by ${account}\n Tracking sender wallet: ${wallet}`);
                blacklistHandler.addAccountToCache(token, wallet);
                blacklistHandler.addAccountToBlacklistTracker(token, account, wallet);
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




// async function main() {
//   const blacklistHandler = new BlacklistHandler(); // Создаем экземпляр класса
//   blacklistHandler.trackMatchMapChanges();

//   // Добавляем аккаунты в blacklistTracker для токена "tokenA"
//   await blacklistHandler.addAccountToBlacklistTracker("tokenA", "keyAccount1", "account1");
//   await blacklistHandler.addAccountToBlacklistTracker("tokenA", "keyAccount1", "account2");
//   await blacklistHandler.addAccountToBlacklistTracker("tokenA", "keyAccount2", "account2");
//   await blacklistHandler.addAccountToBlacklistTracker("tokenA", "keyAccount2", "account3");
//   await blacklistHandler.addAccountToBlacklistTracker("tokenA", "keyAccount3", "account3");
//   await blacklistHandler.addAccountToBlacklistTracker("tokenA", "keyAccount3", "account1");

//   // Добавляем аккаунты для другого токена "tokenB"
//   await blacklistHandler.addAccountToBlacklistTracker("tokenB", "keyAccount4", "account4");
//   await blacklistHandler.addAccountToBlacklistTracker("tokenB", "keyAccount5", "account5");
//   await blacklistHandler.addAccountToBlacklistTracker("tokenB", "keyAccount5", "account6");

// }

// main();

