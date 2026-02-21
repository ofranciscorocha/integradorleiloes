export const parseVehicleDetails = (text, specs = {}) => {
    if (!text && Object.keys(specs).length === 0) return {};
    const upper = (text || '').toUpperCase();
    const specsStr = Object.values(specs).join(' ').toUpperCase();
    const fullSearch = (upper + ' ' + specsStr).trim();

    const result = {
        ano: null,
        cor: '',
        combustivel: '',
        cambio: '',
        km: null,
        condicao: '',
        chassi: '',
        blindado: false,
        chave: null, // true, false or null
        localColisao: '',
        origem: '',
        comitente: '',
        debitoResponsabilidade: '',
        remarcado: false
    };

    // YEAR
    // Matches 19xx/19xx, 20xx/20xx, 19xx, 20xx
    const anoMatch = fullSearch.match(/\b((?:19|20)\d{2})(?:\/((?:19|20)\d{2}))?\b/);
    if (anoMatch) {
        result.ano = anoMatch[2] ? `${anoMatch[1]}/${anoMatch[2]}` : anoMatch[1];
    }

    // FUEL
    const fuelMatch = fullSearch.match(/\b(FLEX|ÁLCOOL|ALCOOL|GASOLINA|DIESEL|ELÉTRICO|ELETRICO|HÍBRIDO|HIBRIDO|GNV)\b/);
    if (fuelMatch) {
        const f = fuelMatch[0];
        if (f === 'FLEX') result.combustivel = 'Flex';
        else if (f === 'DIESEL') result.combustivel = 'Diesel';
        else if (f === 'GASOLINA') result.combustivel = 'Gasolina';
        else if (f.includes('ALCOOL') || f.includes('ÁLCOOL')) result.combustivel = 'Álcool';
        else if (f.includes('ELÉTRICO') || f.includes('ELETRICO')) result.combustivel = 'Elétrico';
        else if (f.includes('HÍBRIDO') || f.includes('HIBRIDO')) result.combustivel = 'Híbrido';
        else if (f === 'GNV') result.combustivel = 'GNV';
    }

    // TRANSMISSION
    const cambioMatch = fullSearch.match(/\b(AUTOMÁTICO|AUTOMATICO|MANUAL|CVT|TIPTRONIC|BORBOLETA)\b/);
    if (cambioMatch) {
        if (cambioMatch[0] === 'MANUAL') result.cambio = 'Manual';
        else result.cambio = 'Automático';
    }

    // COLOR
    const colors = ['BRANCA', 'BRANCO', 'PRETA', 'PRETO', 'PRATA', 'CINZA', 'VERMELHO', 'VERMELHA', 'AZUL', 'VERDE', 'AMARELO', 'AMARELA', 'DOURADO', 'BEGE', 'MARROM', 'VINHO', 'LARANJA'];
    const foundColor = colors.find(c => fullSearch.includes(c));
    if (foundColor) {
        result.cor = foundColor;
    }

    // KM
    const kmMatch = fullSearch.match(/(?:KM|ODÔMETRO|ODOMETRO)[:\s]*([\d\.,]+)/);
    if (kmMatch) {
        result.km = parseInt(kmMatch[1].replace(/[\.,]/g, ''));
    }

    // KEY (CHAVE)
    if (fullSearch.includes('COM CHAVE') || fullSearch.includes('CHAVE: SIM') || fullSearch.includes('CHAVE: S')) {
        result.chave = true;
    } else if (fullSearch.includes('SEM CHAVE') || fullSearch.includes('CHAVE: NÃO') || fullSearch.includes('CHAVE: NAO') || fullSearch.includes('CHAVE: N')) {
        result.chave = false;
    }

    // CONDITION
    if (fullSearch.includes('SUCATA')) result.condicao = 'Sucata';
    else if (fullSearch.includes('APREENSÃO') || fullSearch.includes('APREENSAO')) result.condicao = 'Apreensão';
    else if (fullSearch.includes('FINANCIAMENTO') || fullSearch.includes('BANCO')) result.condicao = 'Financiamento';
    else if (fullSearch.includes('RECUPERADO') || fullSearch.includes('MEDIA MONTA') || fullSearch.includes('MÉDIA MONTA')) result.condicao = 'Média Monta';
    else if (fullSearch.includes('PEQUENA MONTA')) result.condicao = 'Pequena Monta';
    else if (fullSearch.includes('GRANDE MONTA')) result.condicao = 'Grande Monta';
    else if (fullSearch.includes('SINISTRO') || fullSearch.includes('SINISTRADO')) result.condicao = 'Sinistrado';
    else if (fullSearch.includes('FROTA')) result.condicao = 'Frota';
    else if (fullSearch.includes('CONSERVAD') || fullSearch.includes('OPERACIONAL')) result.condicao = 'Conservado';

    // BLINDADO
    if (fullSearch.includes('BLINDADO') || fullSearch.includes('BLINDAGEM')) {
        result.blindado = true;
    }

    // ROBO ELITE: NEW DEEP FIELDS

    // 1. Collision Spot
    if (fullSearch.includes('FRONTAL')) result.localColisao = 'Frontal';
    else if (fullSearch.includes('TRASEIRA')) result.localColisao = 'Traseira';
    else if (fullSearch.includes('LATERAL')) result.localColisao = 'Lateral';
    else if (fullSearch.includes('TETO')) result.localColisao = 'Teto';
    else if (fullSearch.includes('ASSOALHO')) result.localColisao = 'Assoalho';

    // 2. Origin (Occurrence)
    if (fullSearch.match(/\b(ROUBO|FURTO)\b/)) result.origem = 'Roubo/Furto';
    else if (fullSearch.match(/\b(ENCHENTE|ALAGAMENTO|AGUA)\b/)) result.origem = 'Enchente/Alagamento';
    else if (fullSearch.match(/\b(SINISTRO|MEDIA MONTA|PEQUENA MONTA)\b/)) result.origem = 'Sinistro';
    else if (fullSearch.match(/\b(FINANCIAMENTO|LEASING|RECUPERADO)\b/)) result.origem = 'Financeiro';

    // 3. Debt Responsibility
    if (fullSearch.includes('DÉBITOS POR CONTA DO ARREMATANTE') || fullSearch.includes('DEBITOS ARREMATANTE')) {
        result.debitoResponsabilidade = 'Arrematante';
    } else if (fullSearch.includes('IPVA PAGO') || fullSearch.includes('SEM DÉBITOS')) {
        result.debitoResponsabilidade = 'Comitente';
    }

    // 4. Remarcado
    if (fullSearch.includes('REM') || fullSearch.includes('REMARCADO')) {
        result.remarcado = true;
    }

    // 5. Comitente (Brand extraction from specs if available)
    if (specs) {
        result.comitente = specs['Comitente'] || specs['Vendedor'] || specs['Banco'] || specs['Seguradora'] || '';
    }

    return result;
};

