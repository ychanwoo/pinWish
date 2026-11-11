import {test} from 'node:test'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'

test('collection routes retain JWT protection, scoped Lambda invocation and transaction IAM without changing existing route IDs',()=>{
 execFileSync(process.execPath,['scripts/cloud/build-template.mjs'],{stdio:'pipe'})
 const {Resources:r}=JSON.parse(readFileSync('infra/generated/storage.json','utf8'))
 const existing=['GET /places','POST /places','GET /places/{id}','PATCH /places/{id}','DELETE /places/{id}','GET /places/{id}/photo']
 existing.forEach((route,i)=>assert.equal(r['Route'+i].Properties.RouteKey,route))
 const routes=Object.values(r).filter(resource=>resource.Type==='AWS::ApiGatewayV2::Route'&&resource.Properties.RouteKey.includes('/collections'))
 assert.equal(routes.length,4)
 for(const route of routes){
  assert.equal(route.Properties.AuthorizationType,'JWT')
  assert.deepEqual(route.Properties.AuthorizerId,{Ref:'Authorizer'})
  assert.deepEqual(route.Properties.Target,{'Fn::Sub':'integrations/${Integration}'})
 }
 const permission=r.CollectionPermission.Properties
 assert.equal(permission.Principal,'apigateway.amazonaws.com')
 assert.deepEqual(permission.FunctionName,{Ref:'Storage'})
 assert.ok(permission.SourceArn['Fn::Sub'].endsWith('${Api}/*/*/collections*'))
 const statements=Object.values(r).filter(resource=>resource.Type==='AWS::IAM::Role').flatMap(resource=>resource.Properties.Policies??[]).flatMap(policy=>policy.PolicyDocument.Statement)
 const transaction=statements.find(s=>s.Action?.includes('dynamodb:ConditionCheckItem'))
 assert.deepEqual(transaction.Resource,{'Fn::GetAtt':['Places','Arn']})
 assert.ok(transaction.Action.includes('dynamodb:PutItem'))
})
