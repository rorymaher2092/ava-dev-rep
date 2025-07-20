// Refactored from https://github.com/Azure-Samples/ms-identity-javascript-react-tutorial/blob/main/1-Authentication/1-sign-in/SPA/src/authConfig.js

import { PublicClientApplication, LogLevel, InteractionRequiredAuthError } from "@azure/msal-browser";

const appServicesAuthTokenUrl = ".auth/me";
const appServicesAuthTokenRefreshUrl = ".auth/refresh";
const appServicesAuthLogoutUrl = ".auth/logout?post_logout_redirect_uri=/";

interface AppServicesToken {
    id_token: string;
    access_token: string;
    user_claims: Record<string, any>;
    expires_on: string;
}

interface AuthSetup {
    // Set to true if login elements should be shown in the UI
    useLogin: boolean;
    // Set to true if access control is enforced by the application
    requireAccessControl: boolean;
    // Set to true if the application allows unauthenticated access (only applies for documents without access control)
    enableUnauthenticatedAccess: boolean;
    /**
     * Configuration object to be passed to MSAL instance on creation.
     * For a full list of MSAL.js configuration parameters, visit:
     * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/configuration.md
     */
    msalConfig: {
        auth: {
            clientId: string; // Client app id used for login
            authority: string; // Directory to use for login https://learn.microsoft.com/entra/identity-platform/msal-client-application-configuration#authority
            redirectUri: string; // Points to window.location.origin. You must register this URI on Azure Portal/App Registration.
            postLogoutRedirectUri: string; // Indicates the page to navigate after logout.
            navigateToLoginRequestUrl: boolean; // If "true", will navigate back to the original request location before processing the auth code response.
        };
        cache: {
            cacheLocation: string; // Configures cache location. "sessionStorage" is more secure, but "localStorage" gives you SSO between tabs.
            storeAuthStateInCookie: boolean; // Set this to "true" if you are having issues on IE11 or Edge
        };
    };
    loginRequest: {
        /**
         * Scopes you add here will be prompted for user consent during sign-in.
         * By default, MSAL.js will add OIDC scopes (openid, profile, email) to any login request.
         * For more information about OIDC scopes, visit:
         * https://learn.microsoft.com/entra/identity-platform/permissions-consent-overview#openid-connect-scopes
         */
        scopes: Array<string>;
    };
    tokenRequest: {
        scopes: Array<string>;
    };
}

let authSetupCache: AuthSetup | null = null;

async function fetchAuthSetup(): Promise<AuthSetup> {
    if (authSetupCache) {
        return authSetupCache;
    }

    const response = await fetch("/auth_setup");
    if (!response.ok) {
        throw new Error(`auth setup response was not ok: ${response.status}`);
    }
    authSetupCache = await response.json();

    if (authSetupCache === null) {
        throw new Error("Auth setup data is null");
    }

    return authSetupCache;
}

const authSetup = await fetchAuthSetup();

export const useLogin = authSetup.useLogin;

export const requireAccessControl = authSetup.requireAccessControl;

export const enableUnauthenticatedAccess = authSetup.enableUnauthenticatedAccess;

export const requireLogin = requireAccessControl && !enableUnauthenticatedAccess;

/**
 * Configuration object to be passed to MSAL instance on creation.
 * For a full list of MSAL.js configuration parameters, visit:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/configuration.md
 */
export const msalConfig = {
    ...authSetup.msalConfig,
    system: {
        loggerOptions: {
            loggerCallback: (level: LogLevel, message: string, containsPii: boolean) => {
                if (containsPii) {
                    return;
                }
                switch (level) {
                    case LogLevel.Error:
                        console.error(message);
                        return;
                    case LogLevel.Info:
                        console.info(message);
                        return;
                    case LogLevel.Verbose:
                        console.debug(message);
                        return;
                    case LogLevel.Warning:
                        console.warn(message);
                        return;
                }
            },
            logLevel: LogLevel.Verbose
        },
        // Disable iframes to avoid CSP issues
        allowNativeBroker: false,
        windowHashTimeout: 60000, // Increase timeout
        iframeHashTimeout: 60000, // Increase timeout
        loadFrameTimeout: 0 // Disable iframe loading
    }
};