/**
 * Cleans a vehicle title to extract just Brand and Model without auction junk
 */
export const cleanTitle = (text) => {
    if (!text) return '';
    let t = text.toUpperCase();

    // 1. Remove common auction junk (Year in title, "OFC", "LOTE", etc)
    t = t.replace(/\b(19|20)\d{2}\/\b(19|20)\d{2}/g, ''); // 2020/2021
    t = t.replace(/\b(19|20)\d{2}\b/g, ''); // 2021
    t = t.replace(/\b(OFC|CNV|LOTE|PREVISAO|LEILAO|SUCATA|IMP\/|NAC\/|RECUPERADO|SINISTRO|MED|PEQ|GRAND)\b/g, '');
    t = t.replace(/[\(\)\[\]\-\/]/g, ' '); // Punctuation to space
    t = t.replace(/\s+/g, ' ').trim(); // Deduplicate spaces

    // 2. Extract Brand/Model (Simplified: First 2-4 words usually)
    const words = t.split(' ');
    if (words.length > 4) return words.slice(0, 4).join(' ');
    return t;
};

/**
 * Robustly classifies a vehicle based on its title/description and brand
 * @param {string} text - The vehicle title or full description
 * @returns {string} - 'carro', 'moto', 'pesado' or 'outro'
 */
