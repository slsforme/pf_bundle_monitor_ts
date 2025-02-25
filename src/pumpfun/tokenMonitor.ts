import { setTimeout as delay } from "node:timers/promises";
import { Mutex } from "async-mutex"; 
import Client from "@triton-one/yellowstone-grpc";
import { DateTime } from 'luxon';

import { backupClient, client, asyncLogger, logger } from "../../config/appConfig";
import { cacheExpirationMin, grpcUrl, backupGrpcUrl } from "../../config/config";
import { raydiumMigrationMonitor, RaydiumMigrationsMonitor } from "../raydium/raydiumMonitor";
import { tokenBuyMonitor } from "./tokenBuysMonitor";

export class TokenMonitor {
  private tokens: Map<string, Date> = new Map();
  private streams: Map<string, any> = new Map();
  private lock: Mutex = new Mutex();
  private client: Client;
  private raydiumMonitor: RaydiumMigrationsMonitor = raydiumMigrationMonitor;

  constructor() {
    this.client = client;
  }

  async addToken(mintAddress: string): Promise<void> {
    const release = await this.lock.acquire();
    try {
      const expirationTime = new Date(Date.now() + cacheExpirationMin * 60 * 1000 );
      this.tokens.set(mintAddress, expirationTime);
      const stream: any = await this.client.subscribe();
      this.streams.set(mintAddress, stream);
      tokenBuyMonitor.addTokenBuyTask(mintAddress, stream);
      asyncLogger.info(`Started monitoring Token with CA: ${mintAddress}, going to be deleted at ${DateTime.fromMillis(Date.now() + cacheExpirationMin * 60000, { zone: 'Europe/Paris' })}`);
    } finally {
      release();
    }
    await delay(cacheExpirationMin * 60 * 1000);
    await this.removeToken(mintAddress);
  }

  async removeToken(mintAddress: string): Promise<void> {
    const release = await this.lock.acquire();
    try {
      if (this.tokens.has(mintAddress)) {
        this.tokens.delete(mintAddress);
        await this.deleteAndDestroyStream(mintAddress);
        asyncLogger.info(`Manually removed token: ${mintAddress}`);
      }
    } finally {
      release();
    }
  }

  public async monitorTokens(): Promise<void> {
    logger.info("Monitoring just started.");
    this.raydiumMonitor.startMonitoring();

    while (true) {
      const release = await this.lock.acquire();
      try {
        await this.checkConnection();
        const now = new Date();
        const expiredTokens = Array.from(this.tokens.keys());

        for (const mintAddress of expiredTokens) {
          if (await this.raydiumMonitor.checkToken(mintAddress)){
            asyncLogger.info(`Token ${mintAddress} migrated to Raydium, removing from monitoring.`);
            this.tokens.delete(mintAddress);
            await this.deleteAndDestroyStream(mintAddress);
            continue;
          }

          const expirationTime = this.tokens.get(mintAddress);
          if (expirationTime && expirationTime <= now) {
            asyncLogger.info(`Token ${mintAddress} expired, removing from monitoring.`);
            this.tokens.delete(mintAddress);
            await this.deleteAndDestroyStream(mintAddress);
          } 
        }
      } catch(error){
          asyncLogger.error(`Error occurred: ${error}`)
      } finally {
        release();
      }

      await delay(1000);
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

  private async deleteAndDestroyStream(mintAddress: string){
    const stream = this.streams.get(mintAddress);
    if (stream) {
        try {
            await stream.destroy();
        } catch (error) {
            asyncLogger.error(`Failed to destroy stream for ${mintAddress}: ${error}`);
        }
    }
    this.streams.delete(mintAddress);
  }
}

export const tokenMonitor = new TokenMonitor();
