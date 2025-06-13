import React, { useState, useEffect, useRef, RefObject } from "react";
import { Outlet, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styles from "./Layout.module.css";

import { useLogin } from "../../authConfig";
import vocuslogo from "../../assets/vocus.png";
import vocuslogodark from "../../assets/vocusdark.png";
import { LoginButton } from "../../components/LoginButton";
import { IconButton } from "@fluentui/react";

const Layout = () => {
    const { t } = useTranslation();
    const [menuOpen, setMenuOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [theme, setTheme] = useState<"light" | "dark">("light");
    const menuRef: RefObject<HTMLDivElement> = useRef(null);

    const toggleMenu = () => setMenuOpen(!menuOpen);
    const toggleSettings = () => setSettingsOpen(!settingsOpen);

    const toggleTheme = () => {
        const newTheme = theme === "light" ? "dark" : "light";
        document.body.dataset.theme = newTheme;
        localStorage.setItem("theme", newTheme);
        setTheme(newTheme);
    };

    useEffect(() => {
        const stored = localStorage.getItem("theme") as "light" | "dark" | null;
        const preferred = stored || "light";
        document.body.dataset.theme = preferred;
        setTheme(preferred);
    }, []);

    const handleClickOutside = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
            setMenuOpen(false);
            setSettingsOpen(false);
        }
    };

    useEffect(() => {
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const logoSrc = theme === "light" ? vocuslogodark : vocuslogo;

    return (
        <div className={styles.layout}>
            <header className={styles.header} role="banner">
                <div className={styles.headerContainer} ref={menuRef}>
                    <div className={styles.headerCenterContainer}>
                        <Link to="/" className={styles.logoLink}>
                            <img src={logoSrc} className={styles.headerLogo} alt="Vocus logo" />
                        </Link>
                        <h3 className={styles.headerTitle}>Advanced Vocus Assistant (Ava)</h3>
                    </div>
                    <div className={styles.loginMenuContainer}>
                        {useLogin && <LoginButton />}
                        <button onClick={toggleSettings} className={styles.settingsToggle}>
                            ⚙️
                        </button>
                        {settingsOpen && (
                            <div className={styles.dropdownMenu}>
                                <button onClick={toggleTheme}>{theme === "dark" ? "🌞 Light Mode" : "🌙 Dark Mode"}</button>
                                <button onClick={() => alert("Coming soon!")}>Feedback</button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <main className={styles.mainContent}>
                <Outlet />
            </main>

            <footer className={styles.footer}>
                <p>&copy; {new Date().getFullYear()} Vocus Group. All rights reserved.</p>
            </footer>
        </div>
    );
};

export default Layout;
