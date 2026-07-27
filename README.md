# מעקב אימונים — Gym Tracker

אפליקציית מעקב אימונים אישית: תיעוד אימונים בזמן אמת (שעון אימון, סטופר מנוחה, סטים לפי סוג ומשקל), היסטוריה, גרפי התקדמות, מעקב תזונה, ותוכנית אימונים+תזונה שסופרת לאחור לתאריך החתונה.

## טכנולוגיה

- HTML/CSS/JS פשוטים (ללא build step) — Firebase JS SDK נטען כ-ES modules ישירות מ-CDN.
- **Firebase**: Authentication (Google sign-in), Firestore (מסד נתונים בענן עם סנכרון בין מכשירים), Hosting.
- **Chart.js** (יתווסף בשלב 2) לגרפי התקדמות.

## הרצה מקומית

אין צורך ב-build. אפשר לפתוח עם שרת סטטי כלשהו, למשל:

```bash
firebase emulators:start --only hosting
```

או `firebase serve`.

## פריסה (Deploy)

```bash
firebase deploy
```

## הגדרה ראשונית (חד-פעמי)

1. `firebase login` — התחברות עם חשבון Google.
2. יצירת פרויקט Firebase (Auth + Firestore + Hosting מופעלים).
3. העתקת פרטי הקונפיגורציה אל `js/firebase-config.js`.
4. `firebase deploy` לפרסום.

## מבנה הפרויקט

```
index.html                # מעטפת: ניווט + מסך התחברות
css/style.css              # כל העיצוב, כולל משתני עיצוב (טוקנים)
js/firebase-config.js      # אתחול Firebase SDK
js/auth.js                 # התחברות/התנתקות, מעקב מצב משתמש
js/app.js                  # נקודת הכניסה — מחבר ניווט, התחברות, ומסכים
js/lib/                    # פונקציות עזר: גישה ל-Firestore, טיימרים, פורמט
js/pages/                  # כל מסך באפליקציה
```
