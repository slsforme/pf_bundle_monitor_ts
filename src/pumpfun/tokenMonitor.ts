import { setTimeout } from "node:timers/promises";
import { Mutex } from "async-mutex"; 
import { DateTime } from 'luxon';

import { logger } from "../../config/appConfig";
import { cacheExpirationMin } from "../../config/config";
import { raydiumMigrationMonitor, RaydiumMigrationsMonitor } from "../raydium/raydiumMonitor";

export class TokenMonitor {
  private tokens: Map<string, Date> = new Map();
  private lock: Mutex = new Mutex();
  private raydiumMonitor: RaydiumMigrationsMonitor = raydiumMigrationMonitor;
  public expiredTokens: Array<string> = new Array<string>;

  constructor() {}

  async addToken(tokenAddress: string): Promise<void> {
    const release = await this.lock.acquire();
    try {
      const expirationTime = new Date(Date.now() + cacheExpirationMin * 60000 );
      this.tokens.set(tokenAddress, expirationTime);
      // logger.info(`Started monitoring Token with CA: ${tokenAddress}, going to be deleted at ${DateTime.fromMillis(Date.now() + cacheExpirationMin * 60000, { zone: 'Europe/Paris' })}`);
      // TODO: impl трекер холдеров и unsubscribe в конце
    } finally {
      release();
    }
    // await setTimeout(cacheExpirationMin * 60 * 1000);
    // await this.removeToken(tokenAddress);
  }

  async removeToken(tokenAddress: string): Promise<void> {
    const release = await this.lock.acquire();
    try {
      if (this.tokens.has(tokenAddress)) {
        this.tokens.delete(tokenAddress);
        // logger.info(`Manually removed token: ${tokenAddress}`);
      } else {
        // logger.warn(`Tried to remove non-existing token: ${tokenAddress}`);
      }
    } finally {
      release();
    }
  }

  async monitorTokens(): Promise<void> {
    logger.info("Monitoring just started.");
    this.raydiumMonitor.startMonitoring();

    while (true) {
      const release = await this.lock.acquire();
      try {
        const now = new Date();
        const expiredTokens = Array.from(this.tokens.keys());

        for (const token of expiredTokens) {
          if (await this.raydiumMonitor.checkToken(token)){
            logger.info(`Token ${token} migrated to Raydium, removing from monitoring.`);
            this.tokens.delete(token);
            this.expiredTokens.push(token);
            continue;
          }

          const expirationTime = this.tokens.get(token);
          if (expirationTime && expirationTime <= now) {
            // logger.info(`Token ${token} expired, removing from monitoring.`);
            this.tokens.delete(token);
            this.expiredTokens.push(token);
          }
        }
      } finally {
        release();
      }

      await setTimeout(1000);
    }
  }
}

export const tokenMonitor = new TokenMonitor();
