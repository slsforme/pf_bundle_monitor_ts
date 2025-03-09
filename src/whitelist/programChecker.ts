import { rpcUrl } from '../../config/config';
import fetch from 'node-fetch';
import NodeCache from 'node-cache';

// Create a cache with a 1-hour TTL (time to live)
const programCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

// Set for faster lookups
const PROGRAMS = new Set([
    "T1pyyaTNZsKv2WcRAB8oVnk93mLJw2XzjtVYqCsaHqt"
]);

export async function isWhitelistedProgram(ownerAccountAddress: string): Promise<boolean> {
  // Check cache first
  const cacheKey = `program_${ownerAccountAddress}`;
  const cachedResult = programCache.get(cacheKey);
  
  if (cachedResult !== undefined) {
    return cachedResult as boolean;
  }
  
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccountInfo',
        params: [
          ownerAccountAddress,  
          {
            encoding: 'base58',
          },
        ],
      }),
      timeout: 5000, // Add timeout to prevent hanging requests
    });

    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Check for errors in the response
    if (data.error) {
      console.error('RPC error:', data.error);
      return false;
    }
    
    // Check if result is null or empty
    if (!data.result || !data.result.value || !data.result.value.owner) {
      return false;
    }
    
    const isWhitelisted = PROGRAMS.has(data.result.value.owner);
    
    // Cache the result
    programCache.set(cacheKey, isWhitelisted);
    
    return isWhitelisted;
  } catch (error) {
    console.error('Error checking whitelisted program:', error);
    return false;
  }
}