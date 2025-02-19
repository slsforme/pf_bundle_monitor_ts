import { decodeTransact } from "./decodeTransaction";

export async function tOutPut(data){
    if (!data || !data.transaction || !data.transaction.transaction) {
        return;
    }

    const dataTx = data.transaction.transaction;
    const message = dataTx.transaction?.message;
    const accountKeys = message.accountKeys.map((t)=>{
         return decodeTransact(t)
    });
    const meta = dataTx?.meta
    return {
        dataTx,
        meta,
        message:{ accountKeys },
    };
}