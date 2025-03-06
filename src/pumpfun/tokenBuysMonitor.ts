import Client, { CommitmentLevel, SubscribeRequest, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { Kafka } from 'kafkajs';

import { tOutPut } from "./utils/transactionOutput";
import { backupClient, client, asyncLogger, redis } from "../../config/appConfig";
import { BlacklistHandler } from "../accounts/accountsMonitor";
import { addToWallets, removeFromWallets } from "src/redis/transactionHandler";

type StreamsPair = [Date, string];

class TokenBuyMonitor {
  private client: Client;
  private kafkaConsumer: any;
  private kafkaProducer: any;
  private streams = new Map<any, StreamsPair>();

  constructor() {
    this.client = client;
    this.initKafkaConsumer();
    this.initKafkaProducer();
    this.monitorTasks();
    this.startProcessing();
  }

  public async handleStream(mintAddress: string, stream: any): Promise<void> {
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
        asyncLogger.error("Error occurred: " + error);
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
            asyncLogger.info(`Token ${mintAddress} was bought for ${(result.preBalance - result.postBalance) / 1_000_000_000} SOL by ${wallet}. Started tracking wallet.`);
            if(!(await BlacklistHandler.isWalletOnBlacklist(wallet)) && !(await BlacklistHandler.isWalletOnWhitelist(wallet))){ 
                await addToWallets(mintAddress, wallet);
            } else {
              asyncLogger.info(`This wallet is already on blacklist: ${wallet} Stopped tracking wallet.`)
            }
          }
        }
      } catch (error) {
        asyncLogger.error("Error occurred: " + error);
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
      asyncLogger.error("Subscription error: " + reason);
      throw reason;
    });

    await streamClosed;
  }

  public async monitorTasks(): Promise<void> {
    while (true) {
      try {
        await this.checkConnection();
        await new Promise(resolve => setTimeout(resolve, 1000));
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
      this.client = this.client === client ? backupClient : client;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  private async initKafkaConsumer() {
    const kafka = new Kafka({
      clientId: 'app',
      brokers: ['localhost:9092'],
    });

    this.kafkaConsumer = kafka.consumer({ groupId: 'token-buys-monitor' });

    await this.kafkaConsumer.connect();
    await this.kafkaConsumer.subscribe({ topic: 'topic3', fromBeginning: true });

    await this.kafkaConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const msg = JSON.parse(message.value?.toString());
        asyncLogger.info(`Got info from pumpFunMonitor: ${JSON.stringify(msg)}`);
        
        const mintAddress: string = msg.mintAddress;
        const expirationTime = new Date(msg.expirationTime);

        const stream: any = await this.client.subscribe();
        const pair: StreamsPair = [expirationTime, mintAddress];
        this.streams.set(stream, pair);
        this.handleStream(mintAddress, stream);
      },
    });

    asyncLogger.info('tokenBuysMonitor Kafka consumer connected and listening for messages on topic3.');
  }

  private async initKafkaProducer() {
    const kafka = new Kafka({
      clientId: 'app',
      brokers: ['localhost:9092'],
    });

    this.kafkaProducer = kafka.producer();
    await this.kafkaProducer.connect();
    asyncLogger.info('tokenBuysMonitor Kafka producer connected.');
  }

  private startProcessing() {
    setInterval(() => {
       const dates = Array.from(this.streams.entries());
       const now = new Date();
       dates.forEach(([stream, pair]) => {
          if (pair[0] && pair[0] <= now){
            stream.destroy();  
            removeFromWallets(pair[1]);
          }
       }); 
    }, 1000); 
  }
}

export const tokenBuyMonitor = new TokenBuyMonitor();
