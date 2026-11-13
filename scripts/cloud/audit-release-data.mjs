// Read-only fingerprints: no user names, tokens or record contents are written.
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { aws, configuration } from './aws-util.mjs'
const mode = process.argv[2]
if (!['before', 'after'].includes(mode)) throw Error('Use before or after')
const { outputs } = configuration()
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v
const hash = (v) => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')
const items = aws(['dynamodb','scan','--table-name',outputs.TableName,'--consistent-read']).Items ?? []
const records = Object.fromEntries(items.filter(x => x.pk.S.startsWith('USER#') && !/^(TRIPCTX|TRIPMATRIX|TRIPPREVIEW)/.test(x.sk.S)).map(x => [hash([x.pk,x.sk]),hash(x)]))
const accounts = Object.fromEntries((aws(['cognito-idp','list-users','--user-pool-id',outputs.UserPoolId]).Users ?? []).map(x=>[hash(x.Username),hash(x)]))
const photos = Object.fromEntries((aws(['s3api','list-objects-v2','--bucket',outputs.PhotoBucketName,'--prefix','photos/']).Contents ?? []).map(x=>[hash(x.Key),hash([x.ETag,x.Size])]))
await mkdir('infra/generated',{recursive:true})
const path='infra/generated/release-data-before.json'
if(mode==='before') {
  await writeFile(path,JSON.stringify({records,accounts,photos}),{mode:0o600,flag:'wx'})
  console.log(JSON.stringify({baseline:true,records:Object.keys(records).length,accounts:Object.keys(accounts).length,photos:Object.keys(photos).length}))
} else {
 const before=JSON.parse(await readFile(path));const result={checkedAt:new Date().toISOString()}
 for(const [name,current] of Object.entries({records,accounts,photos})) {
  result[name]={before:Object.keys(before[name]).length,after:Object.keys(current).length,changedOrMissing:Object.entries(before[name]).filter(([k,v])=>current[k]!==v).length,added:Object.keys(current).filter(k=>!(k in before[name])).length}
 }
 await writeFile('infra/generated/release-data-after.json',JSON.stringify(result,null,2))
 console.log(JSON.stringify(result,null,2))
 if(Object.values(result).some(x=>x.changedOrMissing||x.added)) process.exitCode=1
}
