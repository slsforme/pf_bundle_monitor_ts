import { rpcUrl } from '../../config/config';
import fetch from 'node-fetch';
import NodeCache from 'node-cache';

// Create a cache with a 15-minute TTL since wallet token counts may change more frequently
const walletCache = new NodeCache({ stdTTL: 900, checkperiod: 60 });

// Token threshold for identifying exchange wallets
const EXCHANGE_TOKEN_THRESHOLD = 30;

// Standard Solana token program ID
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

export async function isExchangeWallet(ownerAccountAddress: string): Promise<boolean> {
  // Check cache first
  const cacheKey = `exchange_${ownerAccountAddress}`;
  const cachedResult = walletCache.get(cacheKey);
  
  if (cachedResult !== undefined) {
    return cachedResult as boolean;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          ownerAccountAddress,
          {
            programId: TOKEN_PROGRAM_ID,
          },
          {
            encoding: 'jsonParsed',
          },
        ],
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Check for errors in the response
    if (data.error) {
      console.error('RPC error:', data.error);
      return false;
    }
    
    // Handle missing or malformed data
    if (!data.result || !data.result.value) {
      return false;
    }
    
    const isExchange = data.result.value.length >= EXCHANGE_TOKEN_THRESHOLD;
    
    // Cache the result
    walletCache.set(cacheKey, isExchange);
    
    return isExchange;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Request timed out for wallet check:', ownerAccountAddress);
    } else {
      console.error('Error checking exchange wallet:', error);
    }
    return false;
  }
}