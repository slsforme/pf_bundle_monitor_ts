// import Client, { CommitmentLevel, SubscribeRequest, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
// import { Kafka } from 'kafkajs';

// import { backupClient, client, asyncLogger } from "../../config/appConfig";
// import { bOutput } from "./utils/blockOutput";
// import { tOutPut } from "./utils/transactionOutput";
// import { addToWallets, findMatchInTransaction } from "../redis/transactionHandler";
// import { BlacklistHandler } from "../accounts/accountsMonitor";

// class BlocksMonitor {
//   private client: Client;
//   private kafkaProducer: any; 

//   constructor() {
//     this.client = client;
//     // this.initKafkaProducer();
//     this.monitorTasks();
//     this.handleStream();
//   }

//   public async handleStream(): Promise<void> {
//     const request: SubscribeRequest = {
//       accounts: {},
//       slots: {},
//       transactions: {},
//       entry: {},
//       blocks: {
//         "blocks": {
//             accountInclude: [],
//         }
//       },
//       blocksMeta: {},
//       accountsDataSlice: [],
//       ping: undefined,
//       commitment: CommitmentLevel.CONFIRMED,
//     };

//     const stream = await this.client.subscribe();
    
//     const streamClosed = new Promise<void>((resolve, reject) => {
//       stream.on("error", (error) => {
//         asyncLogger.error("Error occurred: " + error);
//         reject(error);
//         stream.end();
//       });
//       stream.on("end", resolve);
//       stream.on("close", resolve);
//     });

//     stream.on("data", async (data: SubscribeUpdate) => {
//         try{
//           const date = new Date();
//           const currentTime = new Date(parseInt(data.block.blockTime.timestamp) * 1000);
//           console.log(data.block.blockHeight);
//           console.log(`${currentTime.toLocaleString()}`);
//           console.log(`${date.toLocaleString()}`)

//         } catch(error){
//           console.log(error);
//         }
//         // this.parseTransactions(block.txs);

//     });
//     ``
//     await new Promise<void>((resolve, reject) => {
//       stream.write(request, (err: any) => {
//         if (!err) {
//           resolve();
//         } else {
//           reject(err);
//         }
//       });
//     }).catch((reason) => {
//       asyncLogger.error("Subscription error: " + reason);
//       throw reason;
//     });

//     await streamClosed;
//   }

//   public async monitorTasks(): Promise<void> {
//     while (true) {
//       try {
//         await this.checkConnection();
//         await new Promise(resolve => setTimeout(resolve, 1000));
//       } catch (error) {
//         asyncLogger.error("Stream error, restarting in 1 second...");
//         await new Promise((resolve) => setTimeout(resolve, 1000));
//       }
//     }
//   }

//   private async checkConnection() {
//     try {
//       await this.client.ping(1);
//     } catch (error) {
//       this.client = this.client === client ? backupClient : client;
//     }
//     await new Promise((resolve) => setTimeout(resolve, 1000));
//   }

//   private async initKafkaProducer() {
//     const kafka = new Kafka({
//       clientId: 'app',
//       brokers: ['localhost:9092'],
//     });

//     this.kafkaProducer = kafka.producer();
//     await this.kafkaProducer.connect();
//     asyncLogger.info('tokenBuysMonitor Kafka producer connected.');
//   }

//   private async parseTransactions(txs: Array<any>){
//     for (const tx of txs)
//     {
//       const decodedTx = await tOutPut(tx);
      
//       const isOutflow = (decodedTx.postBalance - decodedTx.preBalance) < 0;
//       const transferAmount = isOutflow 
//         ? (decodedTx.preBalance - decodedTx.postBalance)
//         : (decodedTx.postBalance - decodedTx.preBalance);
        
//       if (transferAmount / 1_000_000_000 >= 0.1 && decodedTx.accountKeys.length < 7) {

//         const [matchedWallets, mintAddress] = await findMatchInTransaction(decodedTx.accountKeys);
//         if (matchedWallets.length){
//           const account: string = matchedWallets[0];
//           asyncLogger.info(account);
//           const wallet = decodedTx.accountKeys[0] === account
//           ? decodedTx.accountKeys[1]
//           : decodedTx.accountKeys[0];
          
//           const flowType = isOutflow ? "outflow" : "inflow";
//           const walletOnWhitelist: string | undefined = await BlacklistHandler.isWalletOnWhitelist(wallet);
//           if (!walletOnWhitelist)
//           {
//             asyncLogger.info(`Found ${flowType} tx: ${decodedTx.signature} by ${account}\n Tracking ${isOutflow ? "receiver" : "sender"} wallet: ${wallet}`);
//             await addToWallets(mintAddress[0], wallet);
//             // TODO: передавать в Kafka
//             // if (keyAccount){
//             //   blacklistHandler.addAccountToCache(mintAddress, wallet, keyAccount);
//             //   this.handleStream(wallet, mintAddress, keyAccount);
//             // } else {
//             //     blacklistHandler.addAccountToCache(mintAddress, wallet, account);
//             //     this.handleStream(wallet, mintAddress, account);
//             // }
//           } 
//           else {
//             if (isOutflow && (decodedTx.postBalance / 1_000_000_000) < 0.1)
//             {
//               asyncLogger.info(`Found outflow tx: ${decodedTx.signature} by ${account} to exchange - whitelist wallet: ${walletOnWhitelist} `);
//             }
//           }
//         }
//       }
//     } 
//   }

// }


// export const blocksMonitor = new BlocksMonitor();


