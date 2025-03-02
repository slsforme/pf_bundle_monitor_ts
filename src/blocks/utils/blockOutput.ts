
export async function bOutput(data){
    if (!data || !data.block) {
        return;
    }

    const block = data?.block;
    const txs: Array<any> = block?.transactions;

    return {
        txs
    };
}