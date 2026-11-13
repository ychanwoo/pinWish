export {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  GlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'
export const client = new CognitoIdentityProviderClient({
  region: import.meta.env.VITE_AWS_REGION || 'us-east-1',
  maxAttempts: 1,
})
