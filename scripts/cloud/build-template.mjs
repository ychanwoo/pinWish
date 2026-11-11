import { build } from 'esbuild'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
const ref = (Ref) => ({ Ref })
const arn = (name) => ({ 'Fn::GetAtt': [name, 'Arn'] })
const sub = (text) => ({ 'Fn::Sub': text })
const bundle = await build({
  entryPoints: ['backend/storage.cjs'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  minify: true,
  write: false,
  external: ['@aws-sdk/*'],
})
const template = {
  AWSTemplateFormatVersion: '2010-09-09',
  Description: 'PinWish authenticated place storage (development)',
  Parameters: {
    ProcessingCodeKey: { Type: 'String' },
    HostingAppId: { Type: 'String', Default: 'none' },
    RuntimeEnabled: {
      Type: 'String',
      AllowedValues: ['true', 'false'],
      Default: 'false',
    },

    MapKeyExpiry: { Type: 'String', Default: '2027-01-01T00:00:00Z' },
    MapReferers: {
      Type: 'CommaDelimitedList',
      Default: 'http://localhost:5173/*,http://127.0.0.1:5173/*',
    },
    AllowedOrigins: {
      Type: 'CommaDelimitedList',
      Default:
        'http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:5175',
    },
  },
  Conditions: {
    RuntimeOn: { 'Fn::Equals': [ref('RuntimeEnabled'), 'true'] },
  },
  Resources: {
    Photos: {
      Type: 'AWS::S3::Bucket',
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
          BlockPublicPolicy: true,
          RestrictPublicBuckets: true,
        },
        OwnershipControls: {
          Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }],
        },
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
          ],
        },
        LifecycleConfiguration: {
          Rules: [
            {
              Id: 'AbortIncompleteUploads',
              Status: 'Enabled',
              AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
            },
          ],
        },
      },
    },
    PhotoPolicy: {
      Type: 'AWS::S3::BucketPolicy',
      Properties: {
        Bucket: ref('Photos'),
        PolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Deny',
              Principal: '*',
              Action: 's3:*',
              Resource: [arn('Photos'), sub('${Photos.Arn}/*')],
              Condition: { Bool: { 'aws:SecureTransport': 'false' } },
            },
          ],
        },
      },
    },
    PhotoCleanup: {
      Type: 'AWS::Events::Rule',
      Properties: {
        ScheduleExpression: 'rate(1 day)',
        State: { 'Fn::If': ['RuntimeOn', 'ENABLED', 'DISABLED'] },
        Targets: [{ Arn: arn('Storage'), Id: 'PhotoCleanup' }],
      },
    },
    PhotoCleanupPermission: {
      Type: 'AWS::Lambda::Permission',
      Properties: {
        FunctionName: ref('Storage'),
        Action: 'lambda:InvokeFunction',
        Principal: 'events.amazonaws.com',
        SourceArn: arn('PhotoCleanup'),
      },
    },
    MapKey: {
      Type: 'AWS::Location::APIKey',
      Properties: {
        KeyName: sub('${AWS::StackName}-map'),
        Description:
          'Browser map rendering only; restricted to approved web origins',
        ExpireTime: ref('MapKeyExpiry'),
        ForceUpdate: true,
        Restrictions: {
          AllowActions: ['geo-maps:GetTile'],
          AllowResources: [
            sub(
              'arn:${AWS::Partition}:geo-maps:${AWS::Region}::provider/default',
            ),
          ],
          AllowReferers: {
            'Fn::If': [
              'RuntimeOn',
              ref('MapReferers'),
              ['https://paused.invalid/*'],
            ],
          },
        },
      },
    },
    UserPool: {
      Type: 'AWS::Cognito::UserPool',
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: {
        UserPoolName: sub('${AWS::StackName}-users'),
        UsernameAttributes: ['email'],
        AutoVerifiedAttributes: ['email'],
        UsernameConfiguration: { CaseSensitive: false },
        Policies: {
          PasswordPolicy: {
            MinimumLength: 12,
            RequireLowercase: true,
            RequireUppercase: true,
            RequireNumbers: true,
            RequireSymbols: true,
          },
        },
        AccountRecoverySetting: {
          RecoveryMechanisms: [{ Name: 'verified_email', Priority: 1 }],
        },
        Schema: [{ Name: 'email', Required: true, Mutable: true }],
        UserPoolTier: 'LITE',
      },
    },
    UserClient: {
      Type: 'AWS::Cognito::UserPoolClient',
      Properties: {
        UserPoolId: ref('UserPool'),
        GenerateSecret: false,
        ExplicitAuthFlows: [
          'ALLOW_USER_PASSWORD_AUTH',
          'ALLOW_REFRESH_TOKEN_AUTH',
        ],
        PreventUserExistenceErrors: 'ENABLED',
        EnableTokenRevocation: true,
        AccessTokenValidity: 5,
        IdTokenValidity: 5,
        RefreshTokenValidity: 7,
        TokenValidityUnits: {
          AccessToken: 'minutes',
          IdToken: 'minutes',
          RefreshToken: 'days',
        },
        ReadAttributes: ['email', 'email_verified'],
        WriteAttributes: ['email'],
      },
    },
    Places: {
      Type: 'AWS::DynamoDB::Table',
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: {
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' },
        ],
        SSESpecification: { SSEEnabled: true },
      },
    },
    Logs: {
      Type: 'AWS::Logs::LogGroup',
      Properties: {
        LogGroupName: sub('/aws/lambda/${AWS::StackName}-storage'),
        RetentionInDays: 7,
      },
    },
    Role: {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole',
            },
          ],
        },
        Policies: [
          {
            PolicyName: 'OwnStorageTable',
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Action: 'lambda:InvokeFunction',
                  Resource: sub(
                    'arn:${AWS::Partition}:lambda:${AWS::Region}:${AWS::AccountId}:function:${AWS::StackName}-storage',
                  ),
                },
                {
                  Effect: 'Allow',
                  Action: [
                    'dynamodb:GetItem',
                    'dynamodb:PutItem',
                    'dynamodb:Query',
                    'dynamodb:ConditionCheckItem',
                    'dynamodb:DeleteItem',
                  ],
                  Resource: arn('Places'),
                },
                {
                  Effect: 'Allow',
                  Action: 'dynamodb:GetItem',
                  Resource: arn('Jobs'),
                },
                {
                  Effect: 'Allow',
                  Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
                  Resource: sub('${Photos.Arn}/photos/*'),
                },
                {
                  Effect: 'Allow',
                  Action: 's3:ListBucket',
                  Resource: arn('Photos'),
                  Condition: { StringLike: { 's3:prefix': 'photos/*' } },
                },
                {
                  Effect: 'Allow',
                  Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
                  Resource: arn('Logs'),
                },
              ],
            },
          },
        ],
      },
    },
    Storage: {
      Type: 'AWS::Lambda::Function',
      DependsOn: 'Logs',
      Properties: {
        FunctionName: sub('${AWS::StackName}-storage'),
        Runtime: 'nodejs22.x',
        Handler: 'index.handler',
        Role: arn('Role'),
        ReservedConcurrentExecutions: {
          'Fn::If': ['RuntimeOn', ref('AWS::NoValue'), 0],
        },
        MemorySize: 512,
        Timeout: 60,
        Environment: {
          Variables: {
            TABLE_NAME: ref('Places'),
            PHOTO_BUCKET: ref('Photos'),
            JOBS_TABLE: ref('Jobs'),
          },
        },
        Code: { ZipFile: bundle.outputFiles[0].text },
      },
    },
    Api: {
      Type: 'AWS::ApiGatewayV2::Api',
      Properties: {
        Name: sub('${AWS::StackName}-api'),
        ProtocolType: 'HTTP',
        DisableExecuteApiEndpoint: { 'Fn::If': ['RuntimeOn', false, true] },
        CorsConfiguration: {
          AllowOrigins: ref('AllowedOrigins'),
          AllowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
          AllowHeaders: ['authorization', 'content-type'],
          MaxAge: 300,
        },
      },
    },
    Authorizer: {
      Type: 'AWS::ApiGatewayV2::Authorizer',
      Properties: {
        ApiId: ref('Api'),
        AuthorizerType: 'JWT',
        IdentitySource: ['$request.header.Authorization'],
        Name: 'CognitoUsers',
        JwtConfiguration: {
          Audience: [ref('UserClient')],
          Issuer: sub(
            'https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}',
          ),
        },
      },
    },
    Integration: {
      Type: 'AWS::ApiGatewayV2::Integration',
      Properties: {
        ApiId: ref('Api'),
        IntegrationType: 'AWS_PROXY',
        IntegrationUri: arn('Storage'),
        PayloadFormatVersion: '2.0',
      },
    },
    Stage: {
      Type: 'AWS::ApiGatewayV2::Stage',
      Properties: {
        ApiId: ref('Api'),
        StageName: '$default',
        AutoDeploy: true,
        DefaultRouteSettings: {
          ThrottlingBurstLimit: 10,
          ThrottlingRateLimit: 5,
        },
      },
    },
    CollectionPermission: {
      Type: 'AWS::Lambda::Permission',
      Properties: {
        Action: 'lambda:InvokeFunction',
        FunctionName: ref('Storage'),
        Principal: 'apigateway.amazonaws.com',
        SourceArn: sub(
          'arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${Api}/*/*/collections*',
        ),
      },
    },
    Permission: {
      Type: 'AWS::Lambda::Permission',
      Properties: {
        FunctionName: ref('Storage'),
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
        SourceArn: sub(
          'arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${Api}/*/*/places*',
        ),
      },
    },
  },
  Outputs: {
    PhotoBucketName: { Value: ref('Photos') },
    MapKeyName: { Value: ref('MapKey') },
    ApiUrl: {
      Value: sub('https://${Api}.execute-api.${AWS::Region}.amazonaws.com'),
    },
    UserPoolId: { Value: ref('UserPool') },
    UserPoolClientId: { Value: ref('UserClient') },
    Region: { Value: ref('AWS::Region') },
    TableName: { Value: ref('Places') },
  },
}
Object.assign(template.Resources, {
  Jobs: {
    Type: 'AWS::DynamoDB::Table',
    Properties: {
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
      TimeToLiveSpecification: {
        AttributeName: 'expiresAt',
        Enabled: true,
      },
      SSESpecification: { SSEEnabled: true },
    },
  },
  ProcessingLogs: {
    Type: 'AWS::Logs::LogGroup',
    Properties: {
      LogGroupName: sub('/aws/lambda/${AWS::StackName}-processing'),
      RetentionInDays: 7,
    },
  },
  ProcessingRole: {
    Type: 'AWS::IAM::Role',
    Properties: {
      AssumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: 'lambda.amazonaws.com' },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      Policies: [
        {
          PolicyName: 'BoundedProcessing',
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: [
                  'dynamodb:GetItem',
                  'dynamodb:PutItem',
                  'dynamodb:UpdateItem',
                  'dynamodb:DeleteItem',
                ],
                Resource: arn('Jobs'),
              },
              {
                Effect: 'Allow',
                Action: 'lambda:InvokeFunction',
                Resource: sub(
                  'arn:${AWS::Partition}:lambda:${AWS::Region}:${AWS::AccountId}:function:${AWS::StackName}-worker',
                ),
              },
              {
                Effect: 'Allow',
                Action: 'bedrock:InvokeModel',
                Resource: sub(
                  'arn:${AWS::Partition}:bedrock:${AWS::Region}::foundation-model/qwen.qwen3-vl-235b-a22b',
                ),
              },
              {
                Effect: 'Allow',
                Action: ['geo-places:SearchText', 'geo-places:GetPlace'],
                Resource: sub(
                  'arn:${AWS::Partition}:geo-places:${AWS::Region}::provider/default',
                ),
              },
              {
                Effect: 'Allow',
                Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
                Resource: [arn('ProcessingLogs'), arn('WorkerLogs')],
              },
            ],
          },
        },
      ],
    },
  },
  Processing: {
    Type: 'AWS::Lambda::Function',
    DependsOn: 'ProcessingLogs',
    Properties: {
      FunctionName: sub('${AWS::StackName}-processing'),
      Runtime: 'nodejs22.x',
      Handler: 'index.handler',
      Role: arn('ProcessingRole'),
      MemorySize: 512,
      Timeout: 15,
      ReservedConcurrentExecutions: {
        'Fn::If': ['RuntimeOn', ref('AWS::NoValue'), 0],
      },
      Environment: {
        Variables: {
          JOBS_TABLE: ref('Jobs'),
          WORKER_FUNCTION: sub('${AWS::StackName}-worker'),
        },
      },
      Code: { S3Bucket: ref('Photos'), S3Key: ref('ProcessingCodeKey') },
    },
  },
  WorkerLogs: {
    Type: 'AWS::Logs::LogGroup',
    Properties: {
      LogGroupName: sub('/aws/lambda/${AWS::StackName}-worker'),
      RetentionInDays: 7,
    },
  },
  Worker: {
    Type: 'AWS::Lambda::Function',
    DependsOn: 'WorkerLogs',
    Properties: {
      FunctionName: sub('${AWS::StackName}-worker'),
      Runtime: 'nodejs22.x',
      Handler: 'index.handler',
      Role: arn('ProcessingRole'),
      MemorySize: 1024,
      Timeout: 120,
      ReservedConcurrentExecutions: {
        'Fn::If': ['RuntimeOn', ref('AWS::NoValue'), 0],
      },
      Environment: { Variables: { JOBS_TABLE: ref('Jobs') } },
      Code: { S3Bucket: ref('Photos'), S3Key: ref('ProcessingCodeKey') },
    },
  },
  ProcessingAsync: {
    Type: 'AWS::Lambda::EventInvokeConfig',
    Properties: {
      FunctionName: ref('Worker'),
      Qualifier: '$LATEST',
      MaximumRetryAttempts: 0,
      MaximumEventAgeInSeconds: 120,
    },
  },
  ProcessingIntegration: {
    Type: 'AWS::ApiGatewayV2::Integration',
    Properties: {
      ApiId: ref('Api'),
      IntegrationType: 'AWS_PROXY',
      IntegrationUri: arn('Processing'),
      PayloadFormatVersion: '2.0',
    },
  },
  ProcessingPermission: {
    Type: 'AWS::Lambda::Permission',
    Properties: {
      FunctionName: ref('Processing'),
      Action: 'lambda:InvokeFunction',
      Principal: 'apigateway.amazonaws.com',
      SourceArn: sub(
        'arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${Api}/*/*/jobs*',
      ),
    },
  },
})
for (const [i, route] of ['POST /jobs', 'GET /jobs/{id}'].entries())
  template.Resources['JobRoute' + i] = {
    Type: 'AWS::ApiGatewayV2::Route',
    Properties: {
      ApiId: ref('Api'),
      RouteKey: route,
      AuthorizationType: 'JWT',
      AuthorizerId: ref('Authorizer'),
      Target: sub('integrations/${ProcessingIntegration}'),
    },
  }