export const classifyVehicle = (text) => {
    if (!text) return 'outro';
    const upper = text.toUpperCase();

    // 1. STRONGEST INDICATORS (Specific keywords)
    if (upper.match(/\b(CAMINHÃO|CAMINHAO|ÔNIBUS|ONIBUS|TRATOR|CAVALO MECANICO|CARRETA|REBOQUE|SEMI-REBOQUE|BITREM|CAÇAMBA|CACAMBA)\b/)) return 'pesado';
    if (upper.match(/\b(MOTO|MOTOCICLETA|QUADRICICLO|SCOOTER|BIZ|MOTONETA|CICLOMOTOR|MOPED|TRICICLO)\b/)) return 'moto';

    // 2. EXCLUSIVE BRANDS
    // Pure Moto Brands
    if (upper.match(/\b(YAMAHA|KAWASAKI|KTM|TRIUMPH|HARLEY-DAVIDSON|HARLEY DAVIDSON|DAFRA|HAOJUE|ROYAL ENFIELD|DUCATI|BAJAJ|ZONTES|MOTTU|AVELLOZ|SHINERAY|KASINSKI|KYMCO|BUELL|MV AGUSTA|BENELLI|HUSQVARNA|PIAGGIO|VESPA|APRILIA|BETA)\b/)) return 'moto';
    // Pure Heavy Brands
    if (upper.match(/\b(SCANIA|IVECO|DAF|AGRALE|MARCOPOLO|COMIL|MASCARELLO|RANDON|FACCHINI|GUERRA|NOMA|LIBRELATO|RODOFORT|CATERPILLAR|KOMATSU|JCB|CASE |NEWHOLAND|JOHN DEERE|MASSEY FERGUSON|VALTRA)\b/)) return 'pesado';
    // Pure Car Brands
    if (upper.match(/\b(FIAT|CHEVROLET|HYUNDAI|TOYOTA|JEEP|RENAULT|NISSAN|BYD|CHERY|CAOA|CITROEN|CITROËN|PEUGEOT|GWM|RAM|AUDI|LAND ROVER|PORSCHE|JAC|LEXUS|SUBARU|ALFA ROMEO|ASTON MARTIN|BENTLEY|FERRARI|LAMBORGHINI|MASERATI|MCLAREN|MINI |ROLLS ROYCE|SMART|TESLA)\b/)) return 'carro';

    // 3. AMBIGUOUS BRANDS (Check context)

    // HONDA (Cars and Motos)
    if (upper.includes('HONDA')) {
        if (upper.match(/\b(CG|BIZ|CB|CBR|XRE|NC750|PCX|ADV|POP|HORNET|AFRICA TWIN|SH150|SH300|FORZA|ELITE|LEAD|CRF|X-ADV|TRANSALP|SHADOW|VT600|GOLDWING|SCOOTY)\b/)) return 'moto';
        if (upper.match(/\b(CIVIC|CITY|HRV|HR-V|FIT|WRV|WR-V|CRV|CR-V|ACCORD|ODYSSEY|PILOT|RIDGELINE|PRELUDE|INSIGHT|LEGEND)\b/)) return 'carro';
        return 'carro';
    }

    // VOLKSWAGEN (Cars and Trucks)
    if (upper.includes('VOLKSWAGEN') || upper.includes('VW')) {
        if (upper.match(/\b(DELIVERY|METEOR|CONSTELLATION|MAN|WORKER|EXPRESS|E-DELIVERY)\b/)) return 'pesado';
        return 'carro';
    }

    // MERCEDES (Cars and Trucks)
    if (upper.includes('MERCEDES')) {
        if (upper.match(/\b(ACCELO|ATEGO|ACTROS|AXOR|SPRINTER|L1620|L-1620|LS|LA|L-1113|L-1313|L-1513|LK|LS|SK|AROCS)\b/)) return 'pesado';
        return 'carro';
    }

    // VOLVO (Cars and Trucks)
    if (upper.includes('VOLVO')) {
        if (upper.match(/\b(FH|VM|FMX|FM|EDC|N10|N12|NH|NL|B10|B12|B58|B7R|B9R|B11|B13|GLOBETROTTER)\b/)) return 'pesado';
        return 'carro';
    }

    // BMW (Cars and Motos)
    if (upper.includes('BMW')) {
        if (upper.match(/\b(R1200|R1250|F800|F850|G310|S1000RR|S1000|K1600|G650|F700|F750|C400|HP2|HP4|R1100|R1150|R1200GS|R1250GS)\b/)) return 'moto';
        return 'carro';
    }

    // SUZUKI (Cars and Motos)
    if (upper.includes('SUZUKI')) {
        if (upper.match(/\b(JIMNY|VITARA|SX4|S-CROSS|GRAND VITARA|SAMURAI|SWIFT|SIDEKICK)\b/)) return 'carro';
        return 'moto';
    }

    // 4. FALLBACK LOGIC
    // If it has doors, sedan, hatch, it's likely a car
    if (upper.match(/\b(SEDAN|HATCH|COUPE|CONVERSIVEL|PICKUP|SUV|AUTOMOVEL|ESPORTIVO|STATION WAGON|PERUA|MINIVAN|ESTRADA|CABINE DUPLA|CABINE SIMPLES)\b/)) return 'carro';

    return 'carro'; // Default fallback
};
