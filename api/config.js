// api/config.js
//
// Vercel serverless function.
// Reads the Supabase URL and anon key from Vercel environment variables
// and returns them as JSON to the browser.
//
// Only the *public* anon key leaves this function. The service_role key
// must never be referenced here or anywhere else in frontend code.

export default function handler(req, res) {
  // Allow the browser to call this endpoint from your site.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Browsers send a preflight OPTIONS request before the real GET.
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return res.status(500).json({
      error: 'Supabase credentials are not configured on the server.'
    });
  }

  // Cache for 1 hour — these values rarely change.
  res.setHeader('Cache-Control', 'public, max-age=3600');

  return res.status(200).json({
    supabaseUrl: url,
    supabaseAnonKey: anonKey
  });
}
