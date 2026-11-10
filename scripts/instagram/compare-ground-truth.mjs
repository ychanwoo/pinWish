// Offline evaluation only. Never imported by the app or extraction pipeline.
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '')
export function compareGroundTruth(report, sample) {
  const places = report.result?.places ?? []
  const rows = sample.expected.map(expected => {
    const found = places.filter(p => p.slides.includes(expected.slide))
    const aliases = [expected.heading, ...expected.aliases].map(normalize)
    return { slide: expected.slide, expected: expected.heading, actual: found.map(p => p.name),
      headingMatch: found.length === 1 && normalize(found[0].name) === normalize(expected.heading),
      identityMatch: found.length === 1 && aliases.includes(normalize(found[0].name)),
    }
  })
  const unexpected = places.filter(p => p.slides.some(slide => !sample.expected.some(e =>
    e.slide === slide && [e.heading, ...e.aliases].map(normalize).includes(normalize(p.name)))))
  const ignoredMatch = JSON.stringify([...(report.result?.ignoredSlides ?? [])].sort((a,b) => a-b)) === JSON.stringify(sample.ignoredSlides)
  const identityMatches = rows.filter(r => r.identityMatch).length
  return { shortcode: sample.shortcode, modelId: report.modelId, expectedHeadings: rows.length,
    headingMatches: rows.filter(r => r.headingMatch).length, identityMatches,
    ignoredSlidesMatch: ignoredMatch, unexpectedCandidates: unexpected.map(p => ({ name: p.name, slides: p.slides })),
    passed: report.fetchedImages === sample.slideCount && identityMatches === rows.length && ignoredMatch && unexpected.length === 0,
    scope: 'These manually reviewed samples only; not general accuracy or coordinate validation.', rows }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const truth = JSON.parse(await readFile(new URL('../../docs/validation/instagram-ground-truth.json', import.meta.url), 'utf8'))
  const reports = []
  for (const path of process.argv.slice(2)) {
    const report = JSON.parse(await readFile(path, 'utf8'))
    const sample = truth.samples.find(s => s.shortcode === report.shortcode)
    if (!sample || !report.result) throw new Error('A successful report for a reviewed sample is required')
    reports.push({ file: path, ...compareGroundTruth(report, sample) })
  }
  console.log(JSON.stringify(reports, null, 2))
  if (!reports.length || reports.some(r => !r.passed)) process.exitCode = 1
}
