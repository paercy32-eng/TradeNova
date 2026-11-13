// api/marzpay-webhook.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;
    console.log('Webhook received:', JSON.stringify(payload, null, 2));

    // MarzPay sends the reference inside transaction.reference
    const reference = payload.transaction?.reference;
    const status = payload.transaction?.status; 
    const eventType = payload.event_type; 

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

    // If it's already processed, do nothing (prevents duplicate webhooks)
    if (deposit.status !== 'pending') {
      return res.status(200).json({ message: 'Deposit already processed' });
    }

    const isSuccess = (status === 'completed' || eventType === 'collection.completed');

    if (isSuccess) {
      const depositAmount = Number(deposit.amount_usd || 0);

      // 2. Mark Deposit as 'completed'
      await supabase
        .from('pending_deposits')
        .update({ status: 'completed' })
        .eq('id', deposit.id);

      // 3. Fetch the user's CURRENT balances
      const { data: profile } = await supabase
        .from('profiles')
        .select('balance_usd, deposit_amount, total_deposited')
        .eq('id', deposit.user_id)
        .single();

      // 4. Calculate new balances
      const newBalance = Number(profile.balance_usd || 0) + depositAmount;
      const newDepositAmount = Number(profile.deposit_amount || 0) + depositAmount;
      const newTotalDeposited = Number(profile.total_deposited || 0) + depositAmount;

      // 5. Update the user's profile
      await supabase
        .from('profiles')
        .update({
          balance_usd: newBalance,
          deposit_amount: newDepositAmount,
          total_deposited: newTotalDeposited
        })
        .eq('id', deposit.user_id);

      // 6. Log into the transactions table
      await supabase
        .from('transactions')
        .insert({
          user_id: deposit.user_id,
          type: 'deposit',
          amount_usd: depositAmount,
          status: 'completed',
          crypto_tx_hash: reference // Storing the MarzPay reference here for tracking
        });

      console.log(`Successfully credited ${depositAmount} UGX to user ${deposit.user_id}`);

    } else {
      // --- FAILURE: Mark as Failed ---
      await supabase
        .from('pending_deposits')
        .update({ status: 'failed' })
        .eq('id', deposit.id);
        
      console.log(`Marked deposit ${reference} as failed.`);
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