/**
 * Scopes you add here will be prompted for user consent during sign-in.
 * By default, MSAL.js will add OIDC scopes (openid, profile, email) to any login request.
 * For more information about OIDC scopes, visit:
 * https://learn.microsoft.com/entra/identity-platform/permissions-consent-overview#openid-connect-scopes
 */
export const loginRequest = authSetup.loginRequest;

const tokenRequest = authSetup.tokenRequest;

// Create MSAL instance
export const msalInstance = new PublicClientApplication(msalConfig);

// Initialize MSAL and handle redirect
export const initializeMsal = async (): Promise<void> => {
    try {
        // Only initialize once
        if (!msalInstance.getConfiguration()) {
            console.log("MSAL not yet initialized, initializing now");
            await msalInstance.initialize();
            console.log("MSAL initialized successfully");
        }

        // Only handle redirect if we're coming from a redirect
        const urlParams = new URLSearchParams(window.location.search);
        const hashParams = window.location.hash;

        if (hashParams.includes("code=") || urlParams.get("code")) {
            console.log("Auth code detected, handling redirect");
            const response = await msalInstance.handleRedirectPromise();
            console.log("Handle redirect promise completed", response);

            if (response) {
                console.log("Redirect response received:", response);
                msalInstance.setActiveAccount(response.account);

                // Store that we've completed MSAL auth
                sessionStorage.setItem("msal.auth.completed", "true");

                // Clear the URL
                window.history.replaceState({}, document.title, window.location.pathname);

                return;
            }
        }

        // Set active account if not set
        const accounts = msalInstance.getAllAccounts();
        if (!msalInstance.getActiveAccount() && accounts.length > 0) {
            console.log("Setting active account from existing accounts");
            msalInstance.setActiveAccount(accounts[0]);
        }
    } catch (error) {
        console.error("Error initializing MSAL:", error);
        throw error;
    }
};

// Build an absolute redirect URI
export const getRedirectUri = () => {
    return window.location.origin + authSetup.msalConfig.auth.redirectUri;
};

// Cache the app services token if it's available
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this#global_context
declare global {
    var cachedAppServicesToken: AppServicesToken | null;
}
globalThis.cachedAppServicesToken = null;

/**
 * Retrieves an access token if the user is logged in using app services authentication.
 * Checks if the current token is expired and fetches a new token if necessary.
 * Returns null if the app doesn't support app services authentication.
 *
 * @returns {Promise<AppServicesToken | null>} A promise that resolves to an AppServicesToken if the user is authenticated, or null if authentication is not supported or fails.
 */
const getAppServicesToken = (): Promise<AppServicesToken | null> => {
    const checkNotExpired = (appServicesToken: AppServicesToken) => {
        const currentDate = new Date();
        const expiresOnDate = new Date(appServicesToken.expires_on);
        return expiresOnDate > currentDate;
    };

    if (globalThis.cachedAppServicesToken && checkNotExpired(globalThis.cachedAppServicesToken)) {
        return Promise.resolve(globalThis.cachedAppServicesToken);
    }

    const getAppServicesTokenFromMe: () => Promise<AppServicesToken | null> = () => {
        return fetch(appServicesAuthTokenUrl).then(r => {
            if (r.ok) {
                return r.json().then(json => {
                    if (json.length > 0) {
                        return {
                            id_token: json[0]["id_token"] as string,
                            access_token: json[0]["access_token"] as string,
                            user_claims: json[0]["user_claims"].reduce((acc: Record<string, any>, item: Record<string, any>) => {
                                acc[item.typ] = item.val;
                                return acc;
                            }, {}) as Record<string, any>,
                            expires_on: json[0]["expires_on"] as string
                        } as AppServicesToken;
                    }

                    return null;
                });
            }

            return null;
        });
    };

    return getAppServicesTokenFromMe().then(token => {
        if (token) {
            if (checkNotExpired(token)) {
                globalThis.cachedAppServicesToken = token;
                return token;
            }

            return fetch(appServicesAuthTokenRefreshUrl).then(r => {
                if (r.ok) {
                    return getAppServicesTokenFromMe();
                }
                return null;
            });
        }

        return null;
    });
};

