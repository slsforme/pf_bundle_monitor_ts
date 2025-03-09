import { redis } from "../../config/appConfig";

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
    // Filter out system programs from account keys to avoid unnecessary checks
    const filteredAccountKeys = accountKeys.filter(key => !SYSTEM_PROGRAMS.includes(key));
    
    // If no valid account keys remain after filtering, return early
    if (filteredAccountKeys.length === 0) {
        return [[], '', null];
    }
    
    // Create a set for faster lookups
    const accountKeySet = new Set(filteredAccountKeys);
    
    let cursor = '0';
    let matchedWallets: string[] = [];
    let mintAddress: string = '';
    let keyAccount: string | null = null;
    
    // Process in batches for better performance
    const processBatch = async (keys: string[]) => {
        // Get all wallets for all keys in parallel
        const walletsPromises = keys.map(async (key) => {
            const wallets = await getWallets(key);
            // Return early if no wallets match
            const matches = wallets.filter(wallet => accountKeySet.has(wallet));
            
            if (matches.length > 0) {
                return { key, matches };
            }
            return null;
        });
        
        const results = await Promise.all(walletsPromises);
        
        // Find the first non-null result
        const match = results.find(result => result !== null);
        
        if (match) {
            mintAddress = match.key;
            matchedWallets = match.matches;
            keyAccount = await getKeyAccount(mintAddress);
            return true; // Match found
        }
        
        return false; // No match found in this batch
    };
    
    try {
        do {
            const scanResult = await redis.scan(cursor, 'COUNT', '100'); // Scan with a larger count for better performance
            cursor = scanResult[0];
            const keys = scanResult[1];
            
            if (keys.length === 0) {
                continue;
            }
            
            const matchFound = await processBatch(keys);
            if (matchFound) {
                break;
            }
        } while (cursor !== '0');
        
        return [matchedWallets, mintAddress, keyAccount];
    } catch (error) {
        console.error('Error in findMatchInTransaction:', error);
        return [[], '', null];
    }
}

export async function getKeyAccount(mintAddress: string): Promise<string | null> {
    const wallets = await redis.smembers(mintAddress);
    return wallets.length > 0 ? wallets[0] : null; 
}



