// One number with a caption, used in the dashboard's stats row.
// `value` is trusted markup-free content produced by the caller's formatters.
export function statTile(value, label) {
  return `<div class="card" style="flex:1; text-align:center; margin:0;">
          <div class="num" style="font-size:1.3rem; font-weight:var(--weight-bold); letter-spacing:var(--tracking-tight);">${value}</div>
          <div class="text-muted" style="font-size:0.75rem;">${label}</div>
        </div>`;
}
