import axios from 'axios';

async function debugVipRedirect() {
    try {
        const res = await axios.get('https://www.vipleiloes.com.br/', {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400
        });
        console.log("Status:", res.status);
        console.log("Location:", res.headers.location);
    } catch (e) {
        if (e.response && e.response.status >= 300 && e.response.status < 400) {
            console.log("Redirect Goal:", e.response.headers.location);
        } else {
            console.error("Error:", e.message);
        }
    }
}

debugVipRedirect();
