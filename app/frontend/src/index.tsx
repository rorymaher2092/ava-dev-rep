import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { HelmetProvider } from "react-helmet-async";
import { initializeIcons } from "@fluentui/react";
import * as microsoftTeams from "@microsoft/teams-js";

import "./index.css";

import Chat from "./pages/chat/Chat";
import LayoutWrapper from "./layoutWrapper";
import i18next from "./i18n/config";
import AdminRoute from "./components/AdminRoute";

// Initialize Teams SDK
try {
  microsoftTeams.app.initialize();
} catch (error) {
  console.log("Teams initialization failed or not in Teams context");
}
initializeIcons();

const router = createHashRouter([
    {
        path: "/",
        element: <LayoutWrapper />,
        children: [
            {
                index: true,
                element: <Chat />
            },
            {
                path: "feedback",
                element: <AdminRoute><React.Suspense fallback={<div>Loading...</div>}>{React.createElement(React.lazy(() => import("./pages/feedback")))}</React.Suspense></AdminRoute>
            },
            {
                path: "*",
                lazy: () => import("./pages/NoPage")
            }
        ]
    }
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <I18nextProvider i18n={i18next}>
            <HelmetProvider>
                <RouterProvider router={router} />
            </HelmetProvider>
        </I18nextProvider>
    </React.StrictMode>
);
