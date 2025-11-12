export interface SeamlessAuthServerOptions {
  authServerUrl: string;
  cookieDomain?: string;
  accesscookieName?: string;
  registrationCookieName?: string;
  refreshCookieName?: string;
  preAuthCookieName?: string;
}
