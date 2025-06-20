import { AccountInfo, EventType, PublicClientApplication } from "@azure/msal-browser";
import { checkLoggedIn, msalConfig, useLogin, loginRequest } from "./authConfig";
import { useEffect, useState } from "react";
import { MsalProvider } from "@azure/msal-react";
import { LoginContext } from "./loginContext";
import Layout from "./pages/layout/Layout";

const LayoutWrapper = () => {
    const [loggedIn, setLoggedIn] = useState(false);
    if (useLogin) {
        var msalInstance = new PublicClientApplication(msalConfig);

        // Default to using the first account if no account is active on page load
        if (!msalInstance.getActiveAccount() && msalInstance.getAllAccounts().length > 0) {
            // Set the first account as active
            msalInstance.setActiveAccount(msalInstance.getAllAccounts()[0]);
        }

        // Listen for sign-in event and set active account
        msalInstance.addEventCallback(event => {
            if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
                const account = event.payload as AccountInfo;
                msalInstance.setActiveAccount(account);
            }
        });

        useEffect(() => {
            const initializeAuth = async () => {
                // Always check for existing accounts first
                const accounts = msalInstance.getAllAccounts();
                console.log("Accounts found:", accounts.length);
                
                if (accounts.length > 0) {
                    console.log("Setting logged in to true - accounts exist");
                    setLoggedIn(true);
                    return;
                }
                
                // If no accounts, try silent authentication
                try {
                    const response = await msalInstance.ssoSilent({
                        ...loginRequest,
                        redirectUri: window.location.origin + "/redirect"
                    });
                    console.log("Silent SSO successful");
                    setLoggedIn(true);
                } catch (error) {
                    console.log("Silent SSO failed:", error);
                    // Check if user is actually logged in via other means
                    const isLoggedIn = await checkLoggedIn(msalInstance);
                    console.log("Final login state:", isLoggedIn);
                    setLoggedIn(isLoggedIn);
                }
            };

            initializeAuth();
        }, []);

        return (
            <MsalProvider instance={msalInstance}>
                <LoginContext.Provider
                    value={{
                        loggedIn,
                        setLoggedIn
                    }}
                >
                    <Layout />
                </LoginContext.Provider>
            </MsalProvider>
        );
    } else {
        return (
            <LoginContext.Provider
                value={{
                    loggedIn,
                    setLoggedIn
                }}
            >
                <Layout />
            </LoginContext.Provider>
        );
    }
};

export default LayoutWrapper;
