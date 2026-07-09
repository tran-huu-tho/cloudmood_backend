import 'dotenv/config';

async function test() {
  const apiKey = process.env.RAPIDAPI_KEY;
  const host = 'travel-advisor.p.rapidapi.com';
  
  // Let's test restaurants/list-by-latlng
  const url = new URL(`https://${host}/restaurants/list-by-latlng`);
  url.searchParams.set('latitude', '10.0338');
  url.searchParams.set('longitude', '105.7876');
  url.searchParams.set('limit', '5');
  url.searchParams.set('lang', 'vi_VN');

  console.log('Fetching:', url.toString());

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': host
    }
  });

  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Result:', JSON.stringify(data, null, 2).slice(0, 1500));
}

test().catch(console.error);
