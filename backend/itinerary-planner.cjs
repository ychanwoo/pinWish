const weekdays = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const bad = (message) => {
  throw Object.assign(new Error(message), { status: 400 })
}
const minutes = (value) => {
  if (!/^\d{2}:\d{2}$/.test(value ?? '')) bad('invalid_trip_time')
  const [h, m] = value.split(':').map(Number)
  if (h > 23 || m > 59) bad('invalid_trip_time')
  return h * 60 + m
}
const datePlus = (date, n) =>
  new Date(Date.parse(date + 'T12:00:00Z') + n * 86400000)
    .toISOString()
    .slice(0, 10)
function validDate(date) {
  return (
    typeof date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date
  )
}
function hoursFromAWS(hours) {
  // Multiple schedules can describe separate departments. Never combine them blindly.
  if (
    !Array.isArray(hours) ||
    hours.length !== 1 ||
    !hours[0].Components?.length
  )
    return {
      status: 'unknown',
      display: (hours ?? []).flatMap((h) => h.Display ?? []).slice(0, 14),
      windows: [],
    }
  const windows = []
  for (const c of hours[0].Components) {
    const time = /^T(\d{2})(\d{2})(\d{2})$/.exec(c.OpenTime ?? '')
    const duration =
      /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
        c.OpenDuration ?? '',
      )
    const recurrence =
      /^FREQ:(?:DAILY|WEEKLY)(?:;BYDAY:((?:MO|TU|WE|TH|FR|SA|SU)(?:,(?:MO|TU|WE|TH|FR|SA|SU))*))?$/.exec(
        c.Recurrence ?? '',
      )
    if (
      !time ||
      !duration ||
      !recurrence ||
      +time[1] > 23 ||
      +time[2] > 59 ||
      +time[3] !== 0
    )
      return { status: 'unknown', display: hours[0].Display ?? [], windows: [] }
    const length =
      (+duration[1] || 0) * 1440 +
      (+duration[2] || 0) * 60 +
      (+duration[3] || 0)
    if (length <= 0 || length > 1440 || (+duration[4] || 0) !== 0)
      return { status: 'unknown', display: hours[0].Display ?? [], windows: [] }
    const start = +time[1] * 60 + +time[2]
    for (const day of recurrence[1]?.split(',') ?? weekdays)
      windows.push({ day: weekdays.indexOf(day), start, end: start + length })
  }
  return { status: 'available', display: hours[0].Display ?? [], windows }
}
function localISO(date, minute, zone) {
  const target = Date.parse(date + 'T00:00:00Z') + minute * 60000
  let value = target
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(
      fmt.formatToParts(new Date(value)).map((p) => [p.type, p.value]),
    )
    const represented = Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`,
    )
    const delta = target - represented
    if (!delta) return new Date(value).toISOString()
    value += delta
  }
  bad('invalid_local_time')
}
function visitEstimate(categories = []) {
  const s = categories
    .map((c) => c.Name ?? c.Id ?? '')
    .join(' ')
    .toLowerCase()
  if (/theme park|amusement|zoo/.test(s)) return 300
  if (/museum|gallery|aquarium/.test(s)) return 120
  if (/park|beach|garden/.test(s)) return 120
  if (/restaurant/.test(s)) return 90
  if (/coffee|cafe|bakery/.test(s)) return 45
  return 60
}
function settingsFor(input, places) {
  if (!input || !validDate(input.date)) bad('invalid_trip_date')
  const start = minutes(input.start),
    end = minutes(input.end)
  if (start < 360 || end > 1380 || end - start < 120 || end - start > 840)
    bad('invalid_trip_day')
  if (!['Car', 'Pedestrian'].includes(input.mode)) bad('invalid_trip_mode')
  if (!Number.isInteger(input.days) || input.days < 0 || input.days > 7)
    bad('invalid_trip_days')
  if (
    !Array.isArray(input.stops) ||
    input.stops.length < 3 ||
    input.stops.length > 20 ||
    new Set(input.stops.map((s) => s.id)).size !== input.stops.length
  )
    bad('select_three_to_twenty_places')
  const stops = input.stops.map((s) => {
    if (
      !places.some((p) => p.id === s.id) ||
      !Number.isInteger(s.duration) ||
      s.duration < 15 ||
      s.duration > 600
    )
      bad('invalid_visit_duration')
    let manual
    if (s.manual) {
      const a = minutes(s.manual.open),
        b = minutes(s.manual.close)
      if (
        b <= a ||
        !Array.isArray(s.manual.days) ||
        !s.manual.days.length ||
        s.manual.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
      )
        bad('invalid_manual_hours')
      manual = {
        open: s.manual.open,
        close: s.manual.close,
        days: [...new Set(s.manual.days)],
      }
    }
    return { id: s.id, duration: s.duration, ...(manual ? { manual } : {}) }
  })
  return {
    date: input.date,
    start: input.start,
    end: input.end,
    days: input.days,
    mode: input.mode,
    order: input.order === 'manual' ? 'manual' : 'recommended',
    stops,
  }
}
function windowsOn(place, stop, date) {
  const day = new Date(date + 'T12:00:00Z').getUTCDay()
  if (stop.manual)
    return stop.manual.days.includes(day)
      ? [{ start: minutes(stop.manual.open), end: minutes(stop.manual.close) }]
      : []
  if (place.hours.status !== 'available') return null
  return place.hours.windows
    .flatMap((w) =>
      w.day === day
        ? [{ start: w.start, end: Math.min(w.end, 1440) }]
        : w.day === (day + 6) % 7 && w.end > 1440
          ? [{ start: 0, end: w.end - 1440 }]
          : [],
    )
    .sort((a, b) => a.start - b.start)
}
function scheduleOnce(places, matrix, settings, dailyLimit = Infinity) {
  let remaining = settings.stops.map((s) => ({ ...s })),
    last = null
  const days = [],
    unscheduled = [],
    start = minutes(settings.start),
    end = minutes(settings.end),
    max = settings.days || 7
  const rank = (a, b) =>
    b.visiting - a.visiting ||
    b.stops.length - a.stops.length ||
    a.clock - b.clock ||
    a.travel - b.travel
  for (let n = 0; n < max && remaining.length; n++) {
    const date = datePlus(settings.date, n)
    let frontier = [
        { remaining, stops: [], clock: start, last, visiting: 0, travel: 0 },
      ],
      best = frontier[0]
    // Bounded beam search compares different first stops instead of always taking
    // the shortest visit, which can unnecessarily turn a one-day trip into two.
    for (
      let depth = 0;
      depth < Math.min(remaining.length, dailyLimit);
      depth++
    ) {
      const next = []
      for (const state of frontier) {
        const candidates =
          settings.order === 'manual'
            ? state.remaining.slice(0, 1)
            : state.remaining
        for (const stop of candidates) {
          const p = places.find((p) => p.id === stop.id),
            windows = windowsOn(p, stop, date) ?? [{ start, end }]
          const travel =
            state.last === null
              ? 0
              : matrix[places.findIndex((p) => p.id === state.last)]?.[
                  places.indexOf(p)
                ]
          if (
            travel === null ||
            travel === undefined ||
            !Number.isFinite(travel)
          )
            continue
          const arrival = state.clock + travel + (state.last === null ? 0 : 10)
          for (const w of windows) {
            let at = Math.max(arrival, w.start)
            if (at < 780 && at + stop.duration > 720) at = 780
            if (at + stop.duration > Math.min(w.end, end)) continue
            const entry = {
              id: p.id,
              name: p.name,
              address: p.address,
              coordinates: p.coordinates,
              arrival: at,
              departure: at + stop.duration,
              duration: stop.duration,
              travel,
              wait: at - arrival,
              hoursSource: stop.manual
                ? 'manual'
                : p.hours.status === 'available'
                  ? 'provider'
                  : 'unknown',
              hours: stop.manual
                ? [`${stop.manual.open}–${stop.manual.close} (user confirmed)`]
                : p.hours.status === 'available'
                  ? p.hours.display
                  : [
                      'Opening hours unavailable. Check access before visiting.',
                    ],
            }
            const candidate = {
              remaining: state.remaining.filter((s) => s.id !== stop.id),
              stops: [...state.stops, entry],
              clock: entry.departure,
              last: p.id,
              visiting: state.visiting + stop.duration,
              travel: state.travel + travel,
            }
            next.push(candidate)
            if (rank(candidate, best) < 0) best = candidate
            break
          }
        }
      }
      if (!next.length) break
      next.sort(rank)
      const seen = new Set()
      frontier = next
        .filter((s) => {
          const key = [s.last, ...s.remaining.map((p) => p.id).sort()].join('|')
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        .slice(0, 32)
    }
    remaining = best.remaining
    last = best.last
    days.push({ date, stops: best.stops })
  }
  while (days.length && !days.at(-1).stops.length) days.pop()
  for (const s of remaining) {
    const p = places.find((p) => p.id === s.id)
    unscheduled.push({
      id: s.id,
      name: p.name,
      reason:
        'This visit does not fit the available dates, opening hours or routes. Extend your daily hours or trip, shorten the visit, or change the start date.',
    })
  }
  return {
    days,
    unscheduled,
    complete: unscheduled.length === 0,
    dayCount: days.length,
    nights: Math.max(0, days.length - 1),
  }
}
// Keep every feasible stop first; then compare lighter daily loads without
// adding days or sacrificing a stop. Confirmed hours and routes remain constraints.
function schedule(places, matrix, settings) {
  let best = scheduleOnce(places, matrix, settings)
  const imbalance = (plan) => {
    const loads = plan.days.map((d) =>
      d.stops.reduce((n, s) => n + s.duration + s.travel, 0),
    )
    if (!loads.length) return Infinity
    const mean = loads.reduce((a, b) => a + b, 0) / loads.length
    return loads.reduce((n, v) => n + (v - mean) ** 2, 0) / loads.length
  }
  if (best.complete && best.dayCount > 1 && settings.order !== 'manual') {
    const limit = Math.ceil(settings.stops.length / best.dayCount)
    for (
      let cap = limit;
      cap < Math.max(...best.days.map((d) => d.stops.length));
      cap++
    ) {
      const candidate = scheduleOnce(
        places,
        matrix,
        { ...settings, days: best.dayCount },
        cap,
      )
      if (
        candidate.complete &&
        candidate.dayCount <= best.dayCount &&
        imbalance(candidate) < imbalance(best)
      )
        best = candidate
    }
  }
  return best
}
module.exports = {
  hoursFromAWS,
  localISO,
  visitEstimate,
  settingsFor,
  schedule,
  windowsOn,
  minutes,
  datePlus,
}
