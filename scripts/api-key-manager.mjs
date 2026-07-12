import 'dotenv/config';

// Parse RAPIDAPI_KEY from .env which can be a single key or a comma-separated list of keys
const getKeys = () => {
  const keysSet = new Set();
  
  if (process.env.RAPIDAPI_KEY) {
    process.env.RAPIDAPI_KEY.split(',').forEach(k => {
      const trimmed = k.trim();
      if (trimmed) keysSet.add(trimmed);
    });
  }
  
  if (process.env.RAPIDAPI_KEYS) {
    process.env.RAPIDAPI_KEYS.split(',').forEach(k => {
      const trimmed = k.trim();
      if (trimmed) keysSet.add(trimmed);
    });
  }
  
  return Array.from(keysSet);
};

const keys = getKeys();
let currentIndex = 0;

export function getRapidApiKey() {
  if (keys.length === 0) {
    throw new Error('No RapidAPI keys configured in .env (RAPIDAPI_KEY or RAPIDAPI_KEYS)');
  }
  return keys[currentIndex];
}

export function rotateRapidApiKey() {
  if (keys.length <= 1) {
    return false; // Cannot rotate, only one key
  }
  currentIndex = (currentIndex + 1) % keys.length;
  console.log(`[Key Rotation] Rotating to key index ${currentIndex}: ${keys[currentIndex].substring(0, 8)}...`);
  return true;
}

export async function fetchWithKeyRotation(url, options = {}) {
  if (keys.length === 0) {
    throw new Error('No RapidAPI keys configured in .env (RAPIDAPI_KEY or RAPIDAPI_KEYS)');
  }

  let attempts = 0;
  const maxAttempts = keys.length;

  while (attempts < maxAttempts) {
    const currentKey = getRapidApiKey();
    
    // Ensure headers exist and set keys
    const headers = { ...options.headers };
    headers['x-rapidapi-key'] = currentKey;
    
    const requestOptions = {
      ...options,
      headers
    };

    console.log(`[Fetch] Attempting request using key index ${currentIndex} (${currentKey.substring(0, 8)}...)...`);
    try {
      const res = await fetch(url, requestOptions);
      
      // Check for rate limit or quota exceeded
      // RapidAPI typical quota exhausted status is 429 or 403
      if (res.status === 429 || res.status === 403) {
        const text = await res.clone().text();
        if (text.toLowerCase().includes('quota') || text.toLowerCase().includes('rate limit') || text.toLowerCase().includes('exceeded') || res.status === 429) {
          console.warn(`[Key Rotation] Key index ${currentIndex} got status ${res.status}: ${text.slice(0, 100)}. Rotating key...`);
          const rotated = rotateRapidApiKey();
          if (!rotated) {
            // Only 1 key available, so just return this response
            return res;
          }
          attempts++;
          continue; // Retry with new key
        }
      }
      
      return res;
    } catch (err) {
      console.error(`[Fetch] Error with key index ${currentIndex}:`, err.message);
      const rotated = rotateRapidApiKey();
      if (!rotated) {
        throw err;
      }
      attempts++;
    }
  }
  
  throw new Error('QUOTA_EXCEEDED');
}
