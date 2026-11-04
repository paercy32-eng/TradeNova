// api/marzpay-deposit.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let { phone_number, amount, country } = req.body;

    if (!phone_number || !amount || !country) {
      return res.status(400).json({ error: 'Missing required fields: phone_number, amount, country' });
    }

    // Clean phone number
    let rawPhone = phone_number.replace(/[^0-9]/g, '');
    if (rawPhone.startsWith('0')) {
      rawPhone = rawPhone.substring(1);
    }
    const countryCodes = { UG: '256', KE: '254', RW: '250', ZM: '260', CM: '237' };
    const expectedCode = countryCodes[country] || '256';
    if (!rawPhone.startsWith(expectedCode)) {
      rawPhone = expectedCode + rawPhone;
    }
    const finalPhone = '+' + rawPhone;

    // Auth
    const apiKey = process.env.MARZPAY_API_KEY;
    const secretKey = process.env.MARZPAY_SECRET_KEY;
    if (!apiKey || !secretKey) {
      return res.status(500).json({ error: 'MarzPay API keys missing.' });
    }
    const authString = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');
    const reference = crypto.randomUUID();

    const currencies = { UG: 'UGX', KE: 'KES', RW: 'RWF', ZM: 'ZMW', CM: 'XAF' };
    const currency = currencies[country];

    // Build form data with the callback_url
    const formData = new URLSearchParams();
    formData.append('phone_number', finalPhone);
    formData.append('amount', amount.toString());
    formData.append('country', country);
    formData.append('currency', currency);
    formData.append('reference', reference);
    formData.append('description', 'Nova Trade Deposit');
    
    // Tell MarzPay where to send the result
    formData.append('callback_url', 'https://vortexgain.com/api/marzpay-webhook');

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
      console.error('MarzPay Error Response:', marzpayData);
      return res.status(marzpayResponse.status).json({ 
        error: marzpayData.message || 'MarzPay failed to initiate collection.' 
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Payment prompt sent to phone.',
      data: marzpayData,
      reference: reference
    });

  } catch (error) {
    console.error('MarzPay Function Error:', error);
    return res.status(500).json({ error: 'Internal server error processing payment.' });
  }
}
