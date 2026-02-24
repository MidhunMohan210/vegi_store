export const malayalamLayout = {
  default: [
    "അ ആ ഇ ഈ ഉ ഊ എ ഏ ഐ ഒ ഓ ഔ",
    "ക ഖ ഗ ഘ ങ ക്ഷ ങ്ക ങ്ങ",
    "ച ഛ ജ ഝ ഞ ച്ച ഞ്ച ഞ്ഞ",
    "ട ഠ ഡ ഢ ണ ന്ന പ്പ മ്പ",
    "ത ഥ ദ ധ ന മ്മ വ്വ റ്റ",
    "പ ഫ ബ ഭ മ ണ്ട ണ്ണ ത്ത",
    "യ ര ല വ ശ ന്ത ന്ദ ബ്ബ",
    "ഷ സ ഹ ള ഴ റ യ്യ",
    "ർ ൽ ൻ ൾ ൺ",
    "ാ ി ീ ു ൂ െ േ ൈ",
    "ൊ ോ ൌ ് ം ഃ",
    "{space} {bksp}"
  ]
}

export const malayalamDisplay = {
  "{space}": "Space",
  "{bksp}": "⌫ Backspace"
}

export const malayalamShortcutsByCode = {
  KeyA: { base: "അ", shift: "ം" },
  KeyS: { base: "ആ", shift: "ഃ" },
  KeyD: { base: "ഇ" },
  KeyF: { base: "ഈ" },
  KeyG: { base: "ഉ" },
  KeyH: { base: "ഊ" },
  KeyJ: { base: "എ" },
  KeyK: { base: "ഏ" },
  KeyL: { base: "ഐ" },
  Semicolon: { base: "ഒ" },
  Quote: { base: "ഓ", shift: "ൺ" },
  KeyW: { base: "ഔ", shift: "ങ്ക" },
  KeyQ: { base: "ക", shift: "ക്ഷ" },
  KeyE: { base: "ഖ", shift: "ങ്ങ" },
  KeyR: { base: "ഗ", shift: "ച്ച" },
  KeyT: { base: "ഘ", shift: "ഞ്ച" },
  KeyY: { base: "ങ", shift: "ഞ്ഞ" },
  KeyU: { base: "ച", shift: "ന്ന" },
  KeyI: { base: "ഛ", shift: "പ്പ" },
  KeyO: { base: "ജ", shift: "മ്പ" },
  KeyP: { base: "ഝ", shift: "മ്മ" },
  BracketLeft: { base: "ഞ", shift: "വ്വ" },
  BracketRight: { base: "ട", shift: "റ്റ" },
  Backslash: { base: "ഠ", shift: "ണ്ട" },
  KeyZ: { base: "ഡ", shift: "ണ്ണ" },
  KeyX: { base: "ഢ", shift: "ത്ത" },
  KeyC: { base: "ണ", shift: "ന്ത" },
  KeyV: { base: "ത", shift: "ന്ദ" },
  KeyB: { base: "ഥ", shift: "ബ്ബ" },
  KeyN: { base: "ദ", shift: "യ്യ" },
  KeyM: { base: "ധ", shift: "ർ" },
  Comma: { base: "ന", shift: "ൽ" },
  Period: { base: "പ", shift: "ൻ" },
  Slash: { base: "ഫ", shift: "ൾ" },
  Digit1: { base: "ബ", shift: "ാ" },
  Digit2: { base: "ഭ", shift: "ി" },
  Digit3: { base: "മ", shift: "ീ" },
  Digit4: { base: "യ", shift: "ു" },
  Digit5: { base: "ര", shift: "ൂ" },
  Digit6: { base: "ല", shift: "െ" },
  Digit7: { base: "വ", shift: "േ" },
  Digit8: { base: "ശ", shift: "ൈ" },
  Digit9: { base: "ഷ", shift: "ൊ" },
  Digit0: { base: "സ", shift: "ോ" },
  Minus: { base: "ഹ", shift: "ൗ" },
  Equal: { base: "ള", shift: "്" },
  Backquote: { base: "ഴ", shift: "റ" },
  Space: { base: "{space}" },
  Backspace: { base: "{bksp}" }
}

export const malayalamButtonTheme = [
  {
    class: "hg-chillu",
    buttons: "ർ ൽ ൻ ൾ ൺ"
  },
  {
    class: "hg-conjunct",
    buttons: "ക്ഷ ങ്ക ങ്ങ ച്ച ഞ്ച ഞ്ഞ ന്ന പ്പ മ്പ മ്മ വ്വ റ്റ ണ്ട ണ്ണ ത്ത ന്ത ന്ദ ബ്ബ യ്യ"
  },
  {
    class: "hg-matra",
    buttons: "ാ ി ീ ു ൂ െ േ ൈ ൊ ോ ൌ ് ം ഃ"
  }
]
