export async function tOutPut(data) {
    if (!data || !data.transaction || !data.transaction.transaction) {
        return;
    }

    const dataTx = data.transaction.transaction;
    const preBalances = dataTx.meta.preBalances;
    const postBalances = dataTx.meta.postBalances;

    return {
        preBalances,
        postBalances
    };
}