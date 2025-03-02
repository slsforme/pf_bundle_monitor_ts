import Client, { CommitmentLevel, SubscribeRequest, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { Kafka } from 'kafkajs';

import { backupClient, client, asyncLogger } from "../../config/appConfig";
import { bOutput } from "./utils/blockOutput";
import { tOutPut } from "./utils/transactionOutput";
import { addToWallets, findMatchInTransaction } from "../redis/transactionHandler";
import { BlacklistHandler } from "../accounts/accountsMonitor";

class BlocksMonitor {
  private client: Client;
  private kafkaProducer: any; 

  constructor() {
    this.client = client;
    // this.initKafkaProducer();
    this.monitorTasks();
    this.handleStream();
  }

  public async handleStream(): Promise<void> {
    const request: SubscribeRequest = {
      accounts: {},
      slots: {},
      transactions: {},
      entry: {},
      blocks: {
        "blocks": {
            accountInclude: [],
        }
      },
      blocksMeta: {},
      accountsDataSlice: [],
      ping: undefined,
      commitment: CommitmentLevel.CONFIRMED,
    };

    const stream = await this.client.subscribe();
    
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
        try{
          const currentTime = new Date(parseInt(data.block.blockTime.timestamp) * 1000);
          console.log(data.block.blockHeight);
          console.log(`${currentTime.toLocaleString()}`);

        } catch(error){
          console.log(error);
        }
        // this.parseTransactions(block.txs);

    });
    ``
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

  private async initKafkaProducer() {
    const kafka = new Kafka({
      clientId: 'app',
      brokers: ['localhost:9092'],
    });

    this.kafkaProducer = kafka.producer();
    await this.kafkaProducer.connect();
    asyncLogger.info('tokenBuysMonitor Kafka producer connected.');
  }

  private async parseTransactions(txs: Array<any>){
    for (const tx of txs)
    {
      const decodedTx = await tOutPut(tx);
      
      const isOutflow = (decodedTx.postBalance - decodedTx.preBalance) < 0;
      const transferAmount = isOutflow 
        ? (decodedTx.preBalance - decodedTx.postBalance)
        : (decodedTx.postBalance - decodedTx.preBalance);
        
      if (transferAmount / 1_000_000_000 >= 0.1 && decodedTx.accountKeys.length < 7) {

        const [matchedWallets, mintAddress] = await findMatchInTransaction(decodedTx.accountKeys);
        if (matchedWallets.length){
          const account: string = matchedWallets[0];
          asyncLogger.info(account);
          const wallet = decodedTx.accountKeys[0] === account
          ? decodedTx.accountKeys[1]
          : decodedTx.accountKeys[0];
          
          const flowType = isOutflow ? "outflow" : "inflow";
          const walletOnWhitelist: string | undefined = await BlacklistHandler.isWalletOnWhitelist(wallet);
          if (!walletOnWhitelist)
          {
            asyncLogger.info(`Found ${flowType} tx: ${decodedTx.signature} by ${account}\n Tracking ${isOutflow ? "receiver" : "sender"} wallet: ${wallet}`);
            await addToWallets(mintAddress[0], wallet);
            // TODO: передавать в Kafka
            // if (keyAccount){
            //   blacklistHandler.addAccountToCache(mintAddress, wallet, keyAccount);
            //   this.handleStream(wallet, mintAddress, keyAccount);
            // } else {
            //     blacklistHandler.addAccountToCache(mintAddress, wallet, account);
            //     this.handleStream(wallet, mintAddress, account);
            // }
          } 
          else {
            if (isOutflow && (decodedTx.postBalance / 1_000_000_000) < 0.1)
            {
              asyncLogger.info(`Found outflow tx: ${decodedTx.signature} by ${account} to exchange - whitelist wallet: ${walletOnWhitelist} `);
            }
          }
        }
      }
    } 
  }

}


export const blocksMonitor = new BlocksMonitor();