export const isUsingAppServicesLogin = (await getAppServicesToken()) != null;

// Sign out of app services
// Learn more at https://learn.microsoft.com/azure/app-service/configure-authentication-customize-sign-in-out#sign-out-of-a-session
export const appServicesLogout = () => {
    window.location.href = appServicesAuthLogoutUrl;
};

/**
 * Determines if the user is logged in using app services authentication.
 * @returns {Promise<boolean>} A promise that resolves to true if the user is logged in, false otherwise.
 */
export const checkLoggedIn = async (): Promise<boolean> => {
    const appServicesToken = await getAppServicesToken();
    return appServicesToken !== null;
};

// Get an access token for use with the API server.
export const getToken = async (): Promise<string | undefined> => {
    // First check if we need a Graph token
    const needsGraphToken = true; // You can make this configurable

    if (needsGraphToken && useLogin) {
        const graphToken = await getGraphToken();
        if (graphToken) {
            return graphToken;
        }
    }

    // Fall back to app services token
    await fetch(appServicesAuthTokenRefreshUrl);
    const appServicesToken = await getAppServicesToken();
    if (appServicesToken) {
        return appServicesToken.access_token;
    }
    return undefined;
};

/**
 * Get Microsoft Graph access token using MSAL
 */
export const getGraphToken = async (): Promise<string | undefined> => {
    if (!useLogin || !msalInstance) {
        console.log("MSAL not available");
        return undefined;
    }

    try {
        const accounts = msalInstance.getAllAccounts();
        let account = msalInstance.getActiveAccount();

        if (!account && accounts.length > 0) {
            account = accounts[0];
            msalInstance.setActiveAccount(account);
        }

        // Use the default scope for Microsoft Graph
        const graphScopes = ["https://graph.microsoft.com/.default"];

        if (account) {
            const tokenRequest = {
                scopes: graphScopes,
                account: account,
                forceRefresh: false
            };

            try {
                const response = await msalInstance.acquireTokenSilent(tokenRequest);
                console.log("Graph token acquired silently");
                return response.accessToken;
            } catch (silentError) {
                if (silentError instanceof InteractionRequiredAuthError) {
                    console.log("Interaction required, using redirect flow");

                    await msalInstance.acquireTokenRedirect({
                        scopes: graphScopes,
                        account: account
                    });

                    return undefined;
                }
                throw silentError;
            }
        } else {
            if (isUsingAppServicesLogin) {
                const appServicesToken = await getAppServicesToken();
                if (appServicesToken?.user_claims) {
                    const upn = appServicesToken.user_claims.preferred_username || appServicesToken.user_claims.email || appServicesToken.user_claims.upn;

                    if (upn) {
                        console.log("Using App Service auth info for MSAL login");

                        await msalInstance.loginRedirect({
                            scopes: ["openid", "profile"],
                            loginHint: upn
                        });

                        return undefined;
                    }
                }
            }

            console.log("No account available, triggering redirect login");
            await msalInstance.loginRedirect({
                scopes: ["openid", "profile"]
            });

            return undefined;
        }
    } catch (error) {
        console.error("Error getting Graph token:", error);
        return undefined;
    }
};

/**
 * Retrieves the username from app services authentication.
 * @returns {Promise<string | null>} The username of the authenticated user, or null if not found.
 */
export const getUsername = async (): Promise<string | null> => {
    // First try MSAL
    if (msalInstance) {
        const account = msalInstance.getActiveAccount();
        if (account) {
            return account.name || account.username;
        }
    }

    // Fall back to App Service auth
    const appServicesToken = await getAppServicesToken();
    if (appServicesToken?.user_claims) {
        return appServicesToken.user_claims.name || appServicesToken.user_claims.preferred_username;
    }
    return null;
};

/**
 * Retrieves the token claims from app services authentication.
 * @returns {Promise<Record<string, unknown> | undefined>} A promise that resolves to the user claims, or undefined if not found.
 */
export const getTokenClaims = async (): Promise<Record<string, unknown> | undefined> => {
    const appServicesToken = await getAppServicesToken();
    if (appServicesToken) {
        return appServicesToken.user_claims;
    }
    return undefined;
};
