import fs from 'fs';

const html = fs.readFileSync('sato_home_dump.html', 'utf8');
const match = html.match(/data-page="([^"]+)"/);

if (match) {
    const json = match[1].replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#039;/g, "'");
    const data = JSON.parse(json);
    fs.writeFileSync('sato_home_data.json', JSON.stringify(data, null, 2));
    console.log('Data saved to sato_home_data.json');

    // Check for interesting keys
    console.log('Keys in props:', Object.keys(data.props));
    if (data.props.proximosLeiloes) console.log('Proximos Leiloes found:', data.props.proximosLeiloes.length);
} else {
    console.log('data-page not found');
}
