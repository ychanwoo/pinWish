// Validation-only source expectations: never imported by application/runtime code.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { expect } from '@playwright/test'
const url='https://www.instagram.com/p/DZ9PJzuj1h5/?img_index=8'
const expected=[
  {source:'센트럴파크',slide:2,name:/^Central Park$/i,box:[-73.99,40.76,-73.94,40.81]},
  {source:'도미노파크',slide:2,name:/^Domino Park$/i,box:[-73.975,40.708,-73.96,40.722]},
  {source:'브루클린 브릿지',slide:6,name:/^Brooklyn Bridge$/i,box:[-74.006,40.699,-73.985,40.714]},
  {source:'맨해튼 브릿지',slide:6,name:/^Manhattan Bridge$/i,box:[-74.001,40.69,-73.975,40.715]},
  {source:'윌리엄스버그',slide:7,name:/^Williamsburg$/i,box:[-73.98,40.69,-73.92,40.735]},
  {source:'타임스퀘어',slide:8,name:/^Times (Square|Sq)$/i,box:[-73.995,40.75,-73.975,40.765]},
  {source:'브로드웨이',slide:10,name:/^(Broadway|Theat(er|re) District.*)$/i,box:[-73.997,40.75,-73.975,40.77]},
  {source:'모마',slide:12,name:/^(The )?Museum of Modern Art$/i,box:[-73.982,40.758,-73.972,40.765]},
  {source:'메트로폴리탄',slide:12,name:/^(The )?Metropolitan Museum of Art$/i,box:[-73.969,40.775,-73.958,40.784]},
  {source:'구겐하임',slide:12,name:/^(Solomon R\.? )?Guggenheim Museum$/i,box:[-73.965,40.778,-73.953,40.787]},
]
export async function validateImportAccuracyBrowser({ page, origin, user, request, jobs, checks }) {
  const report={testedAt:new Date().toISOString(),source:url,expectedNamedPlaces:expected.length,passed:false,places:[],failure:null}
  const progress = []
  const observe = async response => {
    if (response.request().method() !== 'GET' || !new URL(response.url()).pathname.includes('/jobs/')) return
    const body = await response.json().catch(() => null)
    if (body?.progress) progress.push(body.progress)
  }
  page.on('response', observe)
  try {
    await page.setViewportSize({width:1440,height:1000})
    await page.goto(origin+'/?accuracy='+Date.now())
    await page.getByRole('button',{name:'Sign in',exact:true}).first().click()
    const dialog=page.getByRole('dialog')
    await dialog.getByLabel('Email',{exact:true}).fill(user.email)
    await dialog.getByLabel('Password',{exact:true}).fill(user.password)
    await dialog.getByRole('button',{name:'Sign in',exact:true}).last().click()
    await expect(dialog).toHaveCount(0,{timeout:20000})
    await page.locator('.mobile-save').getByRole('button',{name:'Save a place',exact:true}).click()
    await page.getByLabel('Instagram post link',{exact:true}).fill(url)
    const priorJobs=jobs.length
    const started = performance.now()
    await page.getByRole('button',{name:'Find place',exact:true}).click()
    await expect(page.locator('.loading-screen')).toContainText(/\d+ of 13 photos read/,{timeout:60000})
    await page.screenshot({path:'/tmp/pinwish-live-import-progress.png'})
    const deadline = Date.now() + 240000
    while (true) {
      const count = (await request(user.token, '/places')).body.items?.length ?? 0
      if (count === 10) break
      const alert = page.getByRole('alert').first()
      if (await alert.isVisible()) throw new Error('Import failed: ' + await alert.innerText())
      assert.ok(Date.now() < deadline, 'Timed out waiting for ten saved places')
      await page.waitForTimeout(2000)
    }
    await expect(page.getByRole('dialog')).toHaveCount(0,{timeout:30000})
    report.elapsedToSavedMs = Math.round(performance.now() - started)
    report.progress = progress
    assert.ok(progress.some(p => p.stage === 'reading_photos' && p.completed > 0 && p.total === 13))
    const saved=await request(user.token,'/places')
    assert.equal(saved.status,200)
    const records=saved.body.items
    assert.equal(records.length,10)
    assert.equal(new Set(records.map(p=>p.placeId)).size,10)
    for(const wanted of expected) {
      const found=records.filter(p=>Object.values(p.sources ?? {}).some(s=>s.extractedName.includes(wanted.source)))
      assert.equal(found.length,1,'Missing or duplicate source: '+wanted.source)
      const p=found[0], source=Object.values(p.sources).find(s=>s.extractedName.includes(wanted.source))
      assert.match(p.displayName,wanted.name)
      assert.equal(p.countryCode,'US')
      assert.ok(source.slides.includes(wanted.slide))
      assert.equal(source.canonicalUrl,'https://www.instagram.com/p/DZ9PJzuj1h5/')
      assert.ok(source.evidence.includes(source.extractedName) || source.evidence.includes(wanted.source))
      const {longitude:x,latitude:y}=p.coordinates,[west,south,east,north]=wanted.box
      assert.ok(x>=west && x<=east && y>=south && y<=north,'Wrong neighborhood/venue: '+p.displayName)
      report.places.push({sourceName:source.extractedName,slides:source.slides,displayName:p.displayName,placeType:p.placeType,address:p.address,coordinates:p.coordinates})
    }
    assert.ok(records.every(p=>!/[\p{Script=Hangul}]/u.test(p.displayName)))
    const importedJob=jobs.slice(priorJobs).find(j=>j.operation==='import')
    assert.ok(importedJob)
    const imported=await request(user.token,'/jobs/'+importedJob.id)
    const joined = await request(user.token,'/jobs','POST',{id:crypto.randomUUID(),operation:'import',payload:{input:url.replace('img_index=8','igsh=example')}})
    assert.equal(joined.status,202)
    assert.equal(joined.body.id,importedJob.id)
    assert.equal(joined.body.status,'complete')
    assert.equal(imported.body.result.fetchedImages,13)
    assert.equal(imported.body.result.result.places.length,10)
    assert.deepEqual([...imported.body.result.result.ignoredSlides].sort((a,b)=>a-b),[1,3,4,5,9,11,13])
    report.extraction=imported.body.result
    const ids = new Set(records.map(p => p.collectionId))
    assert.equal(ids.size, 1)
    const collections = (await request(user.token, '/collections')).body.items
    const importedCollection = collections.find(c => ids.has(c.id))
    assert.ok(importedCollection && !importedCollection.isDefault && importedCollection.color)
    const jobCount = jobs.length
    const versions = records.map(p => [p.id,p.collectionId,p.note,p.visited,Object.keys(p.sources).length]).sort()
    await page.reload()
    await page.locator('.mobile-save').getByRole('button',{name:'Save a place',exact:true}).click()
    await page.getByLabel('Instagram post link',{exact:true}).fill(url.replace('img_index=8','img_index=2&igsh=example'))
    await page.getByRole('button',{name:'Find place',exact:true}).click()
    await expect(dialog.getByRole('heading',{name:importedCollection.name,exact:true})).toBeVisible()
    await expect(dialog.getByText('10 places already saved from this post.')).toBeVisible()
    await expect(page.locator('.import-history button')).toHaveCount(10)
    assert.equal(jobs.length,jobCount)
    const reloaded = (await request(user.token,'/places')).body.items
    assert.deepEqual(reloaded.map(p=>[p.id,p.collectionId,p.note,p.visited,Object.keys(p.sources).length]).sort(),versions)
    await page.getByRole('button',{name:'Done',exact:true}).click()
    await page.locator('.collection-link').filter({hasText:importedCollection.name}).first().click()
    checks.push('Repeat link with different slide: ten saved places listed, zero job requests, original records preserved, one colored import collection')
    await expect.poll(async()=>page.locator('.place-card').count(),{timeout:20000}).toBe(10)
    await expect(page.locator('.live-map canvas')).toBeVisible({timeout:30000})
    await expect(page.locator('.live-map-status')).toHaveCount(0,{timeout:30000})
    await expect(page.getByRole('button',{name:'Show all',exact:true})).toBeEnabled()
    await expect(page.getByLabel('Select a saved place on the map').locator('option:not([disabled])')).toHaveCount(10)
    await page.getByRole('button',{name:'Show all',exact:true}).click()
    await page.waitForTimeout(1500) // Allow the bounded fit-to-places camera animation to finish for visual review.
    await page.screenshot({path:'/tmp/pinwish-nyc-accuracy-desktop.png'})
    // A different source may refer to a place the account already saved.
    const original = records[0]
    const source = Object.values(original.sources)[0]
    const duplicate = await request(user.token,'/places','POST',{importTitle:'Overlap validation',note:'Do not replace the original note',place:{
      ...original, koreanName:null, englishName:original.displayName, source:{
        instagram:{originalUrl:'https://www.instagram.com/p/PinWishValidationOnly/'},
        slides:[2], evidence:source.evidence, extractedName:source.extractedName, candidateIndex:0, candidateCount:1,
      },
    }})
    assert.equal(duplicate.status,200)
    assert.equal(duplicate.body.duplicate,true)
    for (const field of ['id','collectionId','note','visited','bookmarked']) assert.deepEqual(duplicate.body.item[field],original[field])
    assert.equal(Object.keys(duplicate.body.item.sources).length,2)
    assert.equal((await request(user.token,'/collections')).body.items.length,collections.length)
    checks.push('Completed job replay reused its ID; overlapping provider ID retained user fields, gained one source and created no empty collection')
    report.passed=true
    checks.push('NYC 13-slide source: all 10 named places saved through the real UI, correct identities/regions, original evidence preserved, covers/activities excluded, reload and map verified')
    console.log('Passed: NYC source accuracy — 10 of 10 named places, no false places')
  } catch(error) { report.failure=error.message; throw error }
  finally { page.off('response', observe); await writeFile('infra/generated/import-accuracy-validation.json',JSON.stringify(report,null,2)) }
}
