// RedirectHandler.tsx
import { useEffect } from "react";

const RedirectHandler = () => {
    useEffect(() => {
        // The auth code is in the hash fragment after /redirect
        const hash = window.location.hash;

        console.log("RedirectHandler: Current URL:", window.location.href);

        if (hash && hash.includes("code=")) {
            console.log("RedirectHandler: Auth code found, redirecting to root");
            // Clear the attempted flag to allow retry if needed
            sessionStorage.removeItem("msal.login.attempted");
            // Redirect to root with the auth fragment
            window.location.replace("/" + hash);
        } else {
            console.log("RedirectHandler: No auth code found");
            // Still go home
            window.location.replace("/");
        }
    }, []);

    return (
        <div
            style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "100vh"
            }}
        >
            <div>Completing authentication...</div>
        </div>
    );
};

export default RedirectHandler;
