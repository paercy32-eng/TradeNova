/* ==========================================================================
   TradeBase — application logic
   --------------------------------------------------------------------------
   Reads window.TRADEBASE_DATA (from data.js), renders everything, wires up
   filters, the chart modal and the alert form.

   No dependencies except the Lightweight Charts global loaded from CDN in
   index.html. Everything here is plain ES2017 — works in every browser that
   supports <dialog> (Chrome 37+, Firefox 98+, Safari 15.4+).
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------
     Data read
     ------------------------------------------------------------------
     data.js runs before this file, so TRADEBASE_DATA is already on
     window by the time we execute. If you move to a live API later,
     replace the next line with a fetch that dispatches a "data:ready"
     event, and call init() from inside that handler instead.
     ------------------------------------------------------------------ */
  var DATA    = window.TRADEBASE_DATA || { ticker: [], signals: [] };
  var signals = (DATA.signals || []).slice();

  /* ------------------------------------------------------------------
     Tiny DOM helpers
     ------------------------------------------------------------------ */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------------------------------------------
     Formatting
     ------------------------------------------------------------------ */

  /* Decimal count depends on the instrument's magnitude, so one formatter
     handles EURUSD (4 dp), XAUUSD (2 dp), US30 (0 dp) and BTC (0 dp). */
  function fmtPrice(p) {
    if (p >= 1000) return p.toFixed(2);
    if (p >= 10)   return p.toFixed(3);
    if (p >= 1)    return p.toFixed(4);
    return p.toFixed(5);
  }

  function publishedDate(sig) {
    return new Date(Date.now() - sig.hoursAgo * 3600 * 1000);
  }

  function timeAgo(date) {
    var sec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (sec < 60) return 'just now';
    var m = Math.floor(sec / 60); if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);   if (h < 24) return h + 'h ago';
    var d = Math.floor(h / 24);   return d + 'd ago';
  }

  function riskReward(sig) {
    var risk = Math.abs(sig.entry - sig.stop);
    if (!risk) return '—';
    var reward = Math.abs(sig.targets[sig.targets.length - 1] - sig.entry);
    return '1 : ' + (reward / risk).toFixed(1);
  }

  function statusMeta(status) {
    switch (status) {
      case 'active':  return { label: 'Active',  cls: 'status-active' };
      case 'tp1':     return { label: 'TP1 hit', cls: 'status-win'    };
      case 'tp2':     return { label: 'TP2 hit', cls: 'status-win'    };
      case 'stopped': return { label: 'Stopped', cls: 'status-loss'   };
      default:        return { label: 'Closed',  cls: 'status-closed' };
    }
  }

  function isClosed(sig) { return sig.status !== 'active'; }

  /* ------------------------------------------------------------------
     Ticker strip
     ------------------------------------------------------------------
     JS duplicates the items so the CSS marquee (translateX -50%) loops
     seamlessly. The animation itself lives in styles.css.
     ------------------------------------------------------------------ */
  function renderTicker() {
    var track = $('#tickerTrack');
    if (!track || !DATA.ticker) return;

    var html = DATA.ticker.map(function (t) {
      var up = t.change >= 0;
      return '' +
        '<div class="ticker-item">' +
          '<b>' + esc(t.symbol) + '</b>' +
          '<span>' + esc(t.price) + '</span>' +
          '<span class="' + (up ? 'up' : 'down') + '">' +
            (up ? '+' : '') + t.change.toFixed(2) + '%' +
          '</span>' +
        '</div>';
    }).join('');

    /* Duplicate once for the seamless loop. */
    track.innerHTML = html + html;
  }

  /* ------------------------------------------------------------------
     Stats strip
     ------------------------------------------------------------------
     Computed live from closed signals so the numbers always match the
     feed. Adding a new closed signal to data.js updates these
     automatically — no hardcoded figures anywhere.
     ------------------------------------------------------------------ */
  function renderStats() {
    var grid = $('#statGrid');
    if (!grid) return;

    var closed = signals.filter(isClosed);
    var wins   = closed.filter(function (s) { return (s.resultR || 0) > 0; });
    var totalR = closed.reduce(function (a, s) { return a + (s.resultR || 0); }, 0);

    var winRate = closed.length ? Math.round((wins.length / closed.length) * 100) : 0;
    var avgR    = closed.length ? (totalR / closed.length) : 0;
    var active  = signals.filter(function (s) { return s.status === 'active'; }).length;

    var cells = [
      { v: active,        l: 'Active signals' },
      { v: closed.length, l: 'Closed signals' },
      { v: winRate + '%', l: 'Win rate'       },
      { v: (avgR >= 0 ? '+' : '') + avgR.toFixed(2) + 'R', l: 'Avg. return' }
    ];

    grid.innerHTML = cells.map(function (c) {
      return '<div class="stat"><b>' + c.v + '</b><span>' + c.l + '</span></div>';
    }).join('');
  }

  /* ------------------------------------------------------------------
     Feed rendering
     ------------------------------------------------------------------ */
  var state = { status: 'all', market: 'all' };

  function matches(sig) {
    var statusOk =
      state.status === 'all'    ? true :
      state.status === 'active' ? sig.status === 'active'
                                : isClosed(sig);
    var marketOk = state.market === 'all' || sig.class === state.market;
    return statusOk && marketOk;
  }

  function cardHTML(sig) {
    var st     = statusMeta(sig.status);
    var dirCls = sig.direction === 'long' ? 'badge-long' : 'badge-short';
    var pub    = publishedDate(sig);

    var levels = [
      { k: 'Entry', v: sig.entry,       cls: ''    },
      { k: 'Stop',  v: sig.stop,        cls: 'neg' },
      { k: 'TP1',   v: sig.targets[0],  cls: 'pos' },
      { k: 'TP2',   v: sig.targets[1] != null ? sig.targets[1] : sig.targets[0], cls: 'pos' }
    ].map(function (l) {
      return '<div><dt>' + l.k + '</dt><dd class="' + l.cls + '">' +
             fmtPrice(l.v) + '</dd></div>';
    }).join('');

    return '' +
      '<article class="card" data-id="' + esc(sig.id) + '">' +
        '<div class="card-top">' +
          '<div>' +
            '<span class="sym-name">' + esc(sig.symbol) + '</span>' +
            '<span class="sym-sub">' + esc(sig.name) + ' · ' +
              esc(sig.timeframe) + '</span>' +
          '</div>' +
          '<span class="badge ' + dirCls + '">' +
            sig.direction.toUpperCase() +
          '</span>' +
        '</div>' +
        '<div class="card-status">' +
          '<span class="status ' + st.cls + '">' + st.label + '</span>' +
          '<span class="rr">R:R ' + riskReward(sig) + '</span>' +
        '</div>' +
        '<dl class="levels">' + levels + '</dl>' +
        '<div class="conf"><span style="width:' +
          Math.min(100, sig.confidence) + '%"></span></div>' +
        '<p class="note">' + esc(sig.note) + '</p>' +
        '<div class="card-foot">' +
          '<span class="meta">' + esc(sig.analyst) + ' · ' +
            esc(sig.city) + ' · ' + timeAgo(pub) + '</span>' +
          '<div class="actions">' +
            '<button class="btn btn-ghost" data-act="chart" type="button">Chart</button>' +
            '<button class="btn btn-ghost" data-act="copy"  type="button">Copy</button>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function renderFeed() {
    var grid  = $('#signalGrid');
    var empty = $('#emptyState');
    if (!grid) return;

    var list = signals
      .filter(matches)
      .sort(function (a, b) { return a.hoursAgo - b.hoursAgo; });

    grid.innerHTML = list.map(cardHTML).join('');
    if (empty) empty.hidden = list.length > 0;
  }

  function wireFilters() {
    $$('.filter-row [data-status]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.status = btn.dataset.status;
        $$('.filter-row [data-status]').forEach(function (b) {
          b.classList.toggle('is-on', b === btn);
        });
        renderFeed();
      });
    });

    $$('.filter-row [data-class]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.market = btn.dataset.class;
        $$('.filter-row [data-class]').forEach(function (b) {
          b.classList.toggle('is-on', b === btn);
        });
        renderFeed();
      });
    });
  }

  /* ------------------------------------------------------------------
     Clipboard — with fallback for browsers without async clipboard
     ------------------------------------------------------------------ */
  function signalText(sig) {
    return [
      sig.symbol + ' — ' + sig.direction.toUpperCase() + ' (' + sig.timeframe + ')',
      'Entry: ' + fmtPrice(sig.entry),
      'Stop: '  + fmtPrice(sig.stop),
      sig.targets.map(function (t, i) {
        return 'TP' + (i + 1) + ': ' + fmtPrice(t);
      }).join('\n'),
      'R:R ' + riskReward(sig),
      'Ref: ' + sig.id
    ].join('\n');
  }

  function copyText(text, btn) {
    function done() {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = old; }, 1400);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () {
        fallbackCopy(text, done);
      });
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* noop */ }
    document.body.removeChild(ta);
  }

  /* ------------------------------------------------------------------
     Chart modal
     ------------------------------------------------------------------
     Uses Lightweight Charts from the CDN. Candles are synthetic but
     deterministic per signal id, so the chart looks the same every
     time you reopen a given signal — important for a demo where users
     will click around and compare.
     ------------------------------------------------------------------ */
  var dialog        = $('#signalDialog');
  var chartInstance = null;
  var activeSignal  = null;

  /* --- deterministic PRNG --- */
  function seed(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function ymd(d) {
    var m   = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day;
  }

  /* Generate 60 daily candles with the entry bar at ~75% of the way
     through. Before entry, price is pulled toward entry. After entry,
     price drifts toward the outcome (TP1 for wins, stop for losses,
     midpoint for active). */
  function makeCandles(sig) {
    var rnd      = mulberry32(seed(sig.id));
    var bars     = 60;
    var entryIdx = Math.floor(bars * 0.75);
    var vol      = Math.max(Math.abs(sig.entry - sig.stop), sig.entry * 0.004);

    var candles = [];
    var price   = sig.entry * (1 - (rnd() - 0.45) * 0.05);
    var today   = new Date(); today.setHours(0, 0, 0, 0);

    for (var i = 0; i < bars; i++) {
      var d = new Date(today);
      d.setDate(d.getDate() - (bars - 1 - i));

      /* Price is "attracted" to entry before the signal, and to the
         outcome after it. The 0.09 factor sets how fast it gets there. */
      var bias;
      if (i <= entryIdx) {
        bias = sig.entry;
      } else if (sig.status === 'active') {
        bias = sig.entry + (sig.targets[0] - sig.entry) * 0.4;
      } else if (sig.status === 'stopped') {
        bias = sig.stop;
      } else {
        bias = sig.targets[0];
      }

      var open  = price;
      var close = open + (bias - open) * 0.09 + (rnd() - 0.5) * vol * 1.1;
      if (i === entryIdx) close = sig.entry;

      var high = Math.max(open, close) + rnd() * vol * 0.7;
      var low  = Math.min(open, close) - rnd() * vol * 0.7;

      candles.push({ time: ymd(d), open: open, high: high, low: low, close: close });
      price = close;
    }

    return { candles: candles, entryIndex: entryIdx };
  }

  function renderChart(sig) {
    var el = $('#chart');
    if (!el) return;
    el.innerHTML = '';

    if (typeof LightweightCharts === 'undefined') {
      el.innerHTML = '<p class="note" style="padding:1rem">' +
        'Chart library unavailable — check your connection.' +
        '</p>';
      return;
    }

    if (chartInstance) { chartInstance.remove(); chartInstance = null; }

    chartInstance = LightweightCharts.createChart(el, {
      width:  el.clientWidth,
      height: 270,
      layout: {
        background: { color: '#0a0e13' },
        textColor:  '#8fa3b8',
        fontSize:   11
      },
      grid: {
        vertLines: { color: '#16202b' },
        horzLines: { color: '#16202b' }
      },
      rightPriceScale: { borderColor: '#22303f' },
      timeScale:       { borderColor: '#22303f', timeVisible: false },
      crosshair:       { mode: LightweightCharts.CrosshairMode.Normal }
    });

    var series = chartInstance.addCandlestickSeries({
      upColor:       '#16c784',
      downColor:     '#ea3943',
      wickUpColor:   '#16c784',
      wickDownColor: '#ea3943',
      borderVisible: false
    });

    var built = makeCandles(sig);
    series.setData(built.candles);

    /* Price lines: entry, stop, every target. */
    var lines = [
      { price: sig.entry, color: '#4f8cff', title: 'Entry' },
      { price: sig.stop,  color: '#ea3943', title: 'Stop'  }
    ];
    sig.targets.forEach(function (t, i) {
      lines.push({ price: t, color: '#16c784', title: 'TP' + (i + 1) });
    });

    lines.forEach(function (l) {
      series.createPriceLine({
        price:            l.price,
        color:            l.color,
        lineWidth:        1,
        lineStyle:        LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title:            l.title
      });
    });

    /* Entry marker */
    series.setMarkers([{
      time:     built.candles[built.entryIndex].time,
      position: sig.direction === 'long' ? 'belowBar' : 'aboveBar',
      color:    '#4f8cff',
      shape:    sig.direction === 'long' ? 'arrowUp' : 'arrowDown',
      text:     'Entry'
    }]);

    chartInstance.timeScale().fitContent();
  }

  function openSignal(sig) {
    activeSignal = sig;
    var st  = statusMeta(sig.status);
    var pub = publishedDate(sig);

    $('#dlgTitle').textContent = sig.symbol + ' · ' + sig.direction.toUpperCase();
    $('#dlgSub').textContent =
      sig.name + ' · ' + sig.timeframe + ' · ' + st.label +
      ' · ' + sig.analyst + ', ' + sig.city +
      ' · ' + timeAgo(pub);

    $('#dlgLevels').innerHTML =
      '<div><dt>Entry</dt><dd>'             + fmtPrice(sig.entry) + '</dd></div>' +
      '<div><dt>Stop</dt><dd class="neg">'  + fmtPrice(sig.stop)  + '</dd></div>' +
      sig.targets.map(function (t, i) {
        return '<div><dt>TP' + (i + 1) + '</dt>' +
               '<dd class="pos">' + fmtPrice(t) + '</dd></div>';
      }).join('');

    $('#dlgNote').textContent  = sig.note;
    $('#dlgShare').href = 'https://wa.me/?text=' + encodeURIComponent(signalText(sig));

    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');

    /* Defer chart render one frame so the dialog has laid out and
       clientWidth is correct. */
    requestAnimationFrame(function () { renderChart(sig); });
  }

  function closeDialog() {
    if (chartInstance) { chartInstance.remove(); chartInstance = null; }
    activeSignal = null;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function wireDialog() {
    if (!dialog) return;

    $('#dlgClose').addEventListener('click', closeDialog);

    /* Esc key on <dialog> fires "cancel" — intercept so we clean up the
       chart before it goes away. */
    dialog.addEventListener('cancel', function (e) {
      e.preventDefault();
      closeDialog();
    });

    /* Backdrop click: target === dialog only when the click was on the
       backdrop itself, not on content. */
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) closeDialog();
    });

    $('#dlgCopy').addEventListener('click', function () {
      if (activeSignal) copyText(signalText(activeSignal), $('#dlgCopy'));
    });

    window.addEventListener('resize', function () {
      var chart = $('#chart');
      if (chartInstance && chart) {
        chartInstance.applyOptions({ width: chart.clientWidth });
      }
    });
  }

  /* ------------------------------------------------------------------
     Card interactions (delegated on the grid)
     ------------------------------------------------------------------ */
  function wireCards() {
    var grid = $('#signalGrid');
    if (!grid) return;

    grid.addEventListener('click', function (e) {
      var card = e.target.closest('.card');
      if (!card) return;

      var sig = signals.find(function (s) { return s.id === card.dataset.id; });
      if (!sig) return;

      var btn = e.target.closest('[data-act]');
      if (!btn)              { openSignal(sig); return; }
      if (btn.dataset.act === 'chart') openSignal(sig);
      if (btn.dataset.act === 'copy')  copyText(signalText(sig), btn);
    });
  }

  /* ------------------------------------------------------------------
     Alert form
     ------------------------------------------------------------------
     Validates client-side and shows a status message. To make it live,
     replace the success branch with a fetch() to your backend or a
     form service (Formspree, Brevo, Supabase).
     ------------------------------------------------------------------ */
  function wireForm() {
    var form = $('#alertForm');
    var msg  = $('#formMsg');
    if (!form || !msg) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var contact = form.contact.value.trim();
      var markets = $$('input[name="markets"]:checked', form)
        .map(function (i) { return i.value; });

      var looksEmail = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(contact);
      var looksPhone = /^\+?[0-9][0-9\s\-()]{7,17}$/.test(contact);

      if (!looksEmail && !looksPhone) {
        msg.className   = 'form-msg err';
        msg.textContent = 'Enter a valid email or phone number with country code ' +
                          '(e.g. +256 7xx xxx xxx).';
        return;
      }
      if (!markets.length) {
        msg.className   = 'form-msg err';
        msg.textContent = 'Pick at least one market.';
        return;
      }

      /* ---- success (demo only) ---- */
      msg.className   = 'form-msg ok';
      msg.textContent = 'Saved. You will get a confirmation on ' +
                        form.channel.value + ' shortly.';
      form.reset();
    });
  }

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */
  function init() {
    var year = $('#year');
    if (year) year.textContent = new Date().getFullYear();

    renderTicker();
    renderStats();
    renderFeed();
    wireFilters();
    wireCards();
    wireDialog();
    wireForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
