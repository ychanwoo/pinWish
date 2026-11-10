// Explicit live checks, not part of CI. Uses AWS through the loopback API; charges apply.
// Ground-truth English aliases are MANUAL query refinements for this validation only.
import { readFile, writeFile } from 'node:fs/promises'
if (process.env.PINWISH_RUN_LIVE_PLACE_TESTS !== '1') throw new Error('Set PINWISH_RUN_LIVE_PLACE_TESTS=1 to run billable live checks')
const truth = JSON.parse(await readFile(new URL('../../docs/validation/instagram-ground-truth.json', import.meta.url), 'utf8'))
async function post(path, payload) {
  const r = await fetch(`http://127.0.0.1:8787/api/places/${path}`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload), signal:AbortSignal.timeout(20000) })
  return { status:r.status, ...await r.json() }
}
const clean = match => { const { selectionToken: _selectionToken, ...rest } = match; return rest }
const rows = []
for (const expected of truth.samples.find(s => s.shortcode === 'DfFCMjzk02S').expected) {
  const original = await post('search',{query:expected.heading,region:'Los Angeles, California',countryCode:'US'})
  // Record both original and refined responses, including unexpected/irrelevant matches.
  const refined = await post('search',{query:expected.aliases[0],region:'Los Angeles, California',countryCode:'US'})
  const selected = refined.matches?.[0]
  const detail = selected ? await post('details',{selectionToken:selected.selectionToken}) : null
  rows.push({slide:expected.slide,sourceName:expected.heading,manualEnglishQuery:expected.aliases[0],
    originalStatus:original.status,originalMatches:original.matches?.map(clean) ?? [],
    refinedStatus:refined.status,refinedMatches:refined.matches?.map(clean) ?? [],
    detailStatus:detail?.status,detail:detail?.place ?? null,error:refined.code ?? detail?.code ?? null,
    note:'Top match fetched for inspection only; not automatically user-confirmed or saved.'})
}
const korea = []
for(const e of truth.samples.find(s=>s.shortcode==='De1gmWjkwEd').expected) korea.push({slide:e.slide,sourceName:e.heading,
  ...await post('search',{query:e.heading,region:'동해',countryCode:'KR'})})
const unfilteredKorea = await post('search',{query:'묵호다방',region:'동해 대한민국',countryCode:''})
const report = {checkedAt:new Date().toISOString(),method:'Live loopback API calling Amazon Location V2 with existing server AWS credentials',
  automaticConfirmation:false,la:rows,korea,unfilteredKorea};
await writeFile(new URL('../../docs/validation/place-search-live.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({la:rows.map(r=>({slide:r.slide,original:r.originalMatches.map(p=>p.name),refined:r.refinedMatches.map(p=>p.name),detailStatus:r.detailStatus})),korea:korea.map(r=>({slide:r.slide,status:r.status,code:r.code}))},null,2))
