// api/marzpay-webhook.js
import { createClient } from '@supabase/supabase-js';

// Helper function to re-verify the transaction with MarzPay's API
async function verifyTransactionWithMarzPay(reference) {
  const apiKey = process.env.MARZPAY_API_KEY;
  const apiUser = process.env.MARZPAY_API_USER; // Ensure you have this env var

  if (!apiKey || !apiUser) {
    throw new Error('Missing MarzPay API credentials');
  }

  // Example endpoint: /api/v1/collections/{reference}
  // Check MarzPay API docs for the exact verification endpoint and response format.
  const response = await fetch(`https://wallet.wearemarz.com/api/v1/collections/${reference}`, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${apiUser}:${apiKey}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to verify transaction: ${response.status}`);
  }

  const data = await response.json();
  // Assuming the API returns a 'status' field. Adjust based on actual API response.
  return data.status; 
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;
    console.log('Webhook received:', JSON.stringify(payload, null, 2));

    const reference = payload.transaction?.reference;
    if (!reference) {
      return res.status(400).json({ error: 'No reference found in webhook payload' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Find the pending deposit using the reference
    const { data: deposit, error: fetchError } = await supabase
      .from('pending_deposits')
      .select('*')
      .eq('txid', reference)
      .single();

    if (fetchError || !deposit) {
      console.error('Deposit not found for reference:', reference);
      return res.status(404).json({ error: 'Deposit not found' });
    }

    // 2. If it's already processed, do nothing (idempotency check)
    if (deposit.status !== 'pending') {
      return res.status(200).json({ message: 'Deposit already processed' });
    }

    // 3. RE-VERIFY the transaction directly with MarzPay's API
    // This is the critical security step.
    let finalStatus;
    try {
      finalStatus = await verifyTransactionWithMarzPay(reference);
    } catch (verifyError) {
      console.error('Re-verification failed:', verifyError);
      // Important: Do not mark as failed. Keep as pending and let it retry.
      // Or, you can implement a retry mechanism. For now, return a 500 to signal
      // to MarzPay to retry the webhook.
      return res.status(500).json({ error: 'Re-verification failed. Will retry.' });
    }

    // 4. Only process if the RE-VERIFIED status is successful
    if (finalStatus === 'completed' || finalStatus === 'successful') {
      const depositAmount = Number(deposit.amount_usd || 0);

      // Use a Supabase transaction (RPC) for atomic updates, or carefully update each record
      // as shown below. For simplicity, we'll use sequential updates, but be aware of race conditions.
      
      // Mark Deposit as 'completed'
      await supabase
        .from('pending_deposits')
        .update({ status: 'completed' })
        .eq('id', deposit.id);

      // Fetch and update user's profile (consider using an RPC function for atomicity)
      const { data: profile } = await supabase
        .from('profiles')
        .select('balance_usd, deposit_amount, total_deposited')
        .eq('id', deposit.user_id)
        .single();

      const newBalance = Number(profile.balance_usd || 0) + depositAmount;
      const newDepositAmount = Number(profile.deposit_amount || 0) + depositAmount;
      const newTotalDeposited = Number(profile.total_deposited || 0) + depositAmount;

      await supabase
        .from('profiles')
        .update({
          balance_usd: newBalance,
          deposit_amount: newDepositAmount,
          total_deposited: newTotalDeposited
        })
        .eq('id', deposit.user_id);

      // Log the transaction
      await supabase
        .from('transactions')
        .insert({
          user_id: deposit.user_id,
          type: 'deposit',
          amount_usd: depositAmount,
          status: 'completed',
          crypto_tx_hash: reference
        });

      console.log(`Successfully credited ${depositAmount} UGX to user ${deposit.user_id}`);

    } else {
      // Mark as Failed only if the RE-VERIFIED status is a definitive failure
      await supabase
        .from('pending_deposits')
        .update({ status: 'failed' })
        .eq('id', deposit.id);
        
      console.log(`Marked deposit ${reference} as failed (re-verified status: ${finalStatus}).`);
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
