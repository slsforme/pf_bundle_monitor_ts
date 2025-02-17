import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc";

import { tOutPut } from "./transactionOutput";
import { grpcUrl, backupGrpcUrl } from "../../config/config";
import { logger } from "../../config/appConfig";


class TokenBuysMonitor {
  private client: Client;
  private request: SubscribeRequest;
  private endpoint: string;

  constructor(endpoint: string, ) {
    this.endpoint = endpoint;
    this.client = new Client(this.endpoint, undefined, undefined);

    this.request = {
      "accounts": { },
      slots: {},
      transactions: {
        pumpfun: {
          vote: false,
          failed: false,
          signature: undefined,
          accountInclude: ["GynunK282RndoRz3mrq7ma6ruenr5DQNP2Z4iTjCpump"],  // сделать для каждого отдельного токена
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
        const logs: string[] = result.meta.logMessages;
        if (logs.some(str => str.includes("Buy"))){
          const wallet: string = result.message.accountKeys[0];
          // TODO: check wallet txs
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
  const pumpFunMonitor = new TokenBuysMonitor(grpcUrl);
  await pumpFunMonitor.startMonitoring();
}

main().catch((error) => {
  logger.error("Error in main():", error);
  process.exit(1);
});
