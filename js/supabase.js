/* ==========================================================================
   Trade Nova — Supabase client
   --------------------------------------------------------------------------
   Loads the public Supabase credentials from /api/config (a Vercel
   serverless function) and initialises the Supabase JS client.

   Everything else in the app calls helpers on window.TN, not the raw
   Supabase client. That way if we ever swap the backend, only this file
   changes.

   AUTH METHOD NOTE
   ----------------
   This build uses Supabase email+password auth, with the user's phone
   number mapped to a synthetic email of the form:

       +256712345678  ->  256712345678@tradenova.app

   Why: Supabase's native phone auth requires an SMS provider (Twilio,
   Vonage, etc.) for OTP verification, which costs money per message and
   needs setup. The synthetic-email pattern gives working phone+password
   login today with zero SMS cost.

   To switch to real phone auth later:
     - Enable Phone provider in Supabase Auth settings
     - Wire up an SMS provider
     - In signUp() below, swap the email/phone fields per Supabase docs
   The UI and the rest of the app don't change.
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------
     Namespace + state
     ------------------------------------------------------------------ */
  window.TN = window.TN || {};

  var readyResolve;
  var readyReject;
  var readyPromise = new Promise(function (resolve, reject) {
    readyResolve = resolve;
    readyReject  = reject;
  });

  TN.ready = readyPromise;

  /* ------------------------------------------------------------------
     Synthetic-email helpers
     ------------------------------------------------------------------ */
  var EMAIL_DOMAIN = 'tradenova.app';

  function phoneToEmail(fullPhone) {
    /* fullPhone expected as "+256712345678" — strip everything but digits. */
    var digits = String(fullPhone).replace(/\D/g, '');
    return digits + '@' + EMAIL_DOMAIN;
  }

  /* ------------------------------------------------------------------
     Config fetch — get SUPABASE_URL + SUPABASE_ANON_KEY from /api/config.
     These values are safe to expose: the anon key only grants what your
     RLS policies allow. service_role key never touches the browser.
     ------------------------------------------------------------------ */
  function loadConfig() {
    return fetch('/api/config', { credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('Config endpoint returned ' + res.status);
        return res.json();
      })
      .then(function (cfg) {
        if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
          throw new Error('Config response missing supabaseUrl or supabaseAnonKey');
        }
        return cfg;
      });
  }

  /* ------------------------------------------------------------------
     Init sequence
     ------------------------------------------------------------------ */
  loadConfig()
    .then(function (cfg) {
      if (!window.supabase || !window.supabase.createClient) {
        throw new Error(
          'Supabase JS SDK not loaded. Add ' +
          '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> ' +
          'to the page before js/supabase.js'
        );
      }

      var client = window.supabase.createClient(
        cfg.supabaseUrl,
        cfg.supabaseAnonKey,
        {
          auth: {
            persistSession:    true,
            autoRefreshToken:  true,
            detectSessionInUrl: false
          }
        }
      );

      /* Keep the raw client available for advanced use. */
      TN.client = client;

      /* --------------------------------------------------------------
         Public API — everything the rest of the app calls.
         -------------------------------------------------------------- */

      /* Sign up. Returns { data: { user, session }, error }. */
      TN.signUp = function (fullPhone, password) {
        var email = phoneToEmail(fullPhone);
        return client.auth.signUp({
          email: email,
          password: password,
          options: {
            data: { phone: fullPhone }
          }
        });
      };

      /* Sign in. Same shape as signUp. */
      TN.signIn = function (fullPhone, password) {
        var email = phoneToEmail(fullPhone);
        return client.auth.signInWithPassword({
          email: email,
          password: password
        });
      };

      TN.signOut = function () {
        return client.auth.signOut();
      };

      /* Current session, or null. */
      TN.getSession = function () {
        return client.auth.getSession().then(function (r) {
          return r.data.session;
        });
      };

      /* Current user, or null. */
      TN.getUser = function () {
        return client.auth.getUser().then(function (r) {
          return r.data.user;
        });
      };

      /* Subscribe to auth state changes.
         Callback receives (event, session). */
      TN.onAuthChange = function (callback) {
        return client.auth.onAuthStateChange(callback);
      };

      /* --------------------------------------------------------------
         Resolve the global ready promise so pages can await TN.ready
         before calling the helpers above.
         -------------------------------------------------------------- */
      readyResolve(TN);
      document.dispatchEvent(new Event('tn:ready'));
    })
    .catch(function (err) {
      console.error('[Trade Nova] Supabase init failed:', err);
      TN.initError = err;
      readyReject(err);
      document.dispatchEvent(new Event('tn:error'));
    });
})();
