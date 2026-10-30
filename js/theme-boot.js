// Colour theme: DARK (the default look), BRIGHT ("warm paper"), or RANDOM —
// one of five palettes, re-rolled on every app launch and every time RANDOM
// is picked again, never the same one twice in a row.
//
// Loaded as a plain, blocking <script> in index.html's <head> — not a
// module — so the theme is on <html> before the first paint: launching in
// BRIGHT never flashes the dark theme first. The palettes themselves live
// in css/01-tokens.css as :root[data-theme="..."] blocks; this file only
// decides which one is on. window.gymTheme is the API the theme switch uses.
(function () {
  var STORAGE_KEY = 'gym-theme-v1';
  var RANDOM_PALETTES = ['synthwave', 'acid-sunset', 'pop-art', 'acid-jungle', 'groove70'];
  // Each theme's --bg, for the phone's status bar (<meta name="theme-color">)
  // — set here directly because the stylesheets may not have loaded yet.
  var STATUS_BAR = {
    dark: '#1b1a18',
    bright: '#f5efe6',
    synthwave: '#140b2e',
    'acid-sunset': '#24091f',
    'pop-art': '#ffe94a',
    'acid-jungle': '#05211c',
    groove70: '#2e1c0f',
  };

  // Storage can throw (private mode, blocked site data) — the theme then
  // just falls back to DARK for this session.
  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && (saved.mode === 'dark' || saved.mode === 'bright' || saved.mode === 'random')) return saved;
    } catch (e) { /* fall through */ }
    return { mode: 'dark', palette: null };
  }

  function save(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* not persisted */ }
  }

  function pickPalette(previous) {
    var options = RANDOM_PALETTES.filter(function (p) { return p !== previous; });
    return options[Math.floor(Math.random() * options.length)];
  }

  function themeFor(state) {
    return state.mode === 'random' ? state.palette : state.mode;
  }

  function apply(state) {
    var theme = themeFor(state);
    var root = document.documentElement;
    if (theme === 'dark') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', STATUS_BAR[theme] || STATUS_BAR.dark);
  }

  var state = load();
  if (state.mode === 'random') {
    state.palette = pickPalette(state.palette);
    save(state);
  }
  apply(state);

  window.gymTheme = {
    // 'dark' | 'random' | 'bright'
    mode: function () { return state.mode; },
    // The palette actually showing: 'dark', 'bright', or a RANDOM palette.
    current: function () { return themeFor(state); },
    // Picking RANDOM — even when it's already on — rolls a new palette.
    setMode: function (mode) {
      state = { mode: mode, palette: mode === 'random' ? pickPalette(state.palette) : state.palette };
      save(state);
      apply(state);
      window.dispatchEvent(new CustomEvent('gym-theme-change', { detail: { mode: mode, theme: themeFor(state) } }));
    },
  };
})();
