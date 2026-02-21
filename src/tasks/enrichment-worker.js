import connectDatabase from '../database/db.js';
import { enrichmentService } from '../utils/enrichment.js';

/**
 * Enrichment Worker
 * Processes vehicles marked with 'needsEnrichment' in batches.
 */
async function runWorker() {
    console.log('👷 [Worker] Starting Enrichment Worker...');
    const db = await connectDatabase();

    try {
        const pending = await db.list({
            filtro: { needsEnrichment: true }
        });

        if (pending.length === 0) {
            console.log('👷 [Worker] No pending vehicles found.');
            return;
        }

        console.log(`👷 [Worker] Found ${pending.length} pending vehicles. Starting batch processing...`);

        let success = 0;
        let failed = 0;

        for (const vehicle of pending) {
            try {
                console.log(`👷 [Worker] Processing: ${vehicle.veiculo} (${vehicle.site})`);
                const enriched = await enrichmentService.enrichVehicle({ ...vehicle });

                // Clear the flag and update data
                delete enriched.needsEnrichment;

                await db.update({
                    registro: vehicle.registro,
                    site: vehicle.site,
                    set: { ...enriched, needsEnrichment: false }
                });

                success++;
                // Small delay to avoid rate limiting some APIs if necessary
                await new Promise(r => setTimeout(r, 500));
            } catch (e) {
                console.error(`👷 [Worker] Failed to enrich ${vehicle.registro}:`, e.message);
                failed++;
            }
        }

        console.log(`👷 [Worker] Finished! Success: ${success}, Failed: ${failed}`);
    } catch (e) {
        console.error('👷 [Worker] Critical error:', e.message);
    } finally {
        await db.close();
    }
}

// Run if called directly
if (import.meta.url.endsWith('enrichment-worker.js')) {
    runWorker();
}

export default runWorker;
