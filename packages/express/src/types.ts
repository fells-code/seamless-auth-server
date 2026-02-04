export interface SeamlessAuthServerOptions {
  authServerUrl: string;
  cookieDomain?: string;
  accessCookieName?: string;
  registrationCookieName?: string;
  refreshCookieName?: string;
  preAuthCookieName?: string;
}
