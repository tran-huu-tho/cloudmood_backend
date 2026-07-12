import fetch from 'node-fetch';
import 'dotenv/config';

const apiKey = process.env.AI_API_KEY || 'AQ.Ab8RN6KSYdYIPJ_KlZ1Fz7LMbkflp-Tj4bNPsjdwMvavSxSKnQ';

async function main() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ role: 'user', parts: [{ text: 'hello' }] }]
  };

  console.log('Sending direct request to Gemini API...');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    console.log(`Status: ${res.status} ${res.statusText}`);
    console.log('Headers:');
    for (const [key, value] of res.headers.entries()) {
      console.log(`  ${key}: ${value}`);
    }

    const data = await res.json();
    console.log('\nResponse Body:');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Request failed:', err.message);
  }
}

main();
