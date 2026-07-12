import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  type CognitoUserSession,
} from "amazon-cognito-identity-js";

export const userPool = new CognitoUserPool({
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
  endpoint: import.meta.env.VITE_COGNITO_ENDPOINT || undefined,
});

export type Session = { accessToken: string; email: string };

function toSession(session: CognitoUserSession): Session {
  return {
    accessToken: session.getAccessToken().getJwtToken(),
    email: session.getIdToken().payload.email as string,
  };
}

export function signIn(email: string, password: string): Promise<Session> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });

    user.authenticateUser(authDetails, {
      onSuccess: (session: CognitoUserSession) => {
        resolve(toSession(session));
      },
      onFailure: (err: Error) => {
        reject(err);
      },
    });
  });
}

export function getCurrentSession(): Promise<Session | null> {
  return new Promise((resolve) => {
    const user = userPool.getCurrentUser();
    if (!user) {
      resolve(null);
      return;
    }
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session?.isValid()) {
        resolve(null);
        return;
      }
      resolve(toSession(session));
    });
  });
}

export function signOut(): void {
  userPool.getCurrentUser()?.signOut();
}
