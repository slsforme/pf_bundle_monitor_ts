import Client, { CommitmentLevel, SubscribeRequest, SubscribeUpdate } from "@triton-one/yellowstone-grpc";

import { tOutPut } from "./utils/transactionOutput";
import { grpcUrl, backupGrpcUrl } from "../../config/config";
import { backupClient, client, logger } from "../../config/appConfig";
import { accountsMonitor, blacklistHandler, BlacklistHandler } from "../accounts/accountsMonitor";

class TokenBuyMonitor {
  private client: Client;
  private tasks: Promise<void>[] = [];

  constructor(private endpoint: string = grpcUrl) {
    this.endpoint = endpoint;
    this.client = client;
  }

  private async handleStream(mintAddress: string, stream: any): Promise<void> {
    const request: SubscribeRequest = {
      accounts: {},
      slots: {},
      transactions: {
        pumpfun: {
          vote: false,
          failed: false,
          signature: undefined,
          accountInclude: [mintAddress],
          accountExclude: [],
          accountRequired: [],
        },
      },
      entry: {},
      blocks: {},
      blocksMeta: {},
      accountsDataSlice: [],
      ping: undefined,
      commitment: CommitmentLevel.CONFIRMED,
    };
    
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
        if (result.preBalance > result.postBalance) { // If it's a buy tx
          if ((result.preBalance - result.postBalance) / 1_000_000_000 >= 0.1) {
            const wallet: string = result.message.accountKeys[0];
            // logger.info(`Token ${token} was bought for ${(preBalance - postBalance) / 1_000_000_000} SOL by ${wallet}`);
            if(!(await BlacklistHandler.isWalletOnBlacklist(wallet))){ // if account not in Blacklist
              accountsMonitor.addAccountMonitoringTask(wallet, mintAddress);
              blacklistHandler.addAccountToCache(mintAddress, wallet);
            }
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
      logger.error("Subscription error: " + reason);
      throw reason;
    });

    await streamClosed;
  }

  public async addTokenBuyTask(mintAddress: string, stream: any): Promise<void> {
    this.tasks.push(this.handleStream(mintAddress, stream));
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
    } catch (error) {
      this.client = this.client === client ? backupClient : client;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export const tokenBuyMonitor = new TokenBuyMonitor();
