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
            const fetchLoggedIn = async () => {
                // Check if we have accounts and set logged in state immediately
                const accounts = msalInstance.getAllAccounts();
                if (accounts.length > 0) {
                    console.log("Found existing accounts, setting logged in to true");
                    setLoggedIn(true);
                    return;
                }
                
                // Try to authenticate automatically
                try {
                    await msalInstance.ssoSilent({
                        ...loginRequest,
                        redirectUri: window.location.origin + "/redirect"
                    });
                    console.log("Silent SSO successful, setting logged in to true");
                    setLoggedIn(true);
                } catch (error) {
                    console.log("Silent SSO failed, checking login state:", error);
                    const isLoggedIn = await checkLoggedIn(msalInstance);
                    console.log("checkLoggedIn result:", isLoggedIn);
                    setLoggedIn(isLoggedIn);
                }
            };

            // Set initial state immediately if accounts exist
            if (msalInstance.getAllAccounts().length > 0) {
                setLoggedIn(true);
            }
            
            fetchLoggedIn();
            
            // Set up a refresh interval to ensure authentication is current
            const refreshInterval = setInterval(async () => {
                await fetchLoggedIn();
            }, 5 * 60 * 1000); // Refresh every 5 minutes
            
            return () => clearInterval(refreshInterval);
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
