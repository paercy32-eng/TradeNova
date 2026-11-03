/* ==========================================================================
   Trade Nova — Supabase Client
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

  // Your specific Supabase credentials
  var SUPABASE_URL = "https://revvginvokcgcazhgkwf.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJldnZnaW52b2tjZ2Nhemhna3dmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NTQ4MDQsImV4cCI6MjEwOTAzMDgwNH0.HJMaoJocEVlAsgzKQ1AmKFE2nZYQxoMEZIWTEdOkUAQ";

  try {
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('Supabase JS SDK not loaded.');
    }

    var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession:     true,
        autoRefreshToken:   true,
        detectSessionInUrl: false
      }
    });

    TN.client = client;

    TN.signUp = function (email, password, metadata) {
      return client.auth.signUp({
        email: email,
        password: password,
        options: { data: metadata || {} }
      });
    };

    TN.signIn = function (email, password) {
      return client.auth.signInWithPassword({
        email: email,
        password: password
      });
    };

    TN.signOut = function () {
      return client.auth.signOut();
    };

    TN.getSession = function () {
      return client.auth.getSession().then(function (r) {
        return r.data.session;
      });
    };

    TN.getUser = function () {
      return client.auth.getUser().then(function (r) {
        return r.data.user;
      });
    };

    readyResolve(TN);
    document.dispatchEvent(new Event('tn:ready'));

  } catch (err) {
    console.error('[Trade Nova] Supabase init failed:', err);
    TN.initError = err;
    readyReject(err);
    document.dispatchEvent(new Event('tn:error'));
  }
})();
