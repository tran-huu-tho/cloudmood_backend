import 'dotenv/config';
import { fetchWithKeyRotation } from './api-key-manager.mjs';

async function test() {
  const host = 'travel-advisor.p.rapidapi.com';
  
  const url = new URL(`https://${host}/locations/search`);
  url.searchParams.set('query', 'Sense City');
  url.searchParams.set('location_id', '303942');
  url.searchParams.set('limit', '5');
  url.searchParams.set('lang', 'vi_VN');

  console.log('Fetching:', url.toString());

  const res = await fetchWithKeyRotation(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-host': host
    }
  });

  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Result:', JSON.stringify(data.data.map(item => ({
    name: item.result_object?.name || item.name,
    result_type: item.result_type,
    location_id: item.result_object?.location_id || item.location_id,
    address: item.result_object?.address || item.address
  })), null, 2));
}

test().catch(console.error);
