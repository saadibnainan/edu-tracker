// WCAG 2.x contrast ratios for the EDU-Tracker palette. No dependencies.
// Run: node design/contrast.mjs

const tokens = {
  bg: '#0C0C0C',
  surface: '#131313',
  raised: '#1A1A1A',
  border: '#2B2B2B',
  borderStrong: '#3D3D3D',
  text: '#E9E7E2',
  muted: '#8A8883',
  disabled: '#55534F',
  accent: '#FF5A1F',
};

const subjects = {
  'subject-1 slate': '#7D8CA3',
  'subject-2 sage': '#869777',
  'subject-3 clay': '#A3866F',
  'subject-4 mauve': '#9A8298',
  'subject-5 teal': '#6E9895',
  'subject-6 ochre': '#A39766',
};

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const rows = [];
const add = (fgName, fg, bgName, bg, need, kind) => {
  const r = ratio(fg, bg);
  rows.push({ pair: `${fgName} on ${bgName}`, fg, bg, ratio: r.toFixed(2), need, pass: r >= need ? 'PASS' : 'FAIL', kind });
};

for (const bgName of ['bg', 'surface', 'raised']) {
  add('text', tokens.text, bgName, tokens[bgName], 4.5, 'text');
  add('muted', tokens.muted, bgName, tokens[bgName], 4.5, 'text');
  add('accent', tokens.accent, bgName, tokens[bgName], 4.5, 'text');
  add('disabled', tokens.disabled, bgName, tokens[bgName], 4.5, 'text, exempt (inactive control)');
}
// Hover inverts: text color becomes background, background color becomes text.
add('bg (hover inverted)', tokens.bg, 'text', tokens.text, 4.5, 'text');
add('surface (hover inverted)', tokens.surface, 'text', tokens.text, 4.5, 'text');
add('raised (hover inverted)', tokens.raised, 'text', tokens.text, 4.5, 'text');
add('muted (inverted cell, NOT USED)', tokens.muted, 'text', tokens.text, 4.5, 'rejected, see next row');
// Rule: inside an inverted cell, secondary text maps to the disabled token.
add('disabled as inverted secondary', tokens.disabled, 'text', tokens.text, 4.5, 'text');
// Primary action: dark label on accent fill.
add('bg (primary label)', tokens.bg, 'accent', tokens.accent, 4.5, 'text');
// Non-text UI (WCAG 1.4.11 needs 3:1 for meaningful graphics).
add('accent focus outline', tokens.accent, 'bg', tokens.bg, 3, 'non-text');
add('accent focus outline', tokens.accent, 'surface', tokens.surface, 3, 'non-text');
add('accent outline on inverted fill', tokens.accent, 'text', tokens.text, 3, 'rejected, outline offset 2px onto parent instead');
add('chart bar (text)', tokens.text, 'surface', tokens.surface, 3, 'non-text');
add('borderStrong', tokens.borderStrong, 'surface', tokens.surface, 1, 'decorative');
for (const [name, hex] of Object.entries(subjects)) {
  add(name, hex, 'surface', tokens.surface, 3, 'non-text');
  add(name, hex, 'raised', tokens.raised, 3, 'non-text');
}

const w = (s, n) => String(s).padEnd(n);
console.log(w('PAIR', 44) + w('FG', 9) + w('BG', 9) + w('RATIO', 7) + w('NEED', 6) + w('RESULT', 7) + 'KIND');
for (const r of rows) {
  console.log(w(r.pair, 44) + w(r.fg, 9) + w(r.bg, 9) + w(r.ratio, 7) + w(r.need, 6) + w(r.pass, 7) + r.kind);
}
