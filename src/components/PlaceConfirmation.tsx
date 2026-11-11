import { processingRequest } from '../lib/processing-api'
import { useEffect, useRef, useState } from 'react'
import { confirmPlace, isPlaceDetails, isPlaceSearchResponse, placeSearchErrors,
  type CandidateLocationDraft, type ConfirmedPlace, type LocationTarget, type PlaceMatch } from '../lib/place-search'

interface Props {
  candidateNumber: number
  source: ConfirmedPlace['source']
  initialRegion: string
  value?: CandidateLocationDraft
  onChange: (value: CandidateLocationDraft) => void
  confirmedIds: string[]
}
function initialLocationDraft(name: string, region: string): CandidateLocationDraft {
  return { targets: [{ id: 'primary', query: name, region, countryCode: '', status: 'pending' }] }
}
export function PlaceConfirmation({ candidateNumber, source, initialRegion, value, onChange, confirmedIds }: Props) {
  const draft = value ?? initialLocationDraft(source.correctedName || source.extractedName, initialRegion)
  const latest = useRef(draft)
  useEffect(() => { latest.current = draft }, [draft])
  const update = (id: string, target: LocationTarget) => onChange({ targets: latest.current.targets.map(t => t.id === id ? target : t) })
  return <details className="place-confirmation">
    <summary>Find and confirm locations · {draft.targets.filter(t => t.status === 'confirmed').length} confirmed</summary>
    {draft.targets.map((target, index) => <LocationSearch key={target.id} target={target}
      label={`Candidate ${candidateNumber}, location ${index + 1}`} source={source} onChange={t => update(target.id, t)}
      confirmedIds={confirmedIds.filter(id => id !== target.confirmed?.placeId)} />)}
    {draft.targets.length < 10 && <button type="button" onClick={() => onChange({ targets: [...latest.current.targets,
      { id: crypto.randomUUID(), query: '', region: initialRegion, countryCode: '', status: 'pending' }] })}>
      Add another location from this photo
    </button>}
  </details>
}

