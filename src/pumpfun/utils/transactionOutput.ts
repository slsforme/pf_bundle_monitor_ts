import { decodeTransact } from "./decodeTransaction";

export async function tOutPut(data){
    if (!data || !data.transaction || !data.transaction.transaction) {
        return;
    }

    const dataTx = data.transaction.transaction;
    const message = dataTx.transaction?.message;
    const meta = dataTx?.meta
    const preBalance: number = parseInt(meta.preBalances[0]);
    const postBalance: number = parseInt(meta.postBalances[0]);
    const accountKeys = message.accountKeys.map((t)=>{
         return decodeTransact(t)
    });
    return {
        dataTx,
        meta,
        postBalance,
        preBalance,
        message:{ accountKeys },
    };
}