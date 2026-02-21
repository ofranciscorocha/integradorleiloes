
/**
 * Standardizes multiple auctioneer status terms into a set of unified statuses:
 * - Disponível: Item is up for auction or in future auction.
 * - Vendido: Item has been sold.
 * - Condicional: Item waiting for owner approval.
 * - Encerrado: Auction finished, item not sold or state unknown.
 */
export const standardizeStatus = (text) => {
    if (!text) return 'Disponível';

    const t = text.toUpperCase();

    if (t.includes('VENDIDO') || t.includes('ARREMATADO')) return 'Vendido';
    if (t.includes('CONDICIONAL')) return 'Condicional';
    if (t.includes('ENCERRADO') || t.includes('FINALIZADO') || t.includes('CONCLUÍDO')) return 'Encerrado';
    if (t.includes('DISPONÍVEL') || t.includes('ABERTO') || t.includes('EM ANDAMENTO')) return 'Disponível';

    return 'Disponível'; // Default
};

export const shouldCleanStatus = (status) => {
    return ['Vendido', 'Encerrado'].includes(status);
};
