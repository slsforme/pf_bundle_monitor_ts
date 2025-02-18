import { ProgramErrorStack } from "@project-serum/anchor";
import { decodeTransact } from "./decodeTransaction";

export async function tOutPut(data){
    if (!data || !data.transaction || !data.transaction.transaction) {
        return;
    }

    const dataTx = data.transaction.transaction;
     const signature = decodeTransact(dataTx.signature);
     const message = dataTx.transaction?.message
     const header = message.header;
     const accountKeys = message.accountKeys.map((t)=>{
         return decodeTransact(t)
     })
     const recentBlockhash = decodeTransact(message.recentBlockhash);
     const instructions = message.instructions
     const meta = dataTx?.meta
    return {
        dataTx,
        signature,
        message:{
            header,
            accountKeys,
            recentBlockhash,
            instructions
         },
        meta,
    }

}