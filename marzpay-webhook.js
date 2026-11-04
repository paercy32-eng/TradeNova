// api/marzpay-webhook.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // MarzPay sends POST requests to webhooks
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;
    console.log('Webhook received:', JSON.stringify(payload, null, 2));

    // 1. Extract the reference and status from the payload
    // MarzPay sends the reference inside transaction.reference
    const reference = payload.transaction?.reference;
    const status = payload.transaction?.status; // e.g., 'completed' or 'failed'
    const eventType = payload.event_type; // e.g., 'collection.completed'

    if (!reference) {
      return res.status(400).json({ error: 'No reference found in webhook payload' });
    }

    // 2. Connect to Supabase with the Service Role Key
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 3. Find the pending deposit using the reference (stored as txid)
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

    // 4. Determine if it's a success or failure
    const isSuccess = (status === 'completed' || eventType === 'collection.completed');

    if (isSuccess) {
      // --- SUCCESS: Update Deposit Status ---
      await supabase
        .from('pending_deposits')
        .update({ status: 'verified' })
        .eq('id', deposit.id);

      // --- SUCCESS: Update User Balance and Total Deposited ---
      const { data: profile } = await supabase
        .from('profiles')
        .select('deposit_amount, total_deposited')
        .eq('id', deposit.user_id)
        .single();

      const newDepositAmount = Number(profile.deposit_amount || 0) + Number(deposit.amount_usd);
      const newTotalDeposited = Number(profile.total_deposited || 0) + Number(deposit.amount_usd);

      await supabase
        .from('profiles')
        .update({
          deposit_amount: newDepositAmount,
          total_deposited: newTotalDeposited
        })
        .eq('id', deposit.user_id);

      console.log(`Successfully credited $${deposit.amount_usd} to user ${deposit.user_id}`);

    } else {
      // --- FAILURE: Mark as Failed ---
      await supabase
        .from('pending_deposits')
        .update({ status: 'failed' })
        .eq('id', deposit.id);
        
      console.log(`Marked deposit ${reference} as failed.`);
    }

    // 5. Respond to MarzPay to acknowledge receipt
    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
