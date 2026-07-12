import fetch from 'node-fetch';

async function main() {
  console.log('Querying backend: "cái siêu thị lotte cần thơ nằm ở địa chỉ nào vậy"...');
  try {
    const res = await fetch('http://localhost:3000/admin/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'cái siêu thị lotte cần thơ nằm ở địa chỉ nào vậy',
        history: []
      })
    });

    if (!res.ok) {
      console.error(`HTTP Error: ${res.status}`);
      return;
    }

    const data = await res.json();
    console.log('\nBackend response JSON:');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Fetch failed:', err.message);
  }
}

main();
