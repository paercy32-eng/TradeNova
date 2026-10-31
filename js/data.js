/* ==========================================================================
   TradeBase — data layer
   --------------------------------------------------------------------------
   This file is the ONLY place mock data lives. `app.js` never hardcodes
   ticker items or signals — it reads whatever this file puts on the
   window.TRADEBASE_DATA object.

   To go live later, replace the whole file with a fetch() that populates
   the same shape. Keep the field names identical and `app.js` keeps working.
   ========================================================================== */

window.TRADEBASE_DATA = {

  /* ------------------------------------------------------------------------
     Ticker strip
     ------------------------------------------------------------------------
     Shape:
       { symbol: string, price: string, change: number }

     `price` is a pre-formatted string on purpose — different instruments
     use different decimal places (BTC = 0 dp, EURUSD = 4 dp, XAUUSD = 2 dp)
     and the display layer should not have to guess.
     `change` is a percentage, positive or negative.
     ---------------------------------------------------------------------- */
  ticker: [
    { symbol: 'XAUUSD', price: '2,345.60', change: +0.82 },
    { symbol: 'EURUSD', price: '1.0845',   change: -0.21 },
    { symbol: 'GBPUSD', price: '1.2673',   change: +0.14 },
    { symbol: 'USDZAR', price: '18.4520',  change: +0.36 },
    { symbol: 'BTCUSD', price: '68,120',   change: +2.41 },
    { symbol: 'ETHUSD', price: '3,204',    change: +1.12 },
    { symbol: 'US30',   price: '39,480',   change: -0.18 },
    { symbol: 'NAS100', price: '18,240',   change: +0.54 }
  ],

  /* ------------------------------------------------------------------------
     Signals
     ------------------------------------------------------------------------
     Shape of each signal:
       id          string   unique reference, e.g. "SIG-1042"
       symbol      string   instrument ticker, shown large on the card
       name        string   instrument long name, shown small
       class       string   "forex" | "crypto" | "commodities" | "indices"
                            (must match the data-class filter chips in HTML)
       direction   string   "long" | "short"
       timeframe   string   "15m" | "1H" | "4H" | "1D" etc.
       entry       number   entry price
       stop        number   stop-loss price
       targets     number[] one or two take-profit levels
       status      string   "active" | "tp1" | "tp2" | "stopped" | "closed"
                            ("active" = still open; anything else = closed)
       confidence  number   0–100, drives the little blue bar
       hoursAgo    number   how long ago it was published, drives sorting
                            and the "Xh ago" label
       analyst     string   who published it
       city        string   Kampala | Nairobi | Lusaka (trust signal for this
                            audience — local presence matters)
       note        string   plain-English rationale, shown on card and modal
       resultR     number   optional — realised result in R multiples.
                            Only present on closed signals. Drives win rate
                            and avg-return stats. Positive = win, negative = loss.

     Notes on the mock data below:
       - Order does not matter; app.js sorts by hoursAgo.
       - I deliberately included losers ("stopped") and partials ("tp1").
         A track record with 100% wins is not credible and will actually
         reduce trust with UG/KE/ZM audiences who are used to scammy
         "guaranteed profit" signal groups.
       - Prices are close to realistic levels at time of writing. Swap them
         for live quotes when you wire up a real feed.
     ---------------------------------------------------------------------- */
  signals: [

    {
      id: 'SIG-1042',
      symbol: 'XAUUSD',
      name: 'Gold / US Dollar',
      class: 'commodities',
      direction: 'long',
      timeframe: '4H',
      entry: 2345.60,
      stop: 2328.10,
      targets: [2362.00, 2378.50],
      status: 'active',
      confidence: 82,
      hoursAgo: 3,
      analyst: 'Kato B.',
      city: 'Kampala',
      note: 'Higher lows into a 4H demand zone with a clean bullish engulfing. ' +
            'DXY rolling over. Risking 1% — first target at the prior swing high.'
    },

    {
      id: 'SIG-1041',
      symbol: 'EURUSD',
      name: 'Euro / US Dollar',
      class: 'forex',
      direction: 'short',
      timeframe: '1H',
      entry: 1.0872,
      stop: 1.0915,
      targets: [1.0818, 1.0770],
      status: 'tp1',
      confidence: 74,
      hoursAgo: 9,
      resultR: 1.25,
      analyst: 'Wanjiru M.',
      city: 'Nairobi',
      note: 'Rejection from the 1H supply block after a failed breakout. ' +
            'TP1 banked, stop moved to breakeven on the runner.'
    },

    {
      id: 'SIG-1040',
      symbol: 'BTCUSD',
      name: 'Bitcoin / US Dollar',
      class: 'crypto',
      direction: 'long',
      timeframe: '1D',
      entry: 66180,
      stop: 63500,
      targets: [69500, 72800],
      status: 'active',
      confidence: 68,
      hoursAgo: 14,
      analyst: 'Chanda M.',
      city: 'Lusaka',
      note: 'Daily close back above the range mid after a liquidity sweep. ' +
            'Scaling in — position size halved given weekend volatility.'
    },

    {
      id: 'SIG-1039',
      symbol: 'USDZAR',
      name: 'US Dollar / South African Rand',
      class: 'forex',
      direction: 'long',
      timeframe: '4H',
      entry: 18.3120,
      stop: 18.2180,
      targets: [18.4400, 18.5600],
      status: 'stopped',
      confidence: 61,
      hoursAgo: 27,
      resultR: -1,
      analyst: 'Wanjiru M.',
      city: 'Nairobi',
      note: 'Stopped out on a surprise hawkish SARB comment. Idea invalidated — ' +
            'no re-entry until structure resets.'
    },

    {
      id: 'SIG-1038',
      symbol: 'GBPUSD',
      name: 'British Pound / US Dollar',
      class: 'forex',
      direction: 'long',
      timeframe: '1H',
      entry: 1.2610,
      stop: 1.2572,
      targets: [1.2665, 1.2712],
      status: 'tp2',
      confidence: 79,
      hoursAgo: 33,
      resultR: 2.55,
      analyst: 'Kato B.',
      city: 'Kampala',
      note: 'Full target sequence hit. Textbook continuation after the London ' +
            'open break.'
    },

    {
      id: 'SIG-1037',
      symbol: 'US30',
      name: 'Dow Jones 30',
      class: 'indices',
      direction: 'short',
      timeframe: '1H',
      entry: 39620,
      stop: 39780,
      targets: [39400, 39180],
      status: 'active',
      confidence: 64,
      hoursAgo: 5,
      analyst: 'Chanda M.',
      city: 'Lusaka',
      note: 'Lower high into the prior breakdown shelf. Watching the US cash open ' +
            'for confirmation — do not chase.'
    },

    {
      id: 'SIG-1036',
      symbol: 'ETHUSD',
      name: 'Ethereum / US Dollar',
      class: 'crypto',
      direction: 'long',
      timeframe: '4H',
      entry: 3105.00,
      stop: 2988.00,
      targets: [3280.00, 3450.00],
      status: 'active',
      confidence: 71,
      hoursAgo: 20,
      analyst: 'Chanda M.',
      city: 'Lusaka',
      note: 'Holding the 4H order block. BTC dominance cooling — alt continuation ' +
            'is the higher-probability path.'
    },

    {
      id: 'SIG-1035',
      symbol: 'XAUUSD',
      name: 'Gold / US Dollar',
      class: 'commodities',
      direction: 'short',
      timeframe: '1H',
      entry: 2358.20,
      stop: 2371.40,
      targets: [2340.00, 2322.00],
      status: 'stopped',
      confidence: 57,
      hoursAgo: 48,
      resultR: -1,
      analyst: 'Kato B.',
      city: 'Kampala',
      note: 'Counter-trend fade failed at NFP. Logged as a loss — that is the record.'
    },

    {
      id: 'SIG-1034',
      symbol: 'NAS100',
      name: 'Nasdaq 100',
      class: 'indices',
      direction: 'long',
      timeframe: '4H',
      entry: 18120,
      stop: 17980,
      targets: [18360, 18590],
      status: 'closed',
      confidence: 76,
      hoursAgo: 62,
      resultR: 1.85,
      analyst: 'Wanjiru M.',
      city: 'Nairobi',
      note: 'Partial at TP1, trail stopped the rest above entry. Booked 1.85R.'
    },

    {
      id: 'SIG-1033',
      symbol: 'EURUSD',
      name: 'Euro / US Dollar',
      class: 'forex',
      direction: 'long',
      timeframe: '15m',
      entry: 1.0805,
      stop: 1.0788,
      targets: [1.0830, 1.0852],
      status: 'active',
      confidence: 66,
      hoursAgo: 1,
      analyst: 'Wanjiru M.',
      city: 'Nairobi',
      note: 'Scalp off the Asian range low. Tight stop, quick target — small size.'
    }

  ]
};
