import Client, { CommitmentLevel, SubscribeRequest, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { Kafka } from 'kafkajs';

import { backupClient, client, asyncLogger, kafkaConfig } from "../../config/appConfig";
import { bOutput } from "./utils/blockOutput";
import { tOutPut } from "./utils/transactionOutput";
import { addToWallets, findMatchInTransaction, getKeyAccount } from "../redis/transactionHandler";
import { BlacklistHandler } from "../accounts/accountsMonitor";

class BlocksMonitor {
  private client: Client;
  private kafkaProducer: any; 

  constructor() {
    this.client = client;
    this.monitorTasks();
    this.initKafkaProducer();
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
          const block = await bOutput(data);
          if (!block) return;
          // Proceed to kafka
          this.parseTransactions(block.txs);

        } catch(error){
          asyncLogger.error(error);
        }

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
      // TOFIX
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
    const kafka = new Kafka(kafkaConfig);

    this.kafkaProducer = kafka.producer();
    await this.kafkaProducer.connect();
    asyncLogger.info('tokenBuysMonitor Kafka producer connected.');
  }

  
  private async parseTransactions(txs: Array<any>) {
    const promises = txs.map(async (tx) => {
      try {
        const decodedTx = await tOutPut(tx);
        const balanceDifference = decodedTx.postBalance - decodedTx.preBalance;
        const isOutflow = balanceDifference < 0;
        const transferAmount = Math.abs(balanceDifference);
        
        if (transferAmount / 1_000_000_000 < 0.1 || decodedTx.accountKeys.length >= 7) {
          return;
        }
        
        const [matchedWallets, mintAddress, keyAccount] = await findMatchInTransaction(decodedTx.accountKeys);
        if (!matchedWallets.length) {
          return;
        }
        
        const account = matchedWallets[0];
        const wallet = decodedTx.accountKeys[0] === account
          ? decodedTx.accountKeys[1]
          : decodedTx.accountKeys[0];
        
        const flowType = isOutflow ? "outflow" : "inflow";
        const walletOnWhitelist = await BlacklistHandler.isWalletOnWhitelist(wallet);
        
        if (!walletOnWhitelist) {
          asyncLogger.info(`Found ${flowType} tx: ${decodedTx.signature} by ${account}\n Tracking ${isOutflow ? "receiver" : "sender"} wallet: ${wallet}`);
          
          await addToWallets(mintAddress[0], wallet);
          
          const message = {
            mintAddress,
            account: wallet,
            keyAccount
          };
          
          await this.kafkaProducer.send({
            topic: "blocksTopic",
            messages: [{ value: JSON.stringify(message) }]
          });
          
          asyncLogger.info(`Sent info to accountsMonitor: ${JSON.stringify(message)}`);
        } else if (isOutflow && (decodedTx.postBalance / 1_000_000_000) < 0.1) {
          asyncLogger.info(`Found outflow tx: ${decodedTx.signature} by ${account} to exchange - whitelist wallet: ${wallet}`);
        }
      } catch (error) {
        asyncLogger.error(`Error processing transaction: ${error.message}`);
      }
    });
    
    await Promise.all(promises);
  }

}


export const blocksMonitor = new BlocksMonitor();


