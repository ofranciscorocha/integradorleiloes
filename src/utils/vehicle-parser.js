
export const parseVehicleDetails = (text) => {
    if (!text) return {};
    const upper = text.toUpperCase();

    const result = {
        ano: null,
        cor: '',
        combustivel: '',
        cambio: '',
        km: null,
        condicao: '',
        chassi: '',
        blindado: false
    };

    // YEAR
    // Matches 19xx/19xx, 20xx/20xx, 19xx, 20xx
    const anoMatch = text.match(/\b((?:19|20)\d{2})(?:\/((?:19|20)\d{2}))?\b/);
    if (anoMatch) {
        result.ano = parseInt(anoMatch[2] || anoMatch[1]);
    }

    // FUEL
    if (upper.match(/\b(FLEX|ÁLCOOL|ALCOOL|GASOLINA|DIESEL|ELÉTRICO|HÍBRIDO|HIBRIDO|GNV)\b/)) {
        if (upper.includes('FLEX')) result.combustivel = 'Flex';
        else if (upper.includes('DIESEL')) result.combustivel = 'Diesel';
        else if (upper.includes('GASOLINA')) result.combustivel = 'Gasolina';
        else if (upper.includes('ALCOOL') || upper.includes('ÁLCOOL')) result.combustivel = 'Álcool';
        else if (upper.includes('ELÉTRICO') || upper.includes('ELETRICO')) result.combustivel = 'Elétrico';
        else if (upper.includes('HÍBRIDO') || upper.includes('HIBRIDO')) result.combustivel = 'Híbrido';
        else if (upper.includes('GNV')) result.combustivel = 'GNV';
    }

    // TRANSMISSION
    if (upper.match(/\b(AUTOMÁTICO|AUTOMATICO|MANUAL|CVT|TIPTRONIC)\b/)) {
        if (upper.includes('MANUAL')) result.cambio = 'Manual';
        else result.cambio = 'Automático';
    }

    // COLOR
    const colors = ['BRANCA', 'BRANCO', 'PRETA', 'PRETO', 'PRATA', 'CINZA', 'VERMELHO', 'VERMELHA', 'AZUL', 'VERDE', 'AMARELO', 'AMARELA', 'DOURADO', 'BEGE', 'MARROM', 'VINHO', 'LARANJA'];
    const foundColor = colors.find(c => upper.includes(c));
    if (foundColor) {
        result.cor = foundColor.charAt(0) + foundColor.slice(1).toLowerCase(); // Capitalize
        if (result.cor.endsWith('o')) result.cor = result.cor.slice(0, -1) + 'a'; // Normalize to feminine roughly? Or just keep as is. Usually cars are "Cor Branca" but sometimes "Branco". Let's Standardize to Title Case.
        // Actually, let's keep it simple.
        result.cor = foundColor;
    }

    // KM
    const kmMatch = upper.match(/(?:KM|ODÔMETRO|ODOMETRO)[:\s]*([\d\.]+)/);
    if (kmMatch) {
        result.km = parseInt(kmMatch[1].replace(/\./g, ''));
    }

    // CONDITION
    if (upper.includes('SUCATA')) result.condicao = 'Sucata';
    else if (upper.includes('RECUPERADO') || upper.includes('MEDIA MONTA') || upper.includes('MÉDIA MONTA')) result.condicao = 'Média Monta';
    else if (upper.includes('PEQUENA MONTA')) result.condicao = 'Pequena Monta';
    else if (upper.includes('SINISTRADO')) result.condicao = 'Sinistrado';
    else if (upper.includes('CONSERVAD') || upper.includes('OPERACIONAL')) result.condicao = 'Conservado';

    // BLINDADO
    if (upper.includes('BLINDADO') || upper.includes('BLINDAGEM')) {
        result.blindado = true;
    }

    return result;
};
