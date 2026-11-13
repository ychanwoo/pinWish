import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { aws, stack } from './aws-util.mjs'
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const {origin,appId,branch}=JSON.parse(await readFile('infra/generated/hosting.json'))
const template=JSON.parse(await readFile('infra/generated/storage.json'))
const scratch=await mkdtemp(join(tmpdir(),'pinwish-release-'))
const result={verifiedAt:new Date().toISOString(),baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),includesUncommittedRouteBoundaryFix:true,includesUncommittedReadRecoveryFix:true,includesUncommittedNullRouteFix:true,origin,frontend:[],backend:[]}
try {
 const archive='infra/generated/web.zip'
 result.frontendArchiveSha256=hash(await readFile(archive))
 const assets=execFileSync('unzip',['-Z1',archive],{encoding:'utf8'}).split('\n').filter(x=>/^assets\/[^/]+\.(js|css)$/.test(x))
 assert.ok(assets.length > 0, 'Deployment archive has no JavaScript/CSS')
 for(const asset of assets) {
  const name=asset.slice('assets/'.length)
  const local=execFileSync('unzip',['-p',archive,asset],{maxBuffer:8*1024*1024}), response=await fetch(origin+'/'+asset)
  assert.ok(response.ok);const remote=Buffer.from(await response.arrayBuffer())
  assert.equal(hash(remote),hash(local),'Hosted asset differs: '+name)
  result.frontend.push({file:name,sha256:hash(local)})
 }
 for(const [id,suffix] of [['Storage','storage'],['Processing','processing'],['Worker','worker'],['Pause','pause']]) {
  const f=aws(['lambda','get-function','--function-name',stack+'-'+suffix])
  const response=await fetch(f.Code.Location);assert.ok(response.ok)
  const path=join(scratch,suffix+'.zip');await writeFile(path,Buffer.from(await response.arrayBuffer()),{mode:0o600})
  const deployed=execFileSync('unzip',['-p',path,'index.js'])
  const expected=template.Resources[id].Properties.Code.ZipFile
    ? Buffer.from(template.Resources[id].Properties.Code.ZipFile)
    : await readFile('infra/generated/processing/index.js')
  assert.equal(hash(deployed),hash(expected),'Runtime differs: '+suffix)
  result.backend.push({function:suffix,sourceSha256:hash(expected),awsCodeSha256:f.Configuration.CodeSha256})
 }
 const jobs=aws(['amplify','list-jobs','--app-id',appId,'--branch-name',branch,'--max-results','1']).jobSummaries
 assert.equal(jobs[0].status,'SUCCEED');result.amplifyJob=jobs[0].jobId
 await writeFile('infra/generated/release-artifact-audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify({frontendFiles:result.frontend.length,backendFunctions:result.backend.length,amplifyJob:result.amplifyJob,matched:true}))
} finally {await rm(scratch,{recursive:true,force:true})}
