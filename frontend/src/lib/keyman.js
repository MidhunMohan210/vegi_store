const KEYMAN_ENGINE_URL = "https://s.keyman.com/kmw/engine/18.0.246/keymanweb.js";

let keymanBootPromise;

const loadScriptOnce = (src, id) =>
  new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error(`Failed to load Keyman script: ${src}`));

    document.head.appendChild(script);
  });

const loadKeymanScripts = async () => {
  await loadScriptOnce(KEYMAN_ENGINE_URL, "keymanweb-engine");
};

export const ensureKeymanMalayalam = async () => {
  if (!keymanBootPromise) {
    keymanBootPromise = (async () => {
      await loadKeymanScripts();

      const keyman = window.keyman;
      if (!keyman) {
        throw new Error("Keyman was not found on window after script load.");
      }

      if (!keyman.initialized) {
        await keyman.init({
          attachType: "manual",
          ui: "none",
        });
      }

      await keyman.addKeyboards("phoneticmalayalam@ml");
      await keyman.setActiveKeyboard("phoneticmalayalam", "ml");

      return keyman;
    })();
  }

  return keymanBootPromise;
};
