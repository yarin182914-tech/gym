// Minus / value / plus control for weight, reps and macro amounts.
//
// Callers own the button attributes because the two existing users identify
// their buttons differently: the session screen keys them by set index, the
// nutrition form by field name and step size.
//
// The glyph is U+2212 MINUS SIGN, not a hyphen — it aligns with the plus.
export function stepper({ decAttrs, incAttrs, value, valueAttrs = '' }) {
  return `<div class="stepper">
          <button ${decAttrs}>−</button>
          <span class="stepper-value num"${valueAttrs ? ' ' + valueAttrs : ''}>${value}</span>
          <button ${incAttrs}>+</button>
        </div>`;
}
