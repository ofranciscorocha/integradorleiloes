import axios from 'axios';
import * as cheerio from 'cheerio';

async function testPlaca() {
    const placa = 'GAC7C32';
    const url = `https://www.tabelafipebrasil.com/placa/${placa}`;

    console.log(`Checking URL: ${url}`);

    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': 'https://placafipe.com/',
                'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"'
            },
            validateStatus: false
        });

        console.log(`Status: ${res.status}`);
        const $ = cheerio.load(res.data);

        console.log('Title:', $('h1').text());

        const data = {};
        $('.fipeTable tr').each((i, el) => {
            const label = $(el).find('td').first().text().replace(':', '').trim();
            const value = $(el).find('td').last().text().trim();
            data[label] = value;
        });

        console.log('Scraped Data:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error details:', e.message);
        if (e.response) {
            console.error('Status:', e.response.status);
            console.error('Headers:', JSON.stringify(e.response.headers, null, 2));
        }
    }
}

testPlaca();
