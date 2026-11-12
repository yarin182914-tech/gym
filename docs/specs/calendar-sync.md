# חיבור ליומן גוגל
Milestone: M7 · Branch: feature/m7-calendar · Status: built
Requested by ירין on 2026-11-12: "בוא נעבוד על פי מפת הדרכים... כן, M7"

## למה (הבעיה)
משימה עם שעה חיה היום רק בג׳ימי. כדי לראות אותה ליד שאר היום צריך לרשום אותה שוב ביומן, ואז כשמזיזים אותה יש שני מקומות לעדכן.

## מה זה עושה (במשפט אחד)
משימה עם יום או עם שעה נכנסת לבד ליומן גוגל הראשי, וזזה, מסומנת ✓ או נמחקת יחד עם המשימה.

## איך זה נראה
**כרטיס "יומן גוגל" בדף "חיבורים"** (במקום הכרטיס האפור "בקרוב"):
- **לא מחובר:** שורת הסבר "משימות עם יום או שעה נכנסות ליומן שלך", כפתור "חיבור היומן".
- **מחובר:** "מחובר · <כתובת המייל>", "סנכרון אחרון: היום 18:02", וכפתור קטן "ניתוק".
- **צריך לחבר מחדש** (גוגל ביטל את האישור): שורה אפורה "החיבור פג. חיבור מחדש" עם אותו כפתור. לא אדום.
- **השרת עוד לא מוגדר:** הכרטיס נשאר אפור "בקרוב".
- **מצב `?dev`:** הכרטיס מוצג כ"מחובר (הדגמה)", ואפשר ללחוץ "ניתוק" ו"חיבור היומן" כדי לראות את שני המצבים. שום דבר לא נשלח לגוגל.

צילומים: `img/calendar-card-connect-bright.png`, `img/calendar-card-connected-dark.png`, `img/calendar-task-icon-dark.png`.

**במשימות:** משימה שיש לה אירוע ביומן מקבלת סמל יומן קטן בשורה שלה. אין מסך חדש ואין שאלה בזמן השמירה.

**ביומן גוגל:**
- משימה עם שעה: אירוע בשעה הזאת. האורך לפי גודל המשימה (קטנה 15 דק׳, בינונית שעה, גדולה שעתיים).
- משימה עם יום בלי שעה: אירוע של יום שלם.
- שם האירוע = שם המשימה. בתיאור: "נוצר מג׳ימי" וקישור לאפליקציה.
- בוצעה: השם הופך ל"✓ <שם>". ביטול הסימון מוריד את ה-✓.

## זרימה
1. "חיבורים" → "חיבור היומן" → מסך האישור של גוגל (פעם אחת) → חוזרים לג׳ימי, הכרטיס מראה "מחובר".
2. מיד אחרי החיבור: כל המשימות הפתוחות שיש להן יום או שעה מהיום והלאה נכנסות ליומן.
3. שומרים משימה עם יום או שעה → האירוע נוצר תוך שניות.
4. מזיזים / דוחים → אותו אירוע זז. לא נוצר כפול.
5. מסמנים "בוצע" → ✓ בשם האירוע.
6. מוחקים את המשימה, מעבירים ל"מתישהו" או מורידים לה את היום → האירוע נמחק.
7. בלי רשת: המשימה נשמרת כרגיל, והיומן מתעדכן בפעם הבאה שהאפליקציה נפתחת עם רשת.
8. "ניתוק": ג׳ימי מפסיק לכתוב ליומן. האירועים שכבר שם נשארים.

## חוקים ומספרים
`CALENDAR` in `js/lib/rules.js`:
- `durationMin: { S: 15, M: 60, L: 120 }` — event length by task size.
- `connectSyncMax: 50` — at most this many open tasks pushed right after connecting.
- `batchSize: 20` — task ids the server takes in one request.
- `retryMax: 60` — pending task ids kept on the device for retry.
- `syncDelayMs: 1500` — a burst of saves goes out as one request.
- `appUrl` — the link written in the event description.

Rules:
- Only one-off tasks (`type: 'once'`) with `timing` `exact` (timed event) or `day` (all-day event). `week`, `claude`, no timing, daily and recurring tasks: no event.
- ג׳ימי touches only events it created (private extended property `gymi=true` + `taskId`); before deleting it checks the mark.
- Marking done changes only the event's name, so an event moved by hand in the calendar stays where it was put.
- An event deleted by hand in the calendar is not recreated until the task's day or time changes.
- The calendar must belong to the Google account the user signs in to ג׳ימי with (another account is refused with a Hebrew message).
- Each task has its own fixed event id (`sha256(uid:taskId)`), so a request sent twice never makes two events.
- A calendar failure never blocks or changes the task itself, and shows nothing red.

## Data (Firestore)
- `users/{uid}/tasks/{id}` (existing):
  - `calendarEventId` string | null — now written by the server.
  - `calendarSync` string | null — new. Signature of what was last sent (`<start>|<end>#<event name>`), so an unchanged task costs no Google call. Missing on old docs = `null`. Server only.
  - The server does not touch `updatedAt` when writing these two.
