
(function () {
  const iv = setInterval(() => {
    if (!window.isEmbedded) {
      window.isEmbedded = true;
      window.dispatchEvent(new Event('resize'))
    }
  }, 500);
  setTimeout(() => clearInterval(iv), 30000);
})();

