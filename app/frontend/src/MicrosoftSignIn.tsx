import React, { useState, useEffect } from "react";
import { loginToMicrosoft, logoutFromMicrosoft, isMicrosoftAuthenticated, getUsername, getGraphToken, clearAllMsalCache   } from "./authConfig";
import { InteractionRequiredAuthError } from "@azure/msal-browser";

export const MicrosoftSignIn: React.FC = () => {
    const [isMsAuthenticated, setIsMsAuthenticated] = useState(false);
    const [msUsername, setMsUsername] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);

    // Add the useEffect right here:
    useEffect(() => {
        checkMicrosoftAuth();

        // Validate session periodically
        const interval = setInterval(
            async () => {
                if (isMsAuthenticated) {
                    try {
                        await getGraphToken();
                    } catch (error) {
                        console.error("Session validation failed:", error);
                        await checkMicrosoftAuth(); // Force re-check
                    }
                }
            },
            5 * 60 * 1000
        );

        return () => clearInterval(interval);
    }, [isMsAuthenticated]);

    const checkMicrosoftAuth = async () => {
        try {
            setAuthError(null);
            const hasAccounts = await isMicrosoftAuthenticated();

            if (!hasAccounts) {
                setIsMsAuthenticated(false);
                setMsUsername(null);
                return;
            }

            await getGraphToken();
            setIsMsAuthenticated(true);

            const username = await getUsername();
            setMsUsername(username);
        } catch (error) {
            console.log("Auth check failed:", error);
            
            await clearAllMsalCache();
            setIsMsAuthenticated(false);
            setMsUsername(null);
            
            // ✅ Type guard the error before accessing .message
            if (error instanceof Error && error.message === "INTERACTION_REQUIRED") {
                setAuthError("Session expired. Please sign in again.");
            } else {
                // Handle other error types
                setAuthError("Authentication failed. Please sign in again.");
            }
        }
    };

    const handleMicrosoftLogin = async () => {
        setLoading(true);
        setAuthError(null);
        try {
            // ✅ Always clear cache before login attempt
            await clearAllMsalCache();
            await loginToMicrosoft();
            await checkMicrosoftAuth();
        } catch (error) {
            console.error("Microsoft login failed:", error);
            setAuthError("Failed to sign in. Please try again.");
        } finally {
            setLoading(false);
        }
    };


    const handleMicrosoftLogout = async () => {
        setLoading(true);
        try {
            await logoutFromMicrosoft();
            setIsMsAuthenticated(false);
            setMsUsername(null);
        } catch (error) {
            console.error("Microsoft logout failed:", error);
        } finally {
            setLoading(false);
        }
    };

    if (!isMsAuthenticated) {
        // Render Sign In button if the user is not authenticated
        return (
            <button
                onClick={handleMicrosoftLogin}
                disabled={loading}
                style={{
                    padding: "10px 20px",
                    backgroundColor: "#0078d4",
                    color: "white",
                    border: "none",
                    borderRadius: "5px",
                    cursor: loading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px"
                }}
            >
                <svg width="21" height="21" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                </svg>
                {loading ? "Signing in..." : "Sign in with Microsoft"}
            </button>
        );
    }

    // Render nothing or other content when signed in
    return null;
};
