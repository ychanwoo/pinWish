export const pinPalette = [
  { color: '#a93426', name: 'Clay' },
  { color: '#426b57', name: 'Pine' },
  { color: '#426782', name: 'Slate blue' },
  { color: '#856044', name: 'Walnut' },
  { color: '#756184', name: 'Heather' },
  { color: '#986334', name: 'Ochre' },
]
export interface PlaceDetails {
  region: { key: string; label: string; context: string; level: string }
  hours: {
    status: 'available' | 'unknown'
    display: string[]
    windows: { day: number; start: number; end: number }[]
  }
  zone: string
  checkedAt: string
  stale: boolean
}
export function collectionColor(key: string, colors: Record<string, string>) {
  const custom = colors[key]
  if (pinPalette.some((p) => p.color === custom)) return custom
  if (key === 'default') return pinPalette[0].color
  let hash = 0
  for (const char of key)
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0
  return pinPalette[hash % pinPalette.length].color
}
export function listedHoursStatus(data: PlaceDetails, now = new Date()) {
  if (data.stale || now.getTime() - Date.parse(data.checkedAt) >= 86400000)
    return 'Hours may be out of date'
  if (data.hours.status !== 'available' || !data.zone) return 'Hours unverified'
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: data.zone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(now)
        .map((p) => [p.type, p.value]),
    )
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
      parts.weekday,
    )
    const minute = +parts.hour * 60 + +parts.minute
    const open = data.hours.windows.some(
      (w) =>
        (w.day === day && minute >= w.start && minute < w.end) ||
        (w.day === (day + 6) % 7 && w.end > 1440 && minute < w.end - 1440),
    )
    return open
      ? 'Open · based on listed hours'
      : 'Closed · based on listed hours'
  } catch {
    return 'Hours unverified'
  }
}
