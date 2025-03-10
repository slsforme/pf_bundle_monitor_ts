import { asyncLogger, redis } from "../../config/appConfig";

const SYSTEM_PROGRAMS: Array<string> = [
    '11111111111111111111111111111111',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    'ComputeBudget111111111111111111111111111111'
];

export async function getWallets(key: string) {
    const values = await redis.smembers(key); 
    return values;
}

export async function addToWallets(key: string, value: string) {
    await redis.sadd(key, value); 
}

export async function removeFromWallets(key: string) {
    await redis.del(key);
}

export async function findMatchInTransaction(accountKeys: Array<string>): Promise<[string[], string, string | null]> {
    let cursor = '0'; 
    let matchedWallets: string[] = [];
    let mintAddress: string = '';
    let keyAccount: string | null = null;
    
    do {
        const result = await redis.scan(cursor);
        cursor = result[0]; 
        const keys = result[1]; 
        
        for (const key of keys) {
            const keyType = await redis.type(key);
            
            // Only proceed if it's a set
            if (keyType === 'set') {
                mintAddress = key;
                try {
                    const wallets = await getWallets(key); 
                    const filteredWallets = wallets.filter(element => 
                        accountKeys.includes(element) && !SYSTEM_PROGRAMS.includes(element)
                    );
                    
                    if (filteredWallets.length > 0) {
                        matchedWallets = filteredWallets;
                        keyAccount = await getKeyAccount(mintAddress);
                        break;
                    }
                } catch (error) {
                    // Log the error but continue processing other keys
                    console.error(`Error processing key ${key}: ${error.message}`);
                }
            } else {
                asyncLogger.info(`Key type is ${keyType}`);
                asyncLogger.info(`Key is ${key}`);
                asyncLogger.info(`Data in key: ${await getWallets(key)}`);
            }
        }
    } while (cursor !== '0' && matchedWallets.length === 0); 
    
    return [matchedWallets, mintAddress, keyAccount];
}

export async function getKeyAccount(mintAddress: string): Promise<string | null> {
    const wallets = await redis.smembers(mintAddress);
    return wallets.length > 0 ? wallets[0] : null; 
}



