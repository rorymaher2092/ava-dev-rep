import React, { useState, useEffect } from "react";
import { loginToMicrosoft, logoutFromMicrosoft, isMicrosoftAuthenticated, getUsername } from "./authConfig";

export const MicrosoftSignIn: React.FC = () => {
    const [isMsAuthenticated, setIsMsAuthenticated] = useState(false);
    const [msUsername, setMsUsername] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        checkMicrosoftAuth();
    }, []);

    const checkMicrosoftAuth = async () => {
        const isAuth = await isMicrosoftAuthenticated();
        setIsMsAuthenticated(isAuth);

        if (isAuth) {
            const username = await getUsername();
            setMsUsername(username);
        }
    };

    const handleMicrosoftLogin = async () => {
        setLoading(true);
        try {
            await loginToMicrosoft();
            await checkMicrosoftAuth();
        } catch (error) {
            console.error("Microsoft login failed:", error);
            alert("Failed to sign in to Microsoft. Please try again.");
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
