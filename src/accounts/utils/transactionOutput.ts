import { decodeTransact } from "./decodeTransaction";

export async function tOutPut(data) {
    if (!data || !data.transaction || !data.transaction.transaction) {
        return;
    }

    const dataTx = data.transaction.transaction;
    const preBalances = dataTx.meta.preBalances;
    const postBalances = dataTx.meta.postBalances;
    const signature = decodeTransact(dataTx.signature);
    const message = dataTx.transaction?.message;
    const accountKeys = message.accountKeys.map((t)=>{
         return decodeTransact(t)
    });

    return {
        preBalances,
        postBalances,
        dataTx,
        signature,
        message: { accountKeys }
    };
}