// The first screen, for whoever isn't signed in yet (M0b): the logo, the
// name, one line about what ג׳יני is for, and five areas that each open to
// a few lines. Under them: sign-in, "install to the home screen" where the
// browser can, and the privacy link.
//
// Every sentence here describes something the app already does. Before
// changing one, check it against the app (docs/specs/first-screen.md).

import { icon } from './icon.js';
import { watchInstallOffer, installApp } from './install-banner.js';

const AREAS = [
  {
    icon: 'moon',
    title: 'שינה',
    hook: 'ישנת מספיק?',
    text: 'רושמים את הלילה בשתי שניות, וג׳יני משווה לשעה שקבעת. גרף של שבועיים או חודש מראה אם שעת השינה זזה.',
  },
  {
    icon: 'utensils',
    title: 'תזונה',
    hook: 'כמה חלבון חסר לך היום?',
    text: 'קלוריות וחלבון מול היעד, והיעד גדל ביום שהלכת יותר או התאמנת. שוקלים בבוקר ורואים מגמה של שבוע, לא רק את המספר של היום.',
  },
  {
    icon: 'dumbbell',
    title: 'תנועה',
    hook: 'מה הרמת בפעם הקודמת?',
    text: 'ג׳יני זוכרת, ומראה את זה ליד כל תרגיל. שיא חדש מזוהה לבד, ושעון מנוחה רץ בין הסטים. כוח, ריצה, קרוספיט, פילאטיס, יוגה, שחייה ועוד. הצעדים מהאייפון נכנסים לבד.',
  },
  {
    icon: 'list-checks',
    title: 'משימות ויומן',
    hook: 'יותר מדי דברים בראש?',
    text: 'זורקים משימה בשורה אחת, ורואים מה להיום ומה חשוב מול מה דחוף. מחברים את יומן גוגל פעם אחת, ומשימה עם שעה נכנסת אליו לבד. משימה שנדחית שוב ושוב? ג׳יני שואלת מה תקוע, בלי להטיף. ולהחלטות שתוקעות אותך, יש טיימר של שתי דקות.',
  },
  {
    icon: 'repeat',
    title: 'הרגלים',
    hook: 'הרגל שמחזיק גם ביום עמוס?',
    text: 'לכל הרגל יש גרסה מלאה וגרסה מקוצרת, כך שגם יום עמוס נספר. רצפים, נקודות ורמות. וגם גמילה מהרגל רע: כפתור "מעדתי" בלי אשמה, ושרשרת של ימים נקיים.',
  },
];

const INSTALL_LABEL = {
  prompt: ['download', 'התקנה למסך הבית'],
  steps: ['share', 'איך מתקינים?'],
};

// Closing the Google window is a choice, not a failure to report.
const CANCELLED = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);

function areaRow(area) {
  // name= lets the browser keep one row open at a time; the toggle
  // listener in mountWelcome does the same for browsers that ignore it.
  return `
    <details class="welcome-area" name="welcome-area">
      <summary>
        <span class="welcome-area-icon">${icon(area.icon)}</span>
        <span class="welcome-area-text">
          <b>${area.title}</b>
          <span>${area.hook}</span>
        </span>
        <span class="welcome-area-chevron">${icon('chevron-down', { className: 'icon--sm' })}</span>
      </summary>
      <p>${area.text}</p>
    </details>`;
}

// Draws the screen into `container` once; later calls keep what is there.
// onSignIn: starts the sign-in and returns a promise.
export function mountWelcome(container, { onSignIn }) {
  if (container.querySelector('.welcome')) return;
  container.innerHTML = `
    <div class="welcome">
      <img class="welcome-logo" src="images/logo/jini.svg" alt="" width="76" height="76">
      <h1 class="welcome-title">ג׳יני</h1>
      <p class="welcome-tagline">כי מישהו צריך לנהל לך את החיים</p>
      <div class="welcome-areas">${AREAS.map(areaRow).join('')}</div>
      <div class="welcome-actions">
        <button type="button" class="btn btn-primary btn-block" data-role="signin">התחברות עם Google</button>
        <button type="button" class="btn btn-outline btn-block" data-role="install" hidden></button>
      </div>
      <p class="welcome-legal">ההתחברות כפופה ל<a href="privacy.html">מדיניות הפרטיות</a></p>
    </div>`;

  const areas = [...container.querySelectorAll('.welcome-area')];
  areas.forEach((area) => {
    area.addEventListener('toggle', () => {
      if (!area.open) return;
      areas.forEach((other) => { if (other !== area) other.open = false; });
    });
  });

  const signInBtn = container.querySelector('[data-role="signin"]');
  signInBtn.addEventListener('click', async () => {
    signInBtn.disabled = true;
    try {
      await onSignIn();
    } catch (err) {
      if (!CANCELLED.has(err?.code)) alert('ההתחברות נכשלה: ' + (err?.message || err));
    } finally {
      signInBtn.disabled = false;
    }
  });

  const installBtn = container.querySelector('[data-role="install"]');
  installBtn.addEventListener('click', () => installApp());
  // Chrome's offer can arrive after the screen is drawn, and goes away once
  // it is used or the app is installed.
  watchInstallOffer((offer) => {
    const label = INSTALL_LABEL[offer];
    installBtn.hidden = !label;
    if (label) installBtn.innerHTML = `${icon(label[0], { className: 'icon--sm' })} ${label[1]}`;
  });
}