function LocationSearch({ target, source, label, onChange, confirmedIds }: {
  target: LocationTarget; source: ConfirmedPlace['source']; label: string;
  onChange: (target: LocationTarget) => void; confirmedIds: string[]
}) {
  const [matches, setMatches] = useState<PlaceMatch[]>([])
  const [selected, setSelected] = useState<(PlaceMatch & { retrievedAt: string }) | null>(null)
  const [status, setStatus] = useState<'idle' | 'searching' | 'results' | 'details' | 'error'>('idle')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [conversion, setConversion] = useState('')
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const cancel = () => { generation.current += 1; controller.current?.abort() }
  useEffect(() => () => { generation.current += 1; controller.current?.abort() }, [])
  const clear = () => { cancel(); setMatches([]); setSelected(null); setStatus('idle'); setError(''); setNotice(''); setConversion('') }
  const edit = (change: Partial<LocationTarget>) => { clear(); onChange({ ...target, ...change, status: 'pending', confirmed: undefined }) }
  async function request(kind: 'search' | 'details', body: object) {
    cancel()
    const version = generation.current
    const abort = new AbortController(); controller.current = abort
    setStatus(kind === 'search' ? 'searching' : 'details'); setError(''); setNotice(''); setSelected(null)
    if (kind === 'search') { setMatches([]); setConversion('') }
    const timeout = setTimeout(() => abort.abort(), 60000)
    try {
      const response = await processingRequest(`/api/places/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: abort.signal })
      const data = await response.json()
      if (generation.current !== version) return
      if (!response.ok) throw new Error(placeSearchErrors[data?.code] ?? 'Place lookup is unavailable. Your input is kept; try again.')
      if (kind === 'search') {
        if (!isPlaceSearchResponse(data)) throw new Error('The search response could not be verified. Try again.')
        setMatches(data.matches)
        const converted = data.queryConversion
        setConversion(converted?.status === 'translated'
          ? `English search: ${converted.searchQuery}${converted.searchRegion ? ` · ${converted.searchRegion}` : ''}. Original text is preserved. Check the address before confirming.`
          : converted && ['needs_review', 'unavailable'].includes(converted.status)
            ? 'Automatic English conversion could not be verified. Searched your original text; edit the search name in English and retry if needed.' : '')
        setNotice(data.unsupportedCountries.includes('KR')
          ? placeSearchErrors.unsupported_country
          : data.matches.length === 0 ? 'No matching detailed places found. Try an English name, a street address, or a more specific region.'
          : data.excludedResults > 0 ? 'Broad regions or incomplete locations were excluded. Review the remaining matches.' : '')
      } else {
        if (!isPlaceDetails(data)) throw new Error('The place details could not be verified. Search again.')
        const token = (body as { selectionToken: string }).selectionToken
        const match = matches.find(m => m.selectionToken === token)
        if (!match || match.placeId !== data.place.placeId || match.countryCode !== data.place.countryCode) throw new Error('The selected place changed. Search again.')
        setSelected(data.place)
      }
      setStatus('results')
    } catch (failure) {
      if (generation.current !== version) return
      setStatus('error')
      setError(abort.signal.aborted ? placeSearchErrors.places_timeout
        : failure instanceof Error && !(failure instanceof TypeError) && !(failure instanceof SyntaxError)
          ? failure.message : 'Cannot reach the place-search API. Start npm run dev:api and try again.')
    } finally { clearTimeout(timeout) }
  }
  if (target.status === 'skipped') return <section aria-label={label} className="location-target">
    <p>Skipped: {target.query || source.extractedName}</p>
    <button type="button" onClick={() => edit({})}>Review again</button>
  </section>
  if (target.status === 'confirmed' && target.confirmed) return <section aria-label={label} className="location-target confirmed-location">
    <strong>{target.confirmed.displayName}</strong>
    <p>{target.confirmed.address}</p><p>{target.confirmed.countryName} ({target.confirmed.countryCode})</p>
    <p role="status">Location confirmed for this session. Not saved to the map.</p>
    <button type="button" onClick={() => edit({})}>Change location</button>
  </section>
  const busy = status === 'searching' || status === 'details'
  return <section aria-label={label} className="location-target" onKeyDown={event => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault()
      if (!busy && target.query.trim()) void request('search', { query: target.query, region: target.region, countryCode: target.countryCode })
    }
  }}>
    <label>Search place name<input className="link-input" value={target.query} maxLength={200}
      onChange={e => edit({ query: e.target.value })} /></label>
    <label>City or region<input className="link-input" value={target.region} maxLength={200}
      onChange={e => edit({ region: e.target.value })} /></label>
    <label>Country filter<select value={target.countryCode} onChange={e => edit({ countryCode: e.target.value })}>
      <option value="">Any country</option><option value="US">United States</option><option value="KR">South Korea (not supported)</option>
      <option value="CA">Canada</option><option value="JP">Japan</option><option value="GB">United Kingdom</option><option value="FR">France</option>
    </select></label>
    <div className="location-actions">
      <button type="button" disabled={!target.query.trim() || busy} onClick={() => void request('search', {
        query: target.query, region: target.region, countryCode: target.countryCode,
      })}>{status === 'searching' ? 'Searching…' : 'Search locations'}</button>
      {busy && <button type="button" onClick={clear}>Cancel search</button>}
      <button type="button" onClick={() => { clear(); onChange({ ...target, status: 'skipped', confirmed: undefined }) }}>Skip location</button>
    </div>
    {busy && <p role="status">{status === 'searching' ? 'Preparing search and finding locations…' : 'Checking selected place details…'}</p>}
    {error && <p role="alert">{error}</p>}
    {conversion && <p role="status" className="query-conversion">{conversion}</p>}
    {notice && <p role="status">{notice}</p>}
    {matches.length > 0 && <ul className="location-matches" aria-label="Location matches">{matches.map(match => <li key={match.placeId}>
      <strong>{match.name}</strong><p>{match.address}</p><p>{match.countryName} ({match.countryCode}) · {match.placeType}</p>
      <button type="button" disabled={busy} onClick={() => void request('details', { selectionToken: match.selectionToken })}>Select {match.name}</button>
    </li>)}</ul>}
    {selected && <div className="selected-location">
      <strong>Check this location before confirming</strong><p>{selected.name}</p><p>{selected.address}</p>
      <p>{selected.countryName} ({selected.countryCode})</p>
      <p>{selected.coordinates.latitude.toFixed(5)}, {selected.coordinates.longitude.toFixed(5)}</p>
      {['Street', 'InterpolatedAddress', 'Intersection'].includes(selected.placeType) && <p>This is a street or approximate address position, not an exact venue entrance.</p>}
      {confirmedIds.includes(selected.placeId) && <p role="alert">This place is already confirmed in this import. Choose another match or skip this location.</p>}
      <button type="button" disabled={confirmedIds.includes(selected.placeId)} onClick={() => {
        if (confirmedIds.includes(selected.placeId)) return
        onChange({ ...target, status: 'confirmed', confirmed: confirmPlace(selected, source) })
      }}>Confirm this location</button>
    </div>}
    {(matches.length > 0 || selected) && <small>Place data: Amazon Location Service. Confirm the intended branch and address.</small>}
  </section>
}