- `users/{uid}` (existing doc), new map `calendar`: `{ connected: boolean, email: string, connectedAt: Timestamp, lastSyncAt: Timestamp | null, needsReconnect: boolean }`. Missing = not connected. Server writes, app reads.
- `calendarTokens/{uid}` — new top-level collection, **server only**: `{ refreshToken, scope, createdAt }`. No rule matches it, so every client read/write is denied (firebase-admin bypasses rules). No `firestore.rules` change.

## Server / outside the app
- `api/calendar.js` — one endpoint:
  - `POST { action: 'start' }` (Firebase ID token in `Authorization`) → the Google consent URL (`access_type=offline`, `prompt=consent`, scope `calendar.events` + `email`), `state` signed with HMAC and short-lived.
  - `GET ?code&state` (Google's redirect) → exchanges the code, stores the refresh token, sets `users/{uid}.calendar`, redirects to `/#/connections`.
  - `POST { action: 'sync', taskIds: [...] }` → for each task: create / patch / delete its event, write `calendarEventId` + `calendarSync`.
  - A deleted task goes through the same `sync`: its event is found by the task's fixed event id. A linked event with another id is deleted only if it carries the `gymi=true` mark.
  - `POST { action: 'status' }` → `{ configured, calendar }` for the card.
  - `POST { action: 'disconnect' }` → revokes the token, deletes `calendarTokens/{uid}`, `calendar.connected = false`.
- `api/_lib/calendar.js` — consent link, token refresh + Calendar REST calls with `fetch` (no new npm dependency). `invalid_grant` → `calendar.needsReconnect = true`.
- `api/_lib/calendar-events.js` — which calls to make for a task; no Firebase, tested by `tools/test-calendar-sync.mjs` against a pretend calendar.
- `js/lib/calendar-sync.js` — the app's side: the retry list in localStorage, sent after Firestore has the save.
- `sw.js` — the service worker leaves `/api/` requests alone.
- `js/lib/calendar-event.js` — pure: task → `{ action, event, signature }`. Shared by server and tests (`tools/test-calendar-event.mjs`).
- The Claude connector (`api/_lib/tools.js`) has no task tools yet. The sync is one server function (`syncTasks(uid, taskIds)`), so those tools call it when they are added.
- ID-token check with `firebase-admin/auth` (already a dependency).
- **Env vars in Vercel (ירין, before testing):** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Production and Preview.
- **Google Cloud console (ירין, once, project `gym-site-ea1b7`):** enable the Google Calendar API; create an OAuth "Web application" client with redirect URIs `https://gym-yarin9.vercel.app/api/calendar` and the branch preview's `…/api/calendar`; set the consent screen to "In production" (in "Testing" Google expires the connection every 7 days). Until Google verifies the app, the consent screen shows an "unverified app" warning and is capped at 100 users — enough for the pilot.
- `firestore.rules`: no change.

## לא בגרסה הזאת
- אירוע שהוזז ידנית ביומן לא מעדכן את המשימה בג׳ימי (קלוד עושה את זה בבדיקת הערב).
- אימונים, הרגלים ותאריכי החלטה ביומן.
- משימות שקלוד מוסיף דרך החיבור שלו: לחיבור של קלוד עוד אין כלי משימות. כשיתווספו, הם ישתמשו באותו סנכרון.
- משימות יומיות וחוזרות, ומשימות "השבוע".
- יומן נפרד, בחירת יומן, תזכורות מותאמות (נשארת ברירת המחדל של היומן).
- אימות האפליקציה אצל גוגל (לפני יותר מ-100 משתמשים).

## הגדרת "גמור"
- חיבור פעם אחת מהאייפון; אחרי יום האפליקציה עדיין מחוברת בלי לאשר שוב.
- משימה עם שעה → אירוע באורך הנכון; משימה עם יום → אירוע של יום שלם.
- הזזה מזיזה את אותו אירוע (אין כפול); "בוצע" מוסיף ✓; מחיקה מוחקת.
- שמירה במצב טיסה: המשימה נשמרת, והאירוע מופיע אחרי פתיחה עם רשת.
- אירוע אחר ביומן (שלא מג׳ימי) לא משתנה אף פעם.
- `tools/test-calendar-event.mjs` covers: exact / day / no event, duration by size, done title, signature unchanged → skip, Israel time across the DST change.
- DATA.md documents `calendarSync`, `users/{uid}.calendar` and `calendarTokens`.
- הכרטיס והסמל קריאים ב-DARK, ב-BRIGHT ובכל ערכה אקראית.

## שאלות פתוחות
- לא נבדק מול גוגל אמיתי לפני ההגדרה של ירין: כל הזרימה (אישור, יצירה, הזזה, ✓, מחיקה) נבדקה רק מול יומן מדומה בבדיקות. הבדיקה האמיתית היא על ה-preview אחרי ההגדרה.
- משימה שנכתבה מבחוץ (לא דרך האפליקציה) נכנסת ליומן רק בשמירה הבאה שלה באפליקציה.
- האם חזרה ממסך האישור של גוגל נוחתת בתוך האפליקציה המותקנת באייפון או בספארי — ייבדק על המכשיר; החיבור עצמו נשמר בשני המקרים.
