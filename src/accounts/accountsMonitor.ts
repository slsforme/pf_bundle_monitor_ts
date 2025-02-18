import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc";
import * as fs from 'fs';
import * as path from 'path';

import { logger } from "../../config/appConfig";
import { grpcUrl, backupGrpcUrl } from "../../config/config";
import { tOutPut } from "./transactionOutput";


const blacklistFilePath = path.join(__dirname, '../data/blacklist-wallets.txt');
const whitelistFilePath = path.join(__dirname, '../data/whitelist-wallets.txt');

async function isWalletOnBlacklist(wallet: string): Promise<boolean> {
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
      console.error("Ошибка при чтении файлов:", error);
      return false;
  }
}

async function addWalletToBlacklist(wallet: string){
  try {
    await fs.promises.appendFile(blacklistFilePath, wallet + '\n', "utf8");
  } catch (error) {
    logger.error("Error occurred while wallet to blacklist file: " + error)
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
      // TODO: tracking of new wallet's sol
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

  private async handleStream(account: string) {
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
        console.log(result)
        if ((result.postBalances[0] - result.preBalances[0]) < 0){
          // outflow
          if ((result.preBalances[0] - result.postBalances[0]) / 1_000_000_000 >= 0.1){
            // следим за кошельком, которому скинули sol
          }
        } else {
          // inflow
          if ((result.postBalances[0] - result.preBalances[0]) / 1_000_000_000 >= 0.1){
            // добавляем кошелёк в set
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

  public async addAccountMonitoringTask(account: string){
    this.tasks.push(this.handleStream(account));
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

async function main() {
  accountsMonitor.addAccountMonitoringTask("GkhpPJiHeK4TuUsp2Rr1LdbAdbThFkMjKemGxhzuwxxp");
}

main().catch((error) => {
  logger.error("Error in main():" + error);
  process.exit(1);
});

  

