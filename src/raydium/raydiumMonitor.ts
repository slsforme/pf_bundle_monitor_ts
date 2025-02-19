import Client, {
    CommitmentLevel,
    SubscribeRequest
} from "@triton-one/yellowstone-grpc";
import { Mutex } from "async-mutex"; 
import { DateTime } from 'luxon';
import { setTimeout as sleep } from "node:timers/promises";

import { tOutPut } from "./transactionOutput";
import { searchForInitialize2 } from "./logTXN";
import { logger } from "../../config/appConfig";
import { grpcUrl, backupGrpcUrl, raydiumCacheExpitationMin } from "../../config/config";


const MIGRATION = '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg';

export class RaydiumMigrationsMonitor {
  private client: Client;
  private request: SubscribeRequest;
  private endpoint: string;
  private lock: Mutex = new Mutex();
  private tokens: Map<string, Date> = new Map();

  constructor(endpoint: string) {
    this.endpoint = endpoint;
    this.client = new Client(this.endpoint, undefined, undefined);

    this.request = {
      accounts: {},
      slots: {},
      transactions: {
        migration: {
          vote: false,
          failed: false,
          signature: undefined,
          accountInclude: [MIGRATION], 
          accountExclude: [],
          accountRequired: [],
        },
      },
      entry: {},
      blocks: {},
      blocksMeta: {},
      accountsDataSlice: [],
      ping: undefined,
      commitment: CommitmentLevel.PROCESSED, 
    };
  }

  async startMonitoring() {
    while (true) {
      try {
        await this.checkConnection();
        await this.handleStream();
      } catch (error) {
        logger.error("Stream error, restarting in 1 second...", error);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
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


  async checkToken(ca: string): Promise<boolean>{
    if (this.tokens.has(ca)){
      return true;
    } else 
    {
      return false; 
    }
  } 

  private async addToken(tokenAddress: string): Promise<void> {
    const release = await this.lock.acquire();
    try {
      if (this.tokens.has(tokenAddress)) {
        logger.info(`Token ${tokenAddress} is already being tracked.`);
        return;  // Если токен уже существует, выходим
      }

      const expirationTime = new Date(Date.now() + raydiumCacheExpitationMin * 60000);
      this.tokens.set(tokenAddress, expirationTime);
      // logger.info(`Tracking migrated Token: ${tokenAddress}, going to be deleted at ${DateTime.fromMillis(Date.now() + raydiumCacheExpitationMin * 60000, { zone: 'Europe/Paris' })}`);
    } finally {
      release();
    }
    await sleep(raydiumCacheExpitationMin * 60 * 1000);
    await this.removeToken(tokenAddress);
  }

  async removeToken(tokenAddress: string): Promise<void> {
    const release = await this.lock.acquire();
    try {
      if (this.tokens.has(tokenAddress)) {
        this.tokens.delete(tokenAddress);
        logger.info(`Manually removed token from Raydium Monitor: ${tokenAddress}`);
      } else {
        logger.warn(`Tried to remove non-existing token from Raydium Monitor: ${tokenAddress}`);
      }
    } finally {
      release();
    }
  }

  private async handleStream() {
    const stream = await this.client.subscribe();

    const streamClosed = new Promise<void>((resolve, reject) => {
      stream.on("error", (error) => {
        logger.error("Error occurred: ", error);
        reject(error);
        stream.end();
      });
      stream.on("end", resolve);
      stream.on("close", resolve);
    });

    stream.on("data", async (data) => {
      try {
        const result = await tOutPut(data);
        const transaction = searchForInitialize2(result)
        if(!transaction) return;
        const pf_ca = transaction.message.accountKeys.filter(key => key.includes('pump'))[0];
        if (pf_ca && !this.tokens.has(pf_ca)) {
          await this.addToken(pf_ca);
        }
        
      } catch (error) {
        if (error instanceof TypeError) {
          // pass
        } else {
          logger.error("Error occurred: ", error);
        }
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
      logger.error("Subscription error:", reason);
      throw reason;
    });

    await streamClosed;
  }
}

async function main() {
  const raydiumMigrationMonitor = new RaydiumMigrationsMonitor(grpcUrl);
  raydiumMigrationMonitor.startMonitoring();
}

main().catch((error) => {
  logger.error("Error in main():", error);
  process.exit(1);
});

export const raydiumMigrationMonitor = new RaydiumMigrationsMonitor(grpcUrl);

