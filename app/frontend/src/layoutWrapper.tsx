// Fixed LayoutWrapper.tsx
import { EventType } from "@azure/msal-browser";
import { checkLoggedIn, useLogin, msalInstance, initializeMsal, getGraphToken } from "./authConfig";
import { useEffect, useState } from "react";
import { MsalProvider } from "@azure/msal-react";
import { LoginContext } from "./loginContext";
import Layout from "./pages/layout/Layout";

const LayoutWrapper = () => {
    const [loggedIn, setLoggedIn] = useState(false);
    const [msalReady, setMsalReady] = useState(false);
    const [appServiceAuthChecked, setAppServiceAuthChecked] = useState(false);
    const [initError, setInitError] = useState<Error | null>(null);

    // First effect: Initialize MSAL only
    useEffect(() => {
        const initMsal = async () => {
            if (useLogin) {
                try {
                    await initializeMsal();
                    setMsalReady(true);
                    console.log("MSAL initialization complete");

                    // Set up event callbacks
                    msalInstance.addEventCallback(event => {
                        if (event.eventType === EventType.LOGIN_SUCCESS) {
                            console.log("Login success event");
                            setLoggedIn(true);
                            // Clear attempt flag on success
                            sessionStorage.removeItem("msal.login.attempted");
                        }

                        if (event.eventType === EventType.ACQUIRE_TOKEN_SUCCESS) {
                            console.log("Token acquired successfully");
                        }
                    });

                    // Check for existing MSAL accounts
                    const accounts = msalInstance.getAllAccounts();
                    if (accounts.length > 0) {
                        console.log("MSAL accounts found:", accounts.length);
                        setLoggedIn(true);
                    }
                } catch (error) {
                    console.error("Failed to initialize MSAL:", error);
                    setInitError(error as Error);
                }
            } else {
                setMsalReady(true); // If not using login, mark as ready
            }
        };

        initMsal();
    }, []); // Run once on mount

    // Second effect: Check App Service auth after MSAL is ready
    useEffect(() => {
        if (!msalReady) return;

        const checkAppServiceAuth = async () => {
            try {
                const isLoggedInViaAppService = await checkLoggedIn();
                setAppServiceAuthChecked(true);

                if (isLoggedInViaAppService) {
                    console.log("User logged in via App Service auth");
                    setLoggedIn(true);

                    // Check if we should auto-trigger MSAL auth
                    if (useLogin) {
                        const msalAccounts = msalInstance.getAllAccounts();
                        const msalAttempted = sessionStorage.getItem("msal.login.attempted");
                        const msalCompleted = sessionStorage.getItem("msal.auth.completed");

                        // Only auto-trigger if:
                        // 1. No MSAL accounts exist
                        // 2. Haven't attempted this session
                        // 3. Haven't completed MSAL auth
                        // 4. Not currently on redirect page
                        if (msalAccounts.length === 0 && !msalAttempted && !msalCompleted && window.location.pathname !== "/redirect") {
                            console.log("App Service auth detected, will trigger MSAL auth");
                            sessionStorage.setItem("msal.login.attempted", "true");

                            // Small delay to ensure everything is stable
                            setTimeout(async () => {
                                try {
                                    console.log("Triggering MSAL authentication");
                                    await getGraphToken();
                                } catch (error) {
                                    console.error("Auto MSAL login failed:", error);
                                    // Clear the flag so user can try again if needed
                                    sessionStorage.removeItem("msal.login.attempted");
                                }
                            }, 1500);
                        }
                    }
                }
            } catch (error) {
                console.error("Error checking App Service auth:", error);
                setAppServiceAuthChecked(true);
            }
        };

        checkAppServiceAuth();
    }, [msalReady]); // Run when MSAL is ready

    // Show loading state while initializing
    if (useLogin && (!msalReady || !appServiceAuthChecked) && !initError) {
        return (
            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "100vh"
                }}
            >
                <div>Initializing...</div>
            </div>
        );
    }

    // Show error if initialization failed
    if (initError) {
        return (
            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "100vh",
                    flexDirection: "column",
                    gap: "1rem"
                }}
            >
                <div>Authentication initialization failed</div>
                <div style={{ color: "red" }}>{initError.message}</div>
                <button
                    onClick={() => {
                        sessionStorage.clear();
                        window.location.reload();
                    }}
                >
                    Retry
                </button>
            </div>
        );
    }

    // Render with MSAL provider if using login
    if (useLogin) {
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
    }

    // Render without MSAL if not using login
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
};

export default LayoutWrapper;
