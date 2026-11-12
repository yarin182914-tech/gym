// The feet game's drawings ("להחליט", M6b) — kept apart from the game in
// feet.js so new art can replace them without touching how the game plays.
// Any replacement keeps the same hooks:
//   .foot-toes  the four small toes (tapped on the drum roll)
//   .foot-big   the big toe (curled; on the winner it rises like a thumb)
// and the poses below, which feet.js animates between. Colours are tokens
// (css/01-tokens.css: --foot-*), so the art follows the theme file.
//
// Drawn as a right foot seen from above, toes up, big toe on the left;
// the left foot is the same drawing mirrored.

export const POSES = {
  // Toes tucked under, as at the start.
  curled: 'translateY(2px) scaleY(0.78)',
  // A tap on the drum roll: half out, then back.
  tap: 'translateY(2px) scaleY(0.92)',
  // The winner's big toe, upright.
  raised: 'translateY(-2px) scaleY(1.75) rotate(-5deg)',
};

const TOES = [
  { cx: 57, cy: 33, rx: 8.5, ry: 10 },
  { cx: 72, cy: 36, rx: 7.5, ry: 9 },
  { cx: 85, cy: 43, rx: 6.5, ry: 8 },
  { cx: 95, cy: 54, rx: 5.5, ry: 6.5 },
];

// side: 'right' | 'left'.
export function footSvg(side = 'right') {
  const mirror = side === 'left' ? ' transform="translate(120 0) scale(-1 1)"' : '';
  return `
    <svg class="foot-art" viewBox="0 0 120 176" aria-hidden="true" focusable="false">
      <ellipse class="foot-shadow" cx="60" cy="166" rx="38" ry="7"/>
      <g${mirror}>
        <g class="foot-toes">
          ${TOES.map((t) => `<ellipse class="foot-skin" cx="${t.cx}" cy="${t.cy}" rx="${t.rx}" ry="${t.ry}"/>`).join('')}
          ${TOES.map((t) => `<ellipse class="foot-nail" cx="${t.cx}" cy="${t.cy - t.ry * 0.35}" rx="${t.rx * 0.45}" ry="${t.ry * 0.3}"/>`).join('')}
        </g>
        <path class="foot-skin foot-sole" d="M24 60 C17 82 22 102 30 121 C37 140 33 161 58 163 C83 165 89 147 89 129 C89 105 101 86 99 63 C97 45 31 41 24 60 Z"/>
        <path class="foot-shade" d="M30 92 C27 108 33 124 38 134 C40 120 37 104 30 92 Z"/>
        <ellipse class="foot-blush" cx="46" cy="78" rx="7" ry="4.5"/>
        <ellipse class="foot-blush" cx="80" cy="80" rx="6" ry="4"/>
        <g class="foot-big">
          <rect class="foot-skin foot-stem" x="22" y="40" width="26" height="24" rx="8"/>
          <ellipse class="foot-skin" cx="35" cy="40" rx="14" ry="17"/>
          <ellipse class="foot-nail" cx="35" cy="33" rx="7" ry="5.5"/>
        </g>
      </g>
    </svg>`;
}
