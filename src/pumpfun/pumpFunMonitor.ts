import Client, { CommitmentLevel, SubscribeRequest, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import path from 'path';

import { pumpFunTransactionOutput } from "./utils/pumpFunTransactionOutput";
import { grpcUrl, backupGrpcUrl } from "../../config/config";
import { logger } from "../../config/appConfig";
import { TokenMonitor } from "./tokenMonitor";
import { tokenBuyMonitor } from "./tokenBuysMonitor";

const PUMPFUN = "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM";


export class PumpFunMonitor {
  private client: Client;
  private request: SubscribeRequest;
  private tokenMonitor: TokenMonitor;

  constructor(private endpoint: string = grpcUrl, tokenMonitor: TokenMonitor) {
    this.endpoint = endpoint;
    this.client = new Client(this.endpoint, undefined, undefined);
    this.tokenMonitor = tokenMonitor;  
    this.tokenMonitor.monitorTokens();  

    this.request = {
      accounts: {},
      slots: {},
      transactions: {
        pumpfun: {
          vote: false,
          failed: false,
          signature: undefined,
          accountInclude: [PUMPFUN],
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
      logger.info(`Connected to ${this.endpoint}`);
    } catch (error) {
      logger.error(`Ping failed for ${this.endpoint}, switching to backup...`);
      this.endpoint = this.endpoint === grpcUrl ? backupGrpcUrl : grpcUrl;
      this.client = new Client(this.endpoint, undefined, undefined);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
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

    stream.on("data", async (data: SubscribeUpdate) => {
      try {
        const result = await pumpFunTransactionOutput(data);
        if (!result) return;
        const ca = result.meta.postTokenBalances[0]?.mint;
        // logger.info(`New pump.fun token detected: ${ca}`);
        if (ca) {
          this.tokenMonitor.addToken(ca);
          tokenBuyMonitor.addTokenBuyTask(ca);
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
      logger.error("Subscription error:", reason);
      throw reason;
    });

    await streamClosed;
  }
}