template.Outputs.JobsTableName = { Value: ref('Jobs') }
Object.assign(template.Resources, {
  PauseLogs: {
    Type: 'AWS::Logs::LogGroup',
    Properties: {
      LogGroupName: sub('/aws/lambda/${AWS::StackName}-pause'),
      RetentionInDays: 7,
    },
  },
  PauseRole: {
    Type: 'AWS::IAM::Role',
    Properties: {
      AssumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: 'lambda.amazonaws.com' },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      Policies: [
        {
          PolicyName: 'PauseOnlyThisProject',
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: 'lambda:PutFunctionConcurrency',
                Resource: [arn('Storage'), arn('Processing'), arn('Worker')],
              },
              {
                Effect: 'Allow',
                Action: 'apigateway:PATCH',
                Resource: sub(
                  'arn:${AWS::Partition}:apigateway:${AWS::Region}::/apis/${Api}',
                ),
              },
              {
                Effect: 'Allow',
                Action: 'events:DisableRule',
                Resource: arn('PhotoCleanup'),
              },
              {
                Effect: 'Allow',
                Action: ['geo:DescribeKey', 'geo:UpdateKey'],
                Resource: sub(
                  'arn:${AWS::Partition}:geo:${AWS::Region}:${AWS::AccountId}:api-key/${AWS::StackName}-map',
                ),
              },
              {
                Effect: 'Allow',
                Action: 'geo-maps:GetTile',
                Resource: sub(
                  'arn:${AWS::Partition}:geo-maps:${AWS::Region}::provider/default',
                ),
              },
              {
                Effect: 'Allow',
                Action: 'amplify:UpdateApp',
                Resource: sub(
                  'arn:${AWS::Partition}:amplify:${AWS::Region}:${AWS::AccountId}:apps/${HostingAppId}',
                ),
              },
              {
                Effect: 'Allow',
                Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
                Resource: arn('PauseLogs'),
              },
            ],
          },
        },
      ],
    },
  },
  Pause: {
    Type: 'AWS::Lambda::Function',
    DependsOn: 'PauseLogs',
    Properties: {
      FunctionName: sub('${AWS::StackName}-pause'),
      Runtime: 'nodejs22.x',
      Handler: 'index.handler',
      Role: arn('PauseRole'),
      Timeout: 60,
      MemorySize: 128,
      Environment: {
        Variables: {
          API_ID: ref('Api'),
          STORAGE_FUNCTION: ref('Storage'),
          PROCESSING_FUNCTION: ref('Processing'),
          WORKER_FUNCTION: ref('Worker'),
          CLEANUP_RULE: ref('PhotoCleanup'),
          MAP_KEY: ref('MapKey'),
          HOSTING_APP: ref('HostingAppId'),
        },
      },
      Code: { ZipFile: await readFile('backend/pause.cjs', 'utf8') },
    },
  },
  ScheduleRole: {
    Type: 'AWS::IAM::Role',
    Properties: {
      AssumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: 'scheduler.amazonaws.com' },
            Action: 'sts:AssumeRole',
            Condition: {
              StringEquals: { 'aws:SourceAccount': ref('AWS::AccountId') },
            },
          },
        ],
      },
      Policies: [
        {
          PolicyName: 'InvokePause',
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: 'lambda:InvokeFunction',
                Resource: arn('Pause'),
              },
            ],
          },
        },
      ],
    },
  },
  AutoPause: {
    Type: 'AWS::Scheduler::Schedule',
    Properties: {
      Name: sub('${AWS::StackName}-auto-pause'),
      State: 'DISABLED',
      ScheduleExpression: 'at(2030-01-01T00:00:00)',
      FlexibleTimeWindow: { Mode: 'OFF' },
      Target: {
        Arn: arn('Pause'),
        RoleArn: arn('ScheduleRole'),
        Input: '{}',
        RetryPolicy: {
          MaximumEventAgeInSeconds: 3600,
          MaximumRetryAttempts: 2,
        },
      },
    },
  },
})
template.Outputs.AutoPauseName = { Value: ref('AutoPause') }

for (const [i, route] of [
  'GET /places',
  'POST /places',
  'GET /places/{id}',
  'PATCH /places/{id}',
  'DELETE /places/{id}',
  'GET /places/{id}/photo',
  'GET /collections',
  'POST /collections',
  'PATCH /collections/{id}',
  'DELETE /collections/{id}',
].entries())
  template.Resources[`Route${i}`] = {
    Type: 'AWS::ApiGatewayV2::Route',
    Properties: {
      ApiId: ref('Api'),
      RouteKey: route,
      AuthorizationType: 'JWT',
      AuthorizerId: ref('Authorizer'),
      Target: sub('integrations/${Integration}'),
    },
  }
await mkdir('infra/generated', { recursive: true })
await writeFile('infra/generated/storage.json', JSON.stringify(template) + '\n')
console.log('Built infra/generated/storage.json')
