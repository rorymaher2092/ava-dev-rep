// LayoutWrapper.tsx
import { EventType } from "@azure/msal-browser";
import { checkLoggedIn, useLogin, msalInstance, initializeMsal } from "./authConfig";
import { useEffect, useState } from "react";
import { MsalProvider } from "@azure/msal-react";
import { LoginContext } from "./loginContext";
import Layout from "./pages/layout/Layout";

const LayoutWrapper = () => {
    const [loggedIn, setLoggedIn] = useState(false);
    const [msalReady, setMsalReady] = useState(false);
    const [initError, setInitError] = useState<Error | null>(null);

    // Initialize MSAL
    useEffect(() => {
        const initMsal = async () => {
            if (useLogin) {
                try {
                    await initializeMsal();
                    setMsalReady(true);
                    console.log("MSAL initialization complete");

                    // Check if already logged in to Microsoft
                    const accounts = msalInstance.getAllAccounts();
                    if (accounts.length > 0) {
                        console.log("Microsoft account found");
                        msalInstance.setActiveAccount(accounts[0]);
                    }

                    // Set up event callbacks
                    const callbackId = msalInstance.addEventCallback(event => {
                        if (event.eventType === EventType.LOGIN_SUCCESS) {
                            console.log("Microsoft login success");
                        }
                        if (event.eventType === EventType.LOGOUT_SUCCESS) {
                            console.log("Microsoft logout success");
                        }
                    });

                    return () => {
                        if (callbackId) {
                            msalInstance.removeEventCallback(callbackId);
                        }
                    };
                } catch (error) {
                    console.error("Failed to initialize MSAL:", error);
                    setInitError(error as Error);
                }
            } else {
                setMsalReady(true);
            }
        };

        initMsal();
    }, []);

    // Check App Service auth status
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const isLoggedIn = await checkLoggedIn();
                setLoggedIn(isLoggedIn);
                if (isLoggedIn) {
                    console.log("User logged in via App Service auth (Okta)");
                }
            } catch (error) {
                console.error("Error checking auth:", error);
            }
        };

        checkAuth();
    }, []);

    // Show loading state
    if (useLogin && !msalReady && !initError) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
                <div>Initializing...</div>
            </div>
        );
    }

    // Show error state
    if (initError) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", flexDirection: "column", gap: "1rem" }}>
                <div>Initialization failed</div>
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

    // Render with MSAL provider
    if (useLogin) {
        return (
            <MsalProvider instance={msalInstance}>
                <LoginContext.Provider value={{ loggedIn, setLoggedIn }}>
                    <Layout />
                </LoginContext.Provider>
            </MsalProvider>
        );
    }

    // Render without MSAL
    return (
        <LoginContext.Provider value={{ loggedIn, setLoggedIn }}>
            <Layout />
        </LoginContext.Provider>
    );
};

export default LayoutWrapper;
