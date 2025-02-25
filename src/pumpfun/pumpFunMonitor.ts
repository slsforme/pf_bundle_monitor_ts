import Client, { CommitmentLevel, SubscribeRequest, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { pumpFunTransactionOutput } from "./utils/pumpFunTransactionOutput";
import { grpcUrl, backupGrpcUrl } from "../../config/config";
import { asyncLogger, client, backupClient } from "../../config/appConfig";
import { TokenMonitor } from "./tokenMonitor";

export class PumpFunMonitor {
  private readonly request: SubscribeRequest;
  private client: Client;
  private readonly tokenMonitor: TokenMonitor;
  private readonly pumpFunProgram = "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM";
  private isMonitoring = false;
  private readonly reconnectDelay = 1000; 

  constructor(tokenMonitor: TokenMonitor) {
    this.tokenMonitor = tokenMonitor;  
    this.client = client;
    
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
    // Start token monitoring separately
    this.tokenMonitor.monitorTokens();
    
    if (this.isMonitoring) {
      return;
    }
    
    this.isMonitoring = true;
    
    while (this.isMonitoring) {
      try {
        const connected = await this.checkConnection();
        if (connected) {
          await this.handleStream();
        }
      } catch (error) {
        asyncLogger.error(`Stream error: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        if (this.isMonitoring) {
          asyncLogger.info(`Restarting monitor in ${this.reconnectDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));
        }
      }
    }
  }

  async stopMonitoring() {
    this.isMonitoring = false;
    asyncLogger.info("Stopping PumpFun monitoring");
  }

  private async checkConnection(): Promise<boolean> {
    const endpoint = this.client === client ? grpcUrl : backupGrpcUrl;
    try {
      const timeout = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Ping timeout")), 5000)
      );
      
      await Promise.race([this.client.ping(1), timeout]);
      asyncLogger.info(`Connected to ${endpoint}`);
      return true;
    } catch (error) {
      asyncLogger.error(`Connection to ${endpoint} failed: ${error instanceof Error ? error.message : String(error)}`);
      this.client = this.client === client ? backupClient : client;
      return false;
    }
  }

  private async handleStream() {
    let stream;
    
    try {
      stream = await this.client.subscribe();
    } catch (error) {
      asyncLogger.error(`Failed to create subscription stream: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    return new Promise<void>((resolve, reject) => {
      if (!stream) {
        reject(new Error("Stream is undefined"));
        return;
      }
      
      // Set up event handlers
      stream.on("error", (error) => {
        asyncLogger.error(`Stream error: ${error instanceof Error ? error.message : String(error)}`);
        stream.end();
        reject(error);
      });
      
      stream.on("end", () => {
        asyncLogger.info("Stream ended");
        resolve();
      });
      
      stream.on("close", () => {
        asyncLogger.info("Stream closed");
        resolve();
      });

      stream.on("data", this.handleStreamData.bind(this));
      
      // Send subscription request
      stream.write(this.request, (err) => {
        if (err) {
          asyncLogger.error(`Subscription request error: ${err.message}`);
          stream.end();
          reject(err);
        } else {
          asyncLogger.info("Subscription request sent successfully");
        }
      });
    });
  }
  
  private async handleStreamData(data: SubscribeUpdate) {
    try {
      const result = await pumpFunTransactionOutput(data);
      if (!result) return;
      
      const mintAddress = result.meta.postTokenBalances?.[0]?.mint;
      if (!mintAddress) {
        return;
      }
      
      asyncLogger.info(`New pump.fun token detected: ${mintAddress}`);
      this.tokenMonitor.addToken(mintAddress);
    } catch (error) {
      asyncLogger.error(`Error processing stream data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}