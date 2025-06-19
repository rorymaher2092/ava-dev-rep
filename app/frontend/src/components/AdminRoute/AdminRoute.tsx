import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';

interface AdminRouteProps {
    children: React.ReactNode;
}

const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
    const { instance, accounts } = useMsal();
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                // Check if user is logged in
                if (accounts.length > 0) {
                    setIsAuthenticated(true);
                } else {
                    // Try to acquire token silently to check if user is authenticated
                    const silentRequest = {
                        scopes: ["openid", "profile"],
                        account: instance.getActiveAccount() || accounts[0]
                    };
                    
                    if (silentRequest.account) {
                        await instance.acquireTokenSilent(silentRequest);
                        setIsAuthenticated(true);
                    } else {
                        setIsAuthenticated(false);
                    }
                }
            } catch (error) {
                console.error('Authentication check failed:', error);
                setIsAuthenticated(false);
            } finally {
                setLoading(false);
            }
        };

        checkAuth();
    }, [instance, accounts]);

    if (loading) {
        return <div>Loading...</div>;
    }

    return isAuthenticated ? <>{children}</> : <Navigate to="/" replace />;
};

export default AdminRoute;