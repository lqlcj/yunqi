/* Applied before the page styles load so a saved dark theme does not flash white. */
(() => {
  const key = 'qing-journal-theme';
  const system = matchMedia('(prefers-color-scheme: dark)');
  const valid = value => ['system', 'light', 'dark'].includes(value);
  function read() { try { const value = localStorage.getItem(key); return valid(value) ? value : 'system'; } catch { return 'system'; } }
  let preference = read();
  function apply() {
    const dark = preference === 'dark' || (preference === 'system' && system.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.themePreference = preference;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#151c19' : '#f7f6f2');
    window.dispatchEvent(new Event('qing-theme-change'));
  }
  window.qingTheme = {
    getPreference: () => preference,
    setPreference(value) {
      if (!valid(value)) return;
      preference = value;
      try { localStorage.setItem(key, value); } catch { /* Still usable for this page if storage is unavailable. */ }
      apply();
    },
  };
  system.addEventListener('change', apply);
  window.addEventListener('storage', event => { if (event.key === key || event.key === null) { preference = read(); apply(); } });
  apply();
})();
