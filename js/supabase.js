/* ==========================================================================
   Trade Nova — Supabase Client
   --------------------------------------------------------------------------
   Loads credentials from /api/config (Vercel) and initialises the client.

   AUTH METHOD
   -----------
   Uses Supabase native email + password authentication.
   User profile data (name, phone, country, invite code) is handled
   separately via the `profiles` table in the database.
   ========================================================================== */

(function () {
  'use strict';

  window.TN = window.TN || {};

  var readyResolve;
  var readyReject;
  var readyPromise = new Promise(function (resolve, reject) {
    readyResolve = resolve;
    readyReject  = reject;
  });

  TN.ready = readyPromise;

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
            persistSession:     true,
            autoRefreshToken:   true,
            detectSessionInUrl: false
          }
        }
      );

      /* Keep the raw client available for direct database queries */
      TN.client = client;

      /* --------------------------------------------------------------
         Public API — everything the rest of the app calls.
         -------------------------------------------------------------- */

      /* Sign up. Returns { data: { user, session }, error }. */
      TN.signUp = function (email, password, metadata) {
        return client.auth.signUp({
          email: email,
          password: password,
          options: {
            data: metadata || {}
          }
        });
      };

      /* Sign in with email and password. */
      TN.signIn = function (email, password) {
        return client.auth.signInWithPassword({
          email: email,
          password: password
        });
      };

      /* Sign out of the current session. */
      TN.signOut = function () {
        return client.auth.signOut();
      };

      /* Get the current session, or null. */
      TN.getSession = function () {
        return client.auth.getSession().then(function (r) {
          return r.data.session;
        });
      };

      /* Get the current user object, or null. */
      TN.getUser = function () {
        return client.auth.getUser().then(function (r) {
          return r.data.user;
        });
      };

      /* Subscribe to auth state changes (e.g. token refresh, sign out). */
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
