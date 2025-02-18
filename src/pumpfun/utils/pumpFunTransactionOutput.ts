export function pumpFunTransactionOutput(data){
    if (!data || !data.transaction || !data.transaction.transaction) {
        return;
    }
    const dataTx = data.transaction.transaction;
    const meta = dataTx?.meta
    return {
        meta
    }

}