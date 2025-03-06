import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import dotenv from 'dotenv';


class AuthTokenManager {
  static async generateToken(discordId: string): Promise<string>{
    const uuid = uuidv4().replace(/-/g, '').slice(0, 16).toUpperCase();
    const hashedDiscordId = crypto.createHash('sha256').update(discordId).digest('base64').slice(0, 16);
    const tokenPrefix = 'FILTRED-';
    const token = `${tokenPrefix}${uuid}${hashedDiscordId}`;
    return token;
  }

  static async generateDate(days: number): Promise<Date> {
    const today = new Date();
    const futureDate = new Date(today.getTime() + (days * 24 * 60 * 60 * 1000));
    return futureDate;
  }

  static async getExpirationsDaysCount(date: Date): Promise<number>{
    const today = new Date();
    const timeDiff = date.getTime() - today.getTime();
    const daysUntil: number = Math.ceil(timeDiff / (1000 * 3600 * 24));
    return daysUntil;
  }
}  

export default AuthTokenManager;
