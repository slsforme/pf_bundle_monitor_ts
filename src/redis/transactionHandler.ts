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

export async function findMatchInTransaction(accountKeys: Array<string>): Promise<[string[], string, string | null]> {
    let cursor = '0'; 
    let matchedWallets: string[] = [];
    let mintAddress: string = '';
    let keyAccount: string = '';

    do {
        const result = await redis.scan(cursor);
        cursor = result[0]; 
        const keys = result[1]; 

        for (const key of keys) {
            mintAddress = key;
            const wallets = await getWallets(key); 
            const filteredWallets = wallets.filter(element => accountKeys.includes(element) && !SYSTEM_PROGRAMS.includes(element));
            
            if (filteredWallets.length > 0) {
                matchedWallets = filteredWallets;
                keyAccount = await getKeyAccount(mintAddress);
                break;
            } 
        }
    } while (cursor !== '0'); 

    return [matchedWallets, mintAddress, keyAccount];
}

export async function getKeyAccount(mintAddress: string): Promise<string | null> {
    const wallets = await redis.smembers(mintAddress);
    return wallets.length > 0 ? wallets[0] : null; 
}



