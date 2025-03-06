import fs from 'fs';
import path from 'path';

export interface AuthToken {
  discordID: string;
  token: string;
  expirationDate: Date;
}

class AuthTokenStorageManager {
  private static readonly TOKEN_FILE_PATH = path.join(__dirname, 'auth-tokens.json');

  static async getTokens(): Promise<AuthToken[]> {
    try {
      if (!fs.existsSync(this.TOKEN_FILE_PATH)) {
        await this.createTokenFile();
        return [];
      }
      const data = await fs.promises.readFile(this.TOKEN_FILE_PATH, 'utf8');
      return JSON.parse(data) as AuthToken[];
    } catch (error) {
      console.error('Error reading auth tokens:', error);
      return [];
    }
  }

  static async getToken(discordId): Promise<AuthToken | null>{
    try {
      let tokens: AuthToken[] = await this.getTokens();
      const token: AuthToken = tokens.filter((t) => t.discordID === discordId)[0];
    } catch (error) {
      console.error('Error reading auth tokens:', error);
      return null;
    }
  }

  static async addToken(token: AuthToken): Promise<AuthToken | null> {
    try {
      const tokens = await this.getTokens();
      if (!await this.doesTokenExists(token.discordID)) {
        tokens.push(token);
        await this.writeTokensToFile(tokens);
        return token;
      }
      return null;
    } catch (error) {
      console.error('Error adding auth token:', error);
      return null;
    }
  }

  static async removeToken(discordId: string): Promise<void> {
    try {
      let tokens = await this.getTokens();
      tokens = tokens.filter((t) => t.discordID !== discordId);
      await this.writeTokensToFile(tokens);
    } catch (error) {
      console.error('Error removing auth token:', error);
    }
  }

  static async updateToken(discordId: string, expirationDate: Date): Promise<void> {
    try {
      let tokens = await this.getTokens();
      const tokenIndex = tokens.findIndex((t) => t.discordID === discordId);

      if (tokenIndex !== -1) {
        tokens[tokenIndex].expirationDate = expirationDate;
        await this.writeTokensToFile(tokens);
        console.log(`Token for Discord ID ${discordId} updated successfully.`);
      } else {
        console.log(`No token found for Discord ID ${discordId}.`);
      }
    } catch (error) {
      console.error('Error updating auth token:', error);
    }
  }

  static async doesTokenExists(discordId: string): Promise<boolean> {
    try {
      const tokens = await this.getTokens();
      return tokens.some((t) => t.discordID === discordId);
    } catch (error) {
      console.error('Error checking if token exists:', error);
      return false;
    }
  }

  private static async createTokenFile(): Promise<void> {
    try {
      await fs.promises.writeFile(this.TOKEN_FILE_PATH, '[]');
      console.log('Auth token file created successfully.');
    } catch (error) {
      console.error('Error creating auth token file:', error);
    }
  }

  private static async writeTokensToFile(tokens: AuthToken[]): Promise<void> {
    try {
      await fs.promises.writeFile(this.TOKEN_FILE_PATH, JSON.stringify(tokens, null, 2));
    } catch (error) {
      console.error('Error writing auth tokens to file:', error);
    }
  }
}

export default AuthTokenStorageManager;
