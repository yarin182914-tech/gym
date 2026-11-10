// Edge cases for the sleep rules (js/lib/sleep.js). No libraries:
//   node tools/test-sleep.mjs
// Exits non-zero if any case fails. Runs in Israel time, like the app.
//
// Dates: 2026-11-09 is a Monday. A night is keyed by its morning; the
// rules follow its evening — morning Fri 13th = Thursday night (flexible).

process.env.TZ = 'Asia/Jerusalem';

const {
  buildNight, evaluateNight, nightGrade, sleepSettings, sleepStreak, sleepSeries, minutesAfterSix, clockFromMinutesAfterSix,
} = await import('../js/lib/sleep.js');

const settings = sleepSettings({}); // the defaults: 22:30 / 23:00, wake 06:30, 8h, Thu+Fri flexible

let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        got      ${a}`);
  }
}

function night(morning, bed, wake) {
  const n = buildNight(morning, bed, wake);
  if (!n) throw new Error(`invalid night ${morning} ${bed}→${wake}`);
  return n;
}

const judge = (n) => {
  const { onTime, duration, flexible } = evaluateNight(n, settings);
  return { onTime, duration, flexible };
};

console.log('sleep rules');

// Falling asleep at 00:30: past midnight, on the morning's own date — two
// hours after a 22:30 target is a miss, but 8 hours in bed is full.
{
  const n = night('2026-11-10', '00:30', '08:30');
  check('00:30 bedtime is on the morning date', n.bedtime.getDate(), 10);
  check('00:30 bedtime → 8h', n.durationMin, 480);
  check('00:30 bedtime: late, duration full', judge(n), { onTime: 'miss', duration: 'full', flexible: false });
}

// Thursday night (logged Friday morning) is flexible: no bedtime judgment.
{
  const n = night('2026-11-13', '01:15', '09:15');
  check('Thursday night is flexible, only duration counts', judge(n), { onTime: null, duration: 'full', flexible: true });
  check('flexible night grade', nightGrade(evaluateNight(n, settings)), 'full');
}

// Under 6 hours is always a miss, even asleep on time.
{
  const n = night('2026-11-11', '22:00', '03:30');
  check('5h30 → duration miss', judge(n), { onTime: 'full', duration: 'miss', flexible: false });
  check('5h30 night grades miss', nightGrade(evaluateNight(n, settings)), 'miss');
}

// Bedtime boundaries: 22:30 full, exactly 23:00 close, 23:01 miss.
{
  check('exactly 22:30 → on time', judge(night('2026-11-11', '22:30', '06:30')).onTime, 'full');
  check('exactly 23:00 → close', judge(night('2026-11-11', '23:00', '07:00')).onTime, 'close');
  check('23:01 → miss', judge(night('2026-11-11', '23:01', '07:01')).onTime, 'miss');
}

// Waking after 12:00 on Saturday stays on Saturday (it's not "the evening
// before"): Friday night, asleep 02:00, up 12:30 → 10h30, flexible.
{
  const n = night('2026-11-14', '02:00', '12:30');
  check('Saturday 12:30 wake is on Saturday', [n.wakeTime.getDate(), n.wakeTime.getHours()], [14, 12]);
  check('02:00 → 12:30 is 10h30', n.durationMin, 630);
  check('Friday night lie-in: flexible, full', judge(n), { onTime: null, duration: 'full', flexible: true });
}

// Duration boundaries against the 8h minimum: 7h30 close, 7h29 miss.
{
  check('7h30 → close', judge(night('2026-11-11', '22:30', '06:00')).duration, 'close');
  check('7h29 → miss', judge(night('2026-11-11', '22:30', '05:59')).duration, 'miss');
}

// A wake time before the bedtime isn't a night.
check('wake before bedtime → no night', buildNight('2026-11-11', '05:00', '04:00'), null);

// Streak: counts back from this morning (or yesterday's if not logged yet),
// stopping at the first missed night.
{
  const nights = [
    night('2026-11-09', '22:20', '06:30'), // full
    night('2026-11-08', '22:50', '06:50'), // close
    night('2026-11-07', '01:00', '09:00'), // Friday night, flexible, full
    night('2026-11-06', '23:40', '07:40'), // Thursday night: flexible → full
    night('2026-11-05', '23:40', '07:40'), // Wednesday night: late → miss
  ];
  check('streak of 4, stopping at the late Wednesday', sleepStreak(nights, settings, '2026-11-09'), 4);
  check('this morning not logged yet: streak from yesterday', sleepStreak(nights, settings, '2026-11-10'), 4);
}

// Chart series (js/ui/sleep-trend.js).
{
  check('22:30 is 270 after 18:00', minutesAfterSix(new Date(2026, 10, 9, 22, 30)), 270);
  check('00:15 is 375 after 18:00', minutesAfterSix(new Date(2026, 10, 10, 0, 15)), 375);
  check('375 back to 00:15', clockFromMinutesAfterSix(375), '00:15');
  const nights = [night('2026-11-09', '22:20', '06:30'), night('2026-11-07', '01:00', '09:00')];
  const s = sleepSeries(nights, settings, '2026-11-09', 3);
  check('three mornings, oldest first', s.keys, ['2026-11-07', '2026-11-08', '2026-11-09']);
  check('missing night is null', s.hours, [8, null, 8.2]);
  check('Friday night is flexible, no target', [s.flexible[0], s.target[0]], [true, null]);
  check('logged and on target', [s.logged, s.onTarget], [2, 2]);
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
