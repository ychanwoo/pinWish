import { readFile, mkdir, writeFile } from 'node:fs/promises'
const ref = (Ref) => ({ Ref })
const arn = (name) => ({ 'Fn::GetAtt': [name, 'Arn'] })
const sub = (text) => ({ 'Fn::Sub': text })
const template = {
  AWSTemplateFormatVersion: '2010-09-09',
  Description: 'PinWish authenticated place storage (development)',
  Parameters: {
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
  Resources: {
    MapKey: {
      Type: 'AWS::Location::APIKey',
      Properties: {
        KeyName: sub('${AWS::StackName}-map'),
        Description:
          'Browser map rendering only; restricted to approved web origins',
        ExpireTime: ref('MapKeyExpiry'),
        Restrictions: {
          AllowActions: ['geo-maps:GetTile'],
          AllowResources: [
            sub(
              'arn:${AWS::Partition}:geo-maps:${AWS::Region}::provider/default',
            ),
          ],
          AllowReferers: ref('MapReferers'),
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
                  Action: [
                    'dynamodb:GetItem',
                    'dynamodb:PutItem',
                    'dynamodb:Query',
                    'dynamodb:DeleteItem',
                  ],
                  Resource: arn('Places'),
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
        MemorySize: 128,
        Timeout: 15,
        Environment: { Variables: { TABLE_NAME: ref('Places') } },
        Code: { ZipFile: await readFile('backend/storage.cjs', 'utf8') },
      },
    },
    Api: {
      Type: 'AWS::ApiGatewayV2::Api',
      Properties: {
        Name: sub('${AWS::StackName}-api'),
        ProtocolType: 'HTTP',
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
          ThrottlingBurstLimit: 5,
          ThrottlingRateLimit: 2,
        },
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
for (const [i, route] of [
  'GET /places',
  'POST /places',
  'GET /places/{id}',
  'PATCH /places/{id}',
  'DELETE /places/{id}',
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
await writeFile(
  'infra/generated/storage.json',
  JSON.stringify(template, null, 2) + '\n',
)
console.log('Built infra/generated/storage.json')