import Client, { CommitmentLevel, SubscribeRequest, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import * as bs58 from 'bs58';
import { grpcUrl } from "../../config/config";

class GrpcStreamManager {
    private client: Client;
    private stream: any;
    private isConnected: boolean = false;
    private reconnectAttempts: number = 0;
    private readonly maxReconnectAttempts: number = 10;
    private readonly reconnectInterval: number = 5000; // 5 seconds
    private readonly dataHandler: (data: any) => void;

    constructor(
        endpoint: string,
        dataHandler: (data: any) => void
    ) {
        this.client = new Client(
            endpoint,
            undefined,
            { "grpc.max_receive_message_length": 64 * 1024 * 1024 }
        );
        this.dataHandler = dataHandler;
    }

    async connect(subscribeRequest: SubscribeRequest): Promise<void> {
        try {
            this.stream = await this.client.subscribe();
            this.isConnected = true;
            this.reconnectAttempts = 0;

            this.stream.on("data", this.handleData.bind(this));
            this.stream.on("error", this.handleError.bind(this));
            this.stream.on("end", () => this.handleDisconnect(subscribeRequest));
            this.stream.on("close", () => this.handleDisconnect(subscribeRequest));

            await this.write(subscribeRequest);
            this.startPing();
        } catch (error) {
            console.error("Connection error:", error);
            await this.reconnect(subscribeRequest);
        }
    }

    private async write(req: SubscribeRequest): Promise<void> {
        return new Promise((resolve, reject) => {
            this.stream.write(req, (err: any) => err ? reject(err) : resolve());
        });
    }

    private async reconnect(subscribeRequest: SubscribeRequest): Promise<void> {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error("Max reconnection attempts reached");
            return;
        }

        this.reconnectAttempts++;
        console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);

        setTimeout(async () => {
            try {
                await this.connect(subscribeRequest);
            } catch (error) {
                console.error("Reconnection failed:", error);
                await this.reconnect(subscribeRequest);
            }
        }, this.reconnectInterval * Math.min(this.reconnectAttempts, 5));
    }

    private startPing(): void {
        setInterval(() => {
            if (this.isConnected) {
                this.write({
                    ping: { id: 1 },
                    accounts: {},
                    accountsDataSlice: [],
                    transactions: {},
                    blocks: {},
                    blocksMeta: {},
                    entry: {},
                    slots: {},
                }).catch(console.error);
            }
        }, 30000);
    }

    private handleData(data: any): void {
        try {
            const processed = this.processBuffers(data);
            this.dataHandler(processed);
        } catch (error) {
            console.error("Error processing data:", error);
        }
    }

    private handleError(error: any): void {
        console.error("Stream error:", error);
        this.isConnected = false;
    }

    private handleDisconnect(subscribeRequest: SubscribeRequest): void {
        console.log("Stream disconnected");
        this.isConnected = false;
        this.reconnect(subscribeRequest);
    }

    private processBuffers(obj: any): any {
        if (!obj) return obj;
        if (Buffer.isBuffer(obj) || obj instanceof Uint8Array) {
            return bs58.encode(obj);
        }
        if (Array.isArray(obj)) {
            return obj.map(item => this.processBuffers(item));
        }
        if (typeof obj === 'object') {
            return Object.fromEntries(
                Object.entries(obj).map(([k, v]) => [k, this.processBuffers(v)])
            );
        }
        return obj;
    }
}

// Block monitoring implementation
async function monitorBlocks() {
    const manager = new GrpcStreamManager(
         grpcUrl,
         handleBlockUpdate
    );

    const subscribeRequest: SubscribeRequest = {
        blocks: {
            blocks: {
              accountInclude: []
            }
        },
        accounts: {},
        accountsDataSlice: [],
        slots: {},
        transactions: {},
        blocksMeta: {},
        entry: {},
        commitment: CommitmentLevel.CONFIRMED,
    };

    console.log('Starting block monitoring...');
    await manager.connect(subscribeRequest);
}

function handleBlockUpdate(data: SubscribeUpdate): void {
    if (data?.block) {
        const block = data.block;
        console.log('\n=== Block Details ===');
        console.log(`Slot: ${block.slot}`);
        console.log(`Parent Slot: ${block.parentSlot}`);
        console.log(`Blockhash: ${block.blockhash}`);
        console.log(`Current time: ${new Date(parseInt(block.blockTime.timestamp) * 1000)}`)
        console.log(`Blockheight: ${block.blockHeight.blockHeight}`);

        
        // if (block.transactions?.length > 0) {
        //     console.log('\n=== Block Transactions ===');
        //     console.log(`Transaction Count: ${block.transactions.length}`);
        //     block.transactions.forEach((tx: any, index: number) => {
        //         if (tx.transaction?.signatures?.[0]) {
        //             console.log(`\nTransaction ${index + 1}:`);
        //             console.log(`  Signature: ${tx.transaction.signatures[0]}`);
                    
        //             if (tx.meta?.err) {
        //                 console.log(`  Status: Failed`);
        //                 console.log(`  Error: ${JSON.stringify(tx.meta.err)}`);
        //             } else {
        //                 console.log(`  Status: Success`);
        //             }

        //             if (tx.meta) {
        //                 console.log(`  Fee: ${tx.meta.fee} lamports`);
        //                 console.log(`  Compute Units: ${tx.meta.computeUnitsConsumed || 'N/A'}`);
        //             }
        //         }
        //     });
        // }
        console.log('\n' + '='.repeat(50) + '\n');
    }
}



monitorBlocks();
