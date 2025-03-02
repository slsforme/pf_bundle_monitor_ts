import { decodeTransact } from "./decodeTransaction";

export async function tOutPut(tx){
    const message = tx.transaction?.message;
    const meta = tx.meta;

    const signature = decodeTransact(tx.signature);
    const preBalance: number = parseInt(meta.preBalances[0]);
    const postBalance: number = parseInt(meta.postBalances[0]);
    const accountKeys: Array<string> = message.accountKeys.map((t)=>{
         return decodeTransact(t)
    });
    return {
        accountKeys,
        preBalance,
        postBalance,
        signature
    };
}