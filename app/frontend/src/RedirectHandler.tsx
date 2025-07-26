// RedirectHandler.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const RedirectHandler = () => {
    const navigate = useNavigate();

    useEffect(() => {
        // Just redirect home - MSAL will handle the auth response
        navigate("/", { replace: true });
    }, [navigate]);

    return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
            <div>Completing authentication...</div>
        </div>
    );
};

export default RedirectHandler;
