// POST /api/steps — the iPhone shortcut sends the steps here in the
// background (no Safari, works with the phone locked). Same rules as the
// in-app import (#/import, js/lib/steps-import.js): whole numbers, up to a
// week back, and a day's steps never go down.
//
//   Authorization: Bearer gymi.<uid>.<secret>   (made on "חיבורים")
//   Body (JSON):   { "steps": 12450, "date": "2026-11-10" }   date optional
//   or a list:     { "steps": "4210\n9750", "date": "2026-11-15\n2026-11-14" }
//                  (today and yesterday in one run; arrays work too)
//
// The key is checked against users/{uid}/apiKeys/{sha256(secret)}; the
// function only ever touches that user's own documents. The service
// account comes from the FIREBASE_SA_JSON environment variable on Vercel —
// never from the repo.

import { begin, reply, touchKey, FieldValue } from './_shared.js';
import { parseStepsBody, mergeSteps, israelDateKey } from '../js/lib/steps-import.js';
import { userBaseKcal } from '../js/lib/body-burn.js';

const fmt = (n) => Number(n).toLocaleString('en-US');

// "היום" / "אתמול" / "13.11" — the shortcut shows this message.
function dayName(date) {
  const today = israelDateKey();
  if (date === today) return 'היום';
  if (date === israelDateKey(new Date(Date.now() - 864e5))) return 'אתמול';
  const [, m, d] = date.split('-');
  return `${Number(d)}.${Number(m)}`;
}

export default async function handler(req, res) {
  let ctx;
  try {
    ctx = await begin(req, res, 'steps');
  } catch (err) {
    console.error('[api/steps]', err);
    return reply(res, 500, { ok: false, message: 'שגיאה בשרת, נסה שוב' });
  }
  if (!ctx) return;
  const { store, userRef, keyRef, body } = ctx;
  // Shortcuts may send numbers as text, with a decimal point or with
  // separators, and a list as lines of text; parseStepsBody takes them all.
  const parsed = parseStepsBody(body);
  if (parsed.error) {
    // Echo what arrived, so a shortcut being set up shows what it sent.
    const got = (v) => JSON.stringify(v ?? null).slice(0, 120);
    const what = parsed.error === 'steps' ? 'מספר הצעדים לא תקין' : 'התאריך חסר או מחוץ לטווח';
    return reply(res, 400, { ok: false, message: `${what}, לא נשמר כלום. קיבלתי: steps=${got(body.steps)} date=${got(body.date)}` });
  }

  try {
    const days = await store.runTransaction(async (tx) => {
      const refs = parsed.days.map((d) => userRef.collection('dailyActivity').doc(d.date));
      const [userSnap, ...snaps] = await Promise.all([tx.get(userRef), ...refs.map((ref) => tx.get(ref))]);
      // A new day starts from the user's own base burn (M16a), else 1950.
      const base = userBaseKcal(userSnap.exists ? userSnap.data() : null);
      return parsed.days.map((d, i) => {
        const patch = mergeSteps(snaps[i].exists ? snaps[i].data() : null, d.steps, base);
        if (patch) tx.set(refs[i], { ...patch, date: d.date, loggedAt: FieldValue.serverTimestamp() }, { merge: true });
        return { ...d, saved: !!patch };
      });
    });
    touchKey(keyRef);

    const message = days.length === 1
      ? (days[0].saved ? `נשמרו ${fmt(days[0].steps)} צעדים` : `כבר רשומים ${fmt(days[0].steps)} צעדים או יותר`)
      : days.map((d) => `${dayName(d.date)} ${fmt(d.steps)}${d.saved ? '' : ' (כבר רשום)'}`).join(' · ');
    return reply(res, 200, {
      ok: true,
      saved: days.some((d) => d.saved),
      // The single-day fields stay for older shortcuts that read them.
      steps: days[0].steps,
      date: days[0].date,
      days,
      message,
    });
  } catch (err) {
    console.error('[api/steps]', err);
    return reply(res, 500, { ok: false, message: 'שגיאה בשרת, נסה שוב' });
  }
}
