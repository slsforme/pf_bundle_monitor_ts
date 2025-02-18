import Client, { CommitmentLevel, SubscribeRequest, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { tOutPut } from "./utils/transactionOutput";
import { grpcUrl, backupGrpcUrl } from "../../config/config";
import { logger } from "../../config/appConfig";

class TokenBuyMonitor {
  private client: Client;
  private tasks: Promise<void>[] = [];

  constructor(private endpoint: string = grpcUrl) {
    this.endpoint = endpoint;
    this.client = new Client(this.endpoint, undefined, undefined);
  }

  private async handleStream(token: string): Promise<void> {
    const request: SubscribeRequest = {
      accounts: {},
      slots: {},
      transactions: {
        pumpfun: {
          vote: false,
          failed: false,
          signature: undefined,
          accountInclude: [token],
          accountExclude: [],
          accountRequired: [],
        },
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

    stream.on("data", async (data: SubscribeUpdate) => {
      try {
        const result = await tOutPut(data);
        if (!result) return;
        const preBalance: number = parseInt(result.meta.preBalances[0]);
        const postBalance: number = parseInt(result.meta.postBalances[0]);

        if (preBalance > postBalance) { // If it's a buy transaction
          if ((preBalance - postBalance) >= 0.1) {
            const wallet: string = result.message.accountKeys[0];
            // Subscribe to holder updates (to be implemented)
          }
        }
      } catch (error) {
        logger.error("Error occurred: " + error);
      }
    });

    await new Promise<void>((resolve, reject) => {
      stream.write(request, (err: any) => {
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

  public async addTokenBuyTask(token: string): Promise<void> {
    this.tasks.push(this.handleStream(token));
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

}

export const tokenBuyMonitor = new TokenBuyMonitor();
