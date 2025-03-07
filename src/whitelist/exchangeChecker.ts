import { rpcUrl } from '../../config/config';
import fetch from 'node-fetch';

export async function isExchangeWallet(ownerAccountAddress: string): Promise<boolean> {
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
          programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        },
        {
          encoding: 'jsonParsed',
        },
      ],
    }),
  });

  const data = await response.json();
  if (data.result.value.length >= 30){
    return true;
  } else {
    return false;
  }
}

