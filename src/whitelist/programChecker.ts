import { rpcUrl } from '../../config/config';
import fetch from 'node-fetch';

const PROGRAMS: Array<string> = [
    "T1pyyaTNZsKv2WcRAB8oVnk93mLJw2XzjtVYqCsaHqt"
]

export async function isWhitelistedProgram(ownerAccountAddress: string): Promise<boolean> {
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
  });

  const data = await response.json();
  const isOwnerInPrograms = PROGRAMS.find(program => data.result.value.owner === program);
  if (isOwnerInPrograms) {
    return true;
  } else {
    return false;
  }
}
