import { randomBytes } from 'node:crypto'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { aws, configuration } from './aws-util.mjs'
if (process.env.PINWISH_RUN_EMAIL_TESTS !== '1' || !process.env.PINWISH_TEST_EMAIL) throw Error('Explicit opt-in and a new test email required')
const {outputs}=configuration(), email=process.env.PINWISH_TEST_EMAIL
if (!/^[a-zA-Z0-9._+%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) throw Error('Invalid email')
if(aws(['cognito-idp','list-users','--user-pool-id',outputs.UserPoolId,'--filter',`email = "${email}"`]).Users.length) throw Error('Refusing to modify an existing account')
const {origin}=JSON.parse(await readFile('infra/generated/hosting.json'))
const codeFile='infra/generated/release-email-code.txt'
await unlink(codeFile).catch(()=>{})
const browser=await chromium.launch(), page=await browser.newPage()
const checks=[], errors=[];let createdSub, cancelled = false
process.on('SIGTERM', () => { cancelled = true })
process.on('SIGINT', () => { cancelled = true })
const button=name=>page.getByRole('button',{name,exact:true}).filter({visible:true}).last()
page.on('response',async response=>{
 if(response.request().headers()['x-amz-target']==='AWSCognitoIdentityProviderService.SignUp' && response.ok()) {
  const data=await response.json(); createdSub=data.UserSub
 }
})
async function code(stage) {
 console.log('WAITING_FOR_EMAIL_CODE:'+stage)
 const end=Date.now()+10*60*1000
 while(Date.now()<end) {
  if(cancelled) throw Error('Email verification deferred; cleaning up the temporary account')
  try {const value=(await readFile(codeFile,'utf8')).trim();if(/^\d{6}$/.test(value)){await unlink(codeFile);return value}}catch{}
  await new Promise(r=>setTimeout(r,1000))
 }
 throw Error('Email code was not supplied within the test window')
}
try {
 await page.goto(origin)
 await button('Sign in').click()
 await button('Create account').click()
 await page.getByLabel('Email',{exact:true}).fill(email)
 const password='aA1!'+randomBytes(24).toString('base64url')
 await page.getByLabel('Password',{exact:true}).fill(password)
 await button('Create account').click()
 await expect(page.getByRole('heading',{name:'Check your email'})).toBeVisible({timeout:30000})
 await page.getByLabel('Verification code').fill(await code('signup'))
 await button('Verify email').click()
 await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible()
 checks.push('Real signup email code accepted; verification returns to sign-in')
 await page.getByLabel('Password',{exact:true}).fill(password)
 await button('Sign in').click()
 await expect(button('Sign out')).toBeVisible({timeout:30000})
 await button('Sign out').click()
 checks.push('New verified account signs in and signs out')
 await button('Sign in').click()
 await button('Forgot password?').click()
 await page.getByLabel('Email',{exact:true}).fill(email)
 await button('Send reset code').click()
 await expect(page.getByLabel('Verification code')).toBeVisible({timeout:30000})
 await page.getByLabel('Verification code').fill(await code('reset'))
 await page.getByLabel('Password',{exact:true}).fill('aA1!'+randomBytes(24).toString('base64url'))
 const updatedPassword=await page.getByLabel('Password',{exact:true}).inputValue()
 await button('Update password').click()
 await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible()
 await page.getByLabel('Password',{exact:true}).fill(updatedPassword)
 await button('Sign in').click()
 await expect(button('Sign out')).toBeVisible({timeout:30000})
 await button('Sign out').click()
 checks.push('Real reset email code accepted; new password signs in and signs out')
} catch(e) {errors.push(e.message);process.exitCode=1;console.error(e.message)}
finally {
 await browser.close()
 if(createdSub) {
  // Only the account created by this run: never an existing account.
  const rows=aws(['dynamodb','query','--table-name',outputs.TableName,'--key-condition-expression','pk = :pk','--expression-attribute-values',JSON.stringify({':pk':{S:'USER#'+createdSub}})]).Items ?? []
  for(const row of rows) aws(['dynamodb','delete-item','--table-name',outputs.TableName,'--key',JSON.stringify({pk:row.pk,sk:row.sk})])
  aws(['cognito-idp','admin-delete-user','--user-pool-id',outputs.UserPoolId,'--username',createdSub])
 }
 await unlink(codeFile).catch(()=>{})
 await writeFile('infra/generated/release-email-validation.json',JSON.stringify({testedAt:new Date().toISOString(),checks,errors,temporaryAccountRemoved:Boolean(createdSub)},null,2))
 console.log(JSON.stringify({checks,errors,temporaryAccountRemoved:Boolean(createdSub)}))
}
