import { decodeTransact } from "./decodeTransaction";

export function tOutPut(data){
    const dataTx = data?data?.transaction?.transaction:null;
    const message = dataTx?.transaction?.message;
    const accountKeys = message?.accountKeys.map((key)=>{
        return decodeTransact(key)
    });
    return {
        message:{
           accountKeys
        },
    }
}