import React, { useState, useEffect, useRef, RefObject } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styles from "./Layout.module.css";
import { useMsal } from "@azure/msal-react";
import { getTokenClaims, getToken, getUsername, useLogin } from "../../authConfig";
import vocusLogoWhite from "../../assets/vocus-logo-white.png";
import vocusLogoNavy from "../../assets/vocus-logo-navy.png";
import vocusdark from "../../assets/vocusdark.png";
import vocus from "../../assets/vocus.png";
import { LoginButton } from "../../components/LoginButton";
import { IconButton } from "@fluentui/react";
import { List24Regular } from "@fluentui/react-icons";
import { BUILD_VERSION, BUILD_TIME } from "../../buildInfo";

const Layout = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [theme, setTheme] = useState<"light" | "dark">("light");
    const [isAdmin, setIsAdmin] = useState(false);
    const menuRef: RefObject<HTMLDivElement> = useRef(null);
    const { instance } = useMsal();

    const toggleTheme = () => {
        const newTheme = theme === "light" ? "dark" : "light";
        document.body.dataset.theme = newTheme;
        localStorage.setItem("theme", newTheme);
        setTheme(newTheme);
    };

    useEffect(() => {
        const checkAdminStatus = async () => {
            try {
                console.log('Checking admin status...');
                
                // Try app services authentication
                const response = await fetch('/.auth/me');
                console.log('Auth response status:', response.status);
                
                if (response.ok) {
                    const authData = await response.json();
                    console.log('Auth data:', authData);
                    
                    if (authData.length > 0) {
                        const userClaims = authData[0].user_claims;
                        const email = userClaims.find((claim: any) => claim.typ === 'preferred_username')?.val ||
                                     userClaims.find((claim: any) => claim.typ === 'email')?.val ||
                                     userClaims.find((claim: any) => claim.typ === 'upn')?.val;
                        
                        console.log('User email from app services:', email);
                        
                        // Check if user is admin
                        const adminUserIds = ['jamie.gray@vocus.com.au', 'rory.maher@vocus.com.au', 'cal.mayhook@vocus.com.au'];
                        const isUserAdmin = adminUserIds.some(adminUserId => 
                            email?.toLowerCase() === adminUserId.toLowerCase()
                        );
                        
                        console.log('Is admin:', isUserAdmin);
                        setIsAdmin(isUserAdmin);
                        return;
                    } else {
                        console.log('No auth data - user not authenticated via container app auth');
                        // Redirect to login if not authenticated
                        window.location.href = '/.auth/login/aad';
                        return;
                    }
                }
                
                console.log('Auth endpoint not available or failed');
                setIsAdmin(false);
                
            } catch (error) {
                console.error('Error checking admin status:', error);
                setIsAdmin(false);
            }
        };
        
        checkAdminStatus();
    }, [instance]);

    useEffect(() => {
        // Check for user's preferred color scheme
        const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
        const stored = localStorage.getItem("theme") as "light" | "dark" | null;
        const preferred = stored || (prefersDark ? "dark" : "light");
        document.body.dataset.theme = preferred;
        setTheme(preferred);

        // Listen for changes in system preference
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = (e: MediaQueryListEvent) => {
            if (!localStorage.getItem("theme")) {
                const newTheme = e.matches ? "dark" : "light";
                document.body.dataset.theme = newTheme;
                setTheme(newTheme);
            }
        };

        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
    }, []);

    const logoSrc = theme === "light" ? vocusLogoNavy : vocusLogoWhite;

    return (
        <div className={styles.layout}>
            <header className={styles.header} role="banner">
                <div className={styles.headerContainer} ref={menuRef}>
                    <Link 
                        to="/?clear=true" 
                        className={styles.logoLink}
                        onClick={() => {
                            const clearChatEvent = new CustomEvent('clearChat');
                            window.dispatchEvent(clearChatEvent);
                        }}
                    >
                        <img src={logoSrc} className={styles.headerLogo} alt="Vocus logo" />
                    </Link>
                    <div className={styles.headerCenterContainer}>
                        <img src={theme === "light" ? vocusdark : vocus} className={styles.appLogo} alt="Ava logo" />
                        <h3 className={styles.headerTitle}>
                            <span className={styles.fullTitle}>Advanced Vocus Assistant</span>
                            <span className={styles.shortTitle}>Ava</span>
                        </h3>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <button
                            onClick={toggleTheme}
                            className={styles.headerButton}
                        >
                            <span>{theme === "dark" ? "🌞" : "🌙"}</span>
                            <span className={styles.buttonText}>{theme === "dark" ? "Light" : "Dark"}</span>
                        </button>

                        <button
                            onClick={() => {
                                const clearChatEvent = new CustomEvent("clearChat");
                                window.dispatchEvent(clearChatEvent);
                            }}
                            className={styles.headerButton}
                        >
                            <span>🧹</span>
                            <span className={styles.buttonText}>Clear</span>
                        </button>

                        <button
                            onClick={() => {
                                const chatHistoryEvent = new CustomEvent("openChatHistory");
                                window.dispatchEvent(chatHistoryEvent);
                            }}
                            className={styles.headerButton}
                        >
                            <span>📜</span>
                            <span className={styles.buttonText}>History</span>
                        </button>

                        {isAdmin && (
                            <button
                                onClick={() => navigate("/feedback")}
                                className={styles.headerButton}
                            >
                                <span>📊</span>
                                <span className={styles.buttonText}>Feedback</span>
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <main className={styles.mainContent}>
                <Outlet />
            </main>

            <footer className={styles.footer}>
                <p>
                    &copy; {new Date().getFullYear()} Vocus Group. All rights reserved. | v{BUILD_VERSION} ({new Date(BUILD_TIME).toLocaleDateString()})
                </p>

            </footer>
        </div>
    );
};

export default Layout;
