import { BrowserCacheLocation, InteractionRequiredAuthError, PublicClientApplication } from "@azure/msal-browser";

const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID ?? "c643d250-0dd7-416f-889e-a93f0e4ef800";
const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID ?? "25752e7a-693a-406c-9383-07b80b666cd3";
export const apiScope = import.meta.env.VITE_ENTRA_API_SCOPE ?? "api://006da587-4ade-46a3-b651-33945cf729c3/access_as_user";
export const msal = new PublicClientApplication({
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: import.meta.env.VITE_ENTRA_REDIRECT_URI ?? "http://localhost:5173",
    postLogoutRedirectUri: import.meta.env.VITE_ENTRA_REDIRECT_URI ?? "http://localhost:5173",
  },
  cache: { cacheLocation: BrowserCacheLocation.SessionStorage },
});
let initialization: Promise<void> | undefined;
export function initializeAuth(): Promise<void> {
  return initialization ??= (async () => {
    await msal.initialize();
    const result = await msal.handleRedirectPromise();
    if (result?.account) msal.setActiveAccount(result.account);
    if (!msal.getActiveAccount() && msal.getAllAccounts().length === 1) {
      msal.setActiveAccount(msal.getAllAccounts()[0]);
    }
  })();
}

export async function getAccessToken(): Promise<string> {
  await initializeAuth();
  const account = msal.getActiveAccount();
  if (!account) throw new Error("Please sign in to continue.");
  try {
    return (await msal.acquireTokenSilent({ account, scopes: [apiScope] })).accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      window.dispatchEvent(new Event("guardrails:reauth"));
      throw new Error("Your session needs attention. Select Sign in again.");
    }
    throw error;
  }
}
export async function signIn(): Promise<void> {
  await initializeAuth();
  await msal.loginRedirect({ scopes: [apiScope] });
}
export async function signOut(): Promise<void> {
  await msal.logoutRedirect({ account: msal.getActiveAccount() });
}
