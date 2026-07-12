import fetch from 'node-fetch';
import 'dotenv/config';

const apiKey = process.env.AI_API_KEY || 'AQ.Ab8RN6KSYdYIPJ_KlZ1Fz7LMbkflp-Tj4bNPsjdwMvavSxSKnQ';

async function main() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  console.log('Fetching available models from Gemini API...');
  try {
    const res = await fetch(url);
    console.log(`Status: ${res.status} ${res.statusText}`);
    const data = await res.json();
    if (data.models) {
      console.log('Available models:');
      for (const m of data.models) {
        console.log(`  - ${m.name} (${m.displayName})`);
      }
    } else {
      console.log('No models returned. Error response:', JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('Request failed:', err.message);
  }
}

main();
