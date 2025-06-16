import { DefaultButton } from "@fluentui/react";
import { useMsal } from "@azure/msal-react";
import { useTranslation } from "react-i18next";
import * as microsoftTeams from "@microsoft/teams-js";

import styles from "./LoginButton.module.css";
import { getRedirectUri, loginRequest, appServicesLogout, getUsername, checkLoggedIn } from "../../authConfig";
import { useState, useEffect, useContext } from "react";
import { LoginContext } from "../../loginContext";

export const LoginButton = () => {
    const { instance } = useMsal();
    const { loggedIn, setLoggedIn } = useContext(LoginContext);
    const activeAccount = instance.getActiveAccount();
    const [username, setUsername] = useState("");
    const [isInTeams, setIsInTeams] = useState(false);
    const { t } = useTranslation();

    useEffect(() => {
        // Check if running in Teams
        try {
            microsoftTeams.app.initialize().then(() => {
                microsoftTeams.app.getContext().then(() => {
                    setIsInTeams(true);
                    console.log("Teams context detected in LoginButton");
                });
            });
        } catch (error) {
            console.log("Not in Teams context");
        }

        // Try to auto-login if there's an active account
        const autoLogin = async () => {
            if (instance.getAllAccounts().length > 0) {
                // We have accounts, make sure one is active
                if (!instance.getActiveAccount()) {
                    instance.setActiveAccount(instance.getAllAccounts()[0]);
                }
                setLoggedIn(true);
            }
        };
        
        autoLogin();

        const fetchUsername = async () => {
            const name = await getUsername(instance);
            if (name) {
                setUsername(name);
                setLoggedIn(true);
            }
        };

        fetchUsername();
        
        // Check login status and username on component mount and every 2 seconds
        const checkLoginStatus = async () => {
            const isLoggedIn = await checkLoggedIn(instance);
            if (isLoggedIn !== loggedIn) {
                setLoggedIn(isLoggedIn);
            }
            
            if (isLoggedIn) {
                const currentUsername = await getUsername(instance);
                if (currentUsername && currentUsername !== username) {
                    setUsername(currentUsername);
                }
            }
        };
        
        // Initial check
        checkLoginStatus();
        
        // Set up interval for periodic checks
        const intervalId = setInterval(checkLoginStatus, 2000);
        
        // Clean up interval on unmount
        return () => clearInterval(intervalId);
    }, [instance, loggedIn, username]);

    const handleTeamsLogin = async () => {
        try {
            // Direct SSO token acquisition for Teams desktop client
            const token = await microsoftTeams.authentication.getAuthToken();
            console.log("Teams authentication successful");
            sessionStorage.setItem('teamsAuthToken', token);
            setLoggedIn(true);
            const context = await microsoftTeams.app.getContext();
            setUsername(context.user?.userPrincipalName || "");
        } catch (error) {
            console.error("Teams authentication failed:", error);
        }
    };

    const handleLoginPopup = () => {
        // Check if we already have accounts but just need to set one active
        const allAccounts = instance.getAllAccounts();
        if (allAccounts.length > 0) {
            instance.setActiveAccount(allAccounts[0]);
            setLoggedIn(true);
            setUsername(allAccounts[0].name || allAccounts[0].username || "");
            return;
        }
        
        // If in Teams, use Teams authentication
        if (isInTeams) {
            handleTeamsLogin();
            return;
        }

        /**
         * When using popup and silent APIs, we recommend setting the redirectUri to a blank page or a page
         * that does not implement MSAL. Keep in mind that all redirect routes must be registered with the application
         * For more information, please follow this link: https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/login-user.md#redirecturi-considerations
         */
        instance
            .loginPopup({
                ...loginRequest,
                redirectUri: getRedirectUri()
            })
            .catch(error => console.log(error))
            .then(async () => {
                setLoggedIn(await checkLoggedIn(instance));
                setUsername((await getUsername(instance)) ?? "");
            });
    };

    const handleTeamsLogout = async () => {
        try {
            await microsoftTeams.authentication.notifySuccess("logout");
            setLoggedIn(false);
            setUsername("");
        } catch (error) {
            console.error("Teams logout failed:", error);
        }
    };

    const handleLogoutPopup = () => {
        // If in Teams, use Teams logout
        if (isInTeams) {
            handleTeamsLogout();
            return;
        }

        if (activeAccount) {
            instance
                .logoutPopup({
                    mainWindowRedirectUri: "/", // redirects the top level app after logout
                    account: instance.getActiveAccount()
                })
                .catch(error => console.log(error))
                .then(async () => {
                    setLoggedIn(await checkLoggedIn(instance));
                    setUsername((await getUsername(instance)) ?? "");
                });
        } else {
            appServicesLogout();
        }
    };
    return (
        <DefaultButton
            text={loggedIn ? `${username || t("loading")}` : `${t("login")}`}
            className={styles.loginButton}
            onClick={loggedIn ? handleLogoutPopup : handleLoginPopup}
        ></DefaultButton>
    );
};
