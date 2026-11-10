import { importErrorCode } from './errors.mjs'
import { extractPlaces } from './extract-places.mjs'
try {
  console.log(JSON.stringify(await extractPlaces(process.argv[2]), null, 2))
} catch (error) {
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), outcome: 'failed', errorType: error.name, reason: importErrorCode(error) }, null, 2))
  process.exitCode = 1
}
