import { Kafka } from 'kafkajs';
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
  private kafkaConsumer: any;
  private kafkaProducer: any;
  
  constructor() {
    this.client = client;
    this.initKafkaConsumer();
    this.initKafkaProducer();
  }

  async addToken(mintAddress: string): Promise<void> {
    await this.monitorTokens();
    const expirationTime = new Date(Date.now() + cacheExpirationMin * 60 * 1000 );
    this.tokens.set(mintAddress, expirationTime);
    const stream: any = await this.client.subscribe();
    this.streams.set(mintAddress, stream);
    const message = {
      mintAddress: mintAddress,
      expirationTime: expirationTime.toISOString(), 
    };

    await this.kafkaProducer.send({
      topic: 'topic3', 
      messages: [{ value: JSON.stringify(message) }]
    });

    asyncLogger.info(`Started monitoring Token with CA: ${mintAddress}, going to be deleted at ${DateTime.fromMillis(Date.now() + cacheExpirationMin * 60000, { zone: 'Europe/Paris' })}`);
  }

  async removeToken(mintAddress: string): Promise<void> {
    if (this.tokens.has(mintAddress)) {
      this.tokens.delete(mintAddress);
      await this.deleteAndDestroyStream(mintAddress);
      asyncLogger.info(`Manually removed token: ${mintAddress}`);
    }
  }

  private async initKafkaConsumer() {
    const kafka = new Kafka({
      clientId: 'app',
      brokers: ['localhost:9092'],
    });

    this.kafkaConsumer = kafka.consumer({ groupId: 'token-monitor' });

    await this.kafkaConsumer.connect();
    await this.kafkaConsumer.subscribe({ topic: 'topic2', fromBeginning: true });

    await this.kafkaConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const mintAddress = message.value?.toString();
        if (mintAddress) {
          await this.addToken(mintAddress); 
        }
      },
    });

    asyncLogger.info('tokenMonitor Kafka consumer connected and listening for messages on topic2.');
  }

  private async initKafkaProducer() {
    const kafka = new Kafka({
      clientId: 'app',
      brokers: ['localhost:9092'],
    });

    this.kafkaProducer = kafka.producer();
    await this.kafkaProducer.connect();
    asyncLogger.info('tokenMonitor Kafka producer connected.');
  }

  private async monitorTokens(): Promise<void> {
    await this.checkConnection();
    const now = new Date();
    const expiredTokens = Array.from(this.tokens.keys());

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
