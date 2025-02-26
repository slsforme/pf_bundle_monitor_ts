import Client from "@triton-one/yellowstone-grpc";
import { DateTime } from 'luxon';

import { backupClient, client, asyncLogger } from "../../config/appConfig";
import { cacheExpirationMin } from "../../config/config";
import { raydiumMigrationMonitor, RaydiumMigrationsMonitor } from "../raydium/raydiumMonitor";
import { tokenBuyMonitor } from "./tokenBuysMonitor";

export class TokenMonitor {
  private tokens: Map<string, Date> = new Map();
  private streams: Map<string, any> = new Map();
  private client: Client;
  private raydiumMonitor: RaydiumMigrationsMonitor = raydiumMigrationMonitor;

  constructor() {
    this.client = client;
  }

  async addToken(mintAddress: string): Promise<void> {
    await this.monitorTokens();
    const expirationTime = new Date(Date.now() + cacheExpirationMin * 60 * 1000 );
    this.tokens.set(mintAddress, expirationTime);
    const stream: any = await this.client.subscribe();
    this.streams.set(mintAddress, stream);
    tokenBuyMonitor.handleStream(mintAddress, stream);
    asyncLogger.info(`Started monitoring Token with CA: ${mintAddress}, going to be deleted at ${DateTime.fromMillis(Date.now() + cacheExpirationMin * 60000, { zone: 'Europe/Paris' })}`);
  }

  async removeToken(mintAddress: string): Promise<void> {
    if (this.tokens.has(mintAddress)) {
      this.tokens.delete(mintAddress);
      await this.deleteAndDestroyStream(mintAddress);
      asyncLogger.info(`Manually removed token: ${mintAddress}`);
    }
  }

  private async monitorTokens(): Promise<void> {
    this.raydiumMonitor.startMonitoring();
    const now = new Date();
    const expiredTokens = Array.from(this.tokens.keys());

    console.log(expiredTokens.length)
    for (const mintAddress of expiredTokens) {
      const expirationTime = this.tokens.get(mintAddress);
      if (expirationTime && expirationTime <= now) {
        asyncLogger.info(`Token ${mintAddress} expired, removing from monitoring.`);
        this.tokens.delete(mintAddress);
        this.deleteAndDestroyStream(mintAddress);
      } 

      if (await this.raydiumMonitor.checkToken(mintAddress)){
        asyncLogger.info(`Token ${mintAddress} migrated to Raydium, removing from monitoring.`);
        this.tokens.delete(mintAddress);
        this.deleteAndDestroyStream(mintAddress);
        continue;
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
