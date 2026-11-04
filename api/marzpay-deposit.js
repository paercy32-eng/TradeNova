// api/marzpay-deposit.js

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Allow your frontend to talk to this API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { phone_number, amount, country } = req.body;

    if (!phone_number || !amount || !country) {
      return res.status(400).json({ error: 'Missing required fields: phone_number, amount, country' });
    }

    // Get API keys from Vercel Environment Variables
    const publicKey = process.env.MARZPAY_PUBLIC_KEY;
    const secretKey = process.env.MARZPAY_SECRET_KEY;
    
    // If you only used one key, we handle it here
    const apiKey = process.env.MARZPAY_API_KEY;

    let authString;
    if (publicKey && secretKey) {
      // Combine and Base64 encode (Public:Secret)
      authString = Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
    } else if (apiKey) {
      authString = apiKey;
    } else {
      return res.status(500).json({ error: 'MarzPay API keys not configured.' });
    }

    // MarzPay requires a unique UUID v4 reference for every transaction
    const reference = crypto.randomUUID();

    // Map country codes to currencies
    const currencies = {
      UG: 'UGX',
      KE: 'KES',
      RW: 'RWF',
      ZM: 'ZMW',
      CM: 'XAF'
    };
    const currency = currencies[country];

    // Prepare the data for MarzPay
    const formData = new URLSearchParams();
    formData.append('phone_number', phone_number);
    formData.append('amount', amount.toString());
    formData.append('country', country);
    formData.append('currency', currency);
    formData.append('reference', reference);
    formData.append('description', 'Nova Trade Deposit');

    // Send request to MarzPay
    const marzpayResponse = await fetch('https://wallet.wearemarz.com/api/v1/collect-money', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    const marzpayData = await marzpayResponse.json();

    if (!marzpayResponse.ok) {
      return res.status(marzpayResponse.status).json({ 
        error: marzpayData.message || 'MarzPay failed to initiate collection.' 
      });
    }

    // If successful, return the data to the frontend
    return res.status(200).json({
      success: true,
      message: 'Payment prompt sent to phone.',
      data: marzpayData,
      reference: reference
    });

  } catch (error) {
    console.error('MarzPay Error:', error);
    return res.status(500).json({ error: 'Internal server error processing payment.' });
  }
}
