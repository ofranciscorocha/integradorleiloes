import axios from 'axios';
import { http } from './http.js';

/**
 * Sistema Robo - Data Enrichment Utility
 * Fetches FIPE, Market Values and calculates ROI/Risk.
 */

const FIPE_API_BASE = 'https://parallelum.com.br/fipe/api/v1';

export const enrichmentService = {
    /**
     * Attempts to find the FIPE value for a vehicle.
     * Uses a multi-step matching strategy (Brand -> Model -> Year).
     */
    async enrichVehicle(veiculo) {
        try {
            // 1. Basic cleaning and parsing
            const normalize = (s) => s?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[-\/]/g, ' ').toUpperCase().trim() || '';
            const brand = normalize(veiculo.marca);
            const model = normalize(veiculo.modelo);
            const year = veiculo.ano;
            const tipo = veiculo.tipo || 'carro';
            const fullTitle = normalize(veiculo.veiculo);

            if (!brand || !year) return veiculo;

            const fipeData = await this.fetchFipeValue(tipo, brand, model, year, fullTitle);

            if (fipeData) {
                veiculo.valorFipe = fipeData.valor;
                veiculo.codigoFipe = fipeData.codigo;
                veiculo.nomeFipe = fipeData.nomeFipe;

                // 2. Estimate Market Value
                veiculo.valorMercado = fipeData.valor * 1.05;

                // 3. Calculate Potential Profit (ROI)
                const currentBid = parseFloat(veiculo.valor) || 0;
                if (currentBid > 0) {
                    veiculo.lucroEstimado = veiculo.valorMercado - currentBid;
                    veiculo.roiPorcentagem = (veiculo.lucroEstimado / currentBid) * 100;
                }

                veiculo.enrichedAt = new Date().toISOString();
            }

            // 4. Identifier Extraction (Plate/Chassis)
            this.extractIdentifiers(veiculo);

            // 5. Risk Flags
            this.flagRisks(veiculo);

            return veiculo;
        } catch (error) {
            console.error(`[Enrichment] Error enriching ${veiculo.veiculo}:`, error.message);
            return veiculo;
        }
    },

    async fetchFipeValue(tipo, brand, model, year, fullTitle) {
        try {
            const fipeTipo = this.mapTipo(tipo);
            const normalize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[-\/]/g, ' ').toUpperCase().trim();

            // Step A: Find Brand ID
            const brandsRes = await http.get(`${FIPE_API_BASE}/${fipeTipo}/marcas`);
            const brands = brandsRes.data;
            const foundBrand = brands.find(b => {
                const bName = normalize(b.nome);
                return brand.includes(bName) || bName.includes(brand);
            });

            if (!foundBrand) return null;

            // Step B: Find Model ID
            const modelsRes = await http.get(`${FIPE_API_BASE}/${fipeTipo}/marcas/${foundBrand.codigo}/modelos`);
            const models = modelsRes.data.modelos;

            console.log(`[Enrichment] Matching '${fullTitle}' for ${foundBrand.nome}`);

            const titleTokens = fullTitle.replace(normalize(foundBrand.nome), '').split(/\s+/).filter(t => t.length >= 2);
            const isHybrid = fullTitle.includes('HYBRID') || fullTitle.includes('HIBRIDO');

            let bestModel = null;
            let maxScore = 0;

            for (const m of models) {
                const mName = normalize(m.nome);
                const mIsHybrid = mName.includes('HYBRID') || mName.includes('HIBRIDO');

                let score = 0;

                // Hybrid mismatch penalty
                if (isHybrid && !mIsHybrid) score -= 10;
                if (!isHybrid && mIsHybrid) score -= 5;

                // Title tokens are the source of truth
                for (const token of titleTokens) {
                    if (mName.includes(token)) score += 3;
                }

                // Penalty for model name tokens NOT in title
                const mTokens = mName.split(/\s+/).filter(t => t.length >= 2);
                for (const mt of mTokens) {
                    if (!fullTitle.includes(mt)) score -= 1.5;
                }

                if (score > maxScore) {
                    maxScore = score;
                    bestModel = m;
                }
            }

            if (!bestModel || maxScore < 2) {
                console.log(`[Enrichment] No good match. Best score: ${maxScore.toFixed(1)}`);
                return null;
            }
            console.log(`[Enrichment] Match candidate: ${bestModel.nome} (Score: ${maxScore.toFixed(1)})`);

            // Step C: Find Year ID
            const yearsRes = await http.get(`${FIPE_API_BASE}/${fipeTipo}/marcas/${foundBrand.codigo}/modelos/${bestModel.codigo}/anos`);
            const years = yearsRes.data;

            const foundYear = years.find(y => normalize(y.nome).includes(year.toString()));

            if (!foundYear) {
                console.log(`[Enrichment] Year ${year} not found for ${bestModel.nome}.`);
                return null;
            }

            // Step D: Get Final Value
            const finalRes = await http.get(`${FIPE_API_BASE}/${fipeTipo}/marcas/${foundBrand.codigo}/modelos/${bestModel.codigo}/anos/${foundYear.codigo}`);
            const data = finalRes.data;

            return {
                valor: parseFloat(data.Valor.replace('R$ ', '').replace('.', '').replace(',', '.')),
                codigo: data.CodigoFipe,
                mesReferencia: data.MesReferencia,
                nomeFipe: data.Modelo
            };
        } catch (e) {
            console.error(`[FipeSearch] Fail for ${brand} ${model}:`, e.message);
            return null;
        }
    },

    mapTipo(tipo) {
        const map = {
            'carro': 'carros',
            'moto': 'motos',
            'pesado': 'caminhoes',
            'caminhao': 'caminhoes'
        };
        return map[tipo] || 'carros';
    },

    flagRisks(veiculo) {
        const text = (veiculo.veiculo + ' ' + (veiculo.obs || '')).toUpperCase();
        veiculo.tagsRisco = [];

        if (text.includes('SUCATA')) veiculo.tagsRisco.push('Sucata');
        if (text.includes('ENCHENTE') || text.includes('ALAGADO')) veiculo.tagsRisco.push('Alagamento');
        if (text.includes('MÉDIA MONTA') || text.includes('MEDIA MONTA')) veiculo.tagsRisco.push('Média Monta');
        if (text.includes('PEQUENA MONTA')) veiculo.tagsRisco.push('Pequena Monta');
        if (text.includes('GRANDE MONTA')) veiculo.tagsRisco.push('Grande Monta');
        if (text.includes('SINISTRO') || text.includes('SINISTRADO')) veiculo.tagsRisco.push('Sinistrado');
        if (text.includes('REMONTADO')) veiculo.tagsRisco.push('Remontado');

        // Positive flags
        if (text.includes('INSTALADO') && text.includes('KIT GNV')) veiculo.tagsPositivas = ['Possui GNV'];
    },

    extractIdentifiers(veiculo) {
        const text = (veiculo.veiculo + ' ' + (veiculo.obs || '') + ' ' + (veiculo.descricao || '')).toUpperCase();

        // 1. Plate Extraction (Traditional AAA-0000 or Mercosul AAA0A00)
        const plateRegex = /([A-Z]{3}-?[0-9][A-Z0-9][0-9]{2})/g;
        const plates = text.match(plateRegex);
        if (plates && plates.length > 0) {
            veiculo.placa = plates[0].replace('-', '');
        }

        // 2. Chassis Extraction (Partial - Usually last 6-8 digits in auction descriptions)
        // Look for common patterns like "CHASSI: XXXXXX" or "CH: XXXXXX"
        const chassisRegex = /(?:CHASSI|CHASSI:|CH:|CH)\s*([A-Z0-9]{6,17})/i;
        const chassisMatch = text.match(chassisRegex);
        if (chassisMatch) {
            veiculo.chassiParcial = chassisMatch[1];
        }

        // 3. Deduplication Key (If we have plate, use it. Otherwise use registry+site)
        veiculo.uuid = veiculo.placa || `${veiculo.site}_${veiculo.registro}`;
    }
};
