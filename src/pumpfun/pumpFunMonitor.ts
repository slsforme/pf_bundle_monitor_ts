import Client, { CommitmentLevel, SubscribeRequest, SubscribeUpdate } from "@triton-one/yellowstone-grpc";

import { pumpFunTransactionOutput } from "./utils/pumpFunTransactionOutput";
import { grpcUrl, backupGrpcUrl } from "../../config/config";
import { logger, client, backupClient } from "../../config/appConfig";
import { TokenMonitor } from "./tokenMonitor";

export class PumpFunMonitor {
  private request: SubscribeRequest;
  private client: Client;
  private tokenMonitor: TokenMonitor;
  private readonly pumpFunProgram: string = "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM";

  constructor(tokenMonitor: TokenMonitor) {
    this.tokenMonitor = tokenMonitor;  
    this.client = client;
    this.tokenMonitor.monitorTokens();  

    this.request = {
      accounts: {},
      slots: {},
      transactions: {
        pumpfun: {
          vote: false,
          failed: false,
          signature: undefined,
          accountInclude: [this.pumpFunProgram],
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
    const endpoint = this.client === client ? grpcUrl : backupGrpcUrl;
    try {
      await this.client.ping(1);
      logger.info(`Connected to ${endpoint}`);
    } catch (error) {
      logger.error(`Ping failed for ${endpoint}, switching to backup...`);
      this.client = this.client === client ? backupClient : client;
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
        const mindAddress = result.meta.postTokenBalances[0]?.mint;
        // logger.info(`New pump.fun token detected: ${ca}`);
        if (mindAddress) {
          this.tokenMonitor.addToken(mindAddress);
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
}
