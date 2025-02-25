import Client, {
    CommitmentLevel,
    SubscribeRequest
} from "@triton-one/yellowstone-grpc";
import { Mutex } from "async-mutex"; 
import { setTimeout as sleep } from "node:timers/promises";
import { DateTime } from 'luxon';

import { tOutPut } from "./transactionOutput";
import { searchForInitialize2 } from "./utils/logTXN";
import { asyncLogger } from "../../config/appConfig";
import { grpcUrl, backupGrpcUrl, raydiumCacheExpitationMin } from "../../config/config";

export class RaydiumMigrationsMonitor {
  private client: Client;
  private request: SubscribeRequest;
  private endpoint: string;
  private lock: Mutex = new Mutex();
  private tokens: Map<string, Date> = new Map();
  private readonly raydiumMigrationProgram: string = "39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg"

  constructor(endpoint: string = grpcUrl) {
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
          accountInclude: [this.raydiumMigrationProgram], 
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
        asyncLogger.error("Stream error, restarting in 1 second...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private async checkConnection() {
    try {
      await this.client.ping(1);
    } catch (error) {
      asyncLogger.error(`Ping failed for ${this.endpoint}, switching to backup...`);
      this.endpoint = this.endpoint === grpcUrl ? backupGrpcUrl : grpcUrl;
      this.client = new Client(this.endpoint, undefined, undefined);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }


  async checkToken(mintAddress: string): Promise<boolean>{
    if (this.tokens.has(mintAddress)){
      return true;
    } else 
    {
      return false; 
    }
  } 

  private async addToken(mintAddress: string): Promise<void> {
    const release = await this.lock.acquire();
    try {
      if (this.tokens.has(mintAddress)) {
        return;  
      }

      const expirationTime = new Date(Date.now() + raydiumCacheExpitationMin * 60000);
      this.tokens.set(mintAddress, expirationTime);
      asyncLogger.info(`Tracking migrated Token: ${mintAddress}, going to be deleted at ${DateTime.fromMillis(Date.now() + raydiumCacheExpitationMin * 60000, { zone: 'Europe/Paris' })}`);
    } finally {
      release();
    }
    await sleep(raydiumCacheExpitationMin * 60 * 1000);
    await this.removeToken(mintAddress);
  }

  async removeToken(mintAddress: string): Promise<void> {
    const release = await this.lock.acquire();
    try {
      if (this.tokens.has(mintAddress)) {
        this.tokens.delete(mintAddress);
        asyncLogger.info(`Manually removed token from Raydium Monitor: ${mintAddress}`);
      }
    } finally {
      release();
    }
  }

  private async handleStream() {
    const stream = await this.client.subscribe();

    const streamClosed = new Promise<void>((resolve, reject) => {
      stream.on("error", (error) => {
        asyncLogger.error(`Error occurred: ${error}`);
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
        const pumpFunMintAddress = transaction.message.accountKeys.filter(key => key.includes('pump'))[0];
        if (pumpFunMintAddress && !this.tokens.has(pumpFunMintAddress)) {
          await this.addToken(pumpFunMintAddress);
        }
        
      } catch (error) {
        asyncLogger.error(`Error occurred: ${error}`);
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
      asyncLogger.error(`Subscription error: ${reason}`);
      throw reason;
    });

    await streamClosed;
  }
}

export const raydiumMigrationMonitor = new RaydiumMigrationsMonitor();

