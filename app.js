(() => {
  'use strict';
  const currentScript = document.currentScript;
  if (!currentScript) return;
  const entry = document.createElement('script');
  entry.src = new URL('./frontend/assets/js/app.js', currentScript.src).href;
  entry.async = false;
  document.head.append(entry);
})();
