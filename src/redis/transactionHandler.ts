import { redis } from "../../config/appConfig";


export async function getWallets(key: string) {
    const values = await redis.smembers(key); 
    return values;
}

export async function addToWallets(key: string, value: string) {
    await redis.sadd(key, value); 
}

export async function findMatchInTransaction(accountKeys: Array<string>): Promise<[string[], string]> {
    let cursor = '0'; 
    let matchedWallets: string[] = [];
    let mintAddress: string = '';

    do {
        const result = await redis.scan(cursor);
        cursor = result[0]; 
        const keys = result[1]; 

        for (const mintAddress of keys) {
            const wallets = await getWallets(mintAddress); 
            const filteredWallets = wallets.filter(element => accountKeys.includes(element));

            if (filteredWallets.length > 0) {
                matchedWallets = filteredWallets;
                break;
            } 
        }
    } while (cursor !== '0'); 

    return [matchedWallets, mintAddress];
}



