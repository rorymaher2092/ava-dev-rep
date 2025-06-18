import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { getTokenClaims } from '../../authConfig';

interface AdminRouteProps {
    children: React.ReactNode;
}

const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
    const { instance } = useMsal();
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        const checkAdminRole = async () => {
            try {
                const claims = await getTokenClaims(instance);
                const roles = claims?.roles as string[] || [];
                setIsAdmin(roles.includes('admin'));
            } catch (error) {
                console.error('Error checking admin role:', error);
                setIsAdmin(false);
            } finally {
                setLoading(false);
            }
        };

        checkAdminRole();
    }, [instance]);

    if (loading) {
        return <div>Loading...</div>;
    }

    return isAdmin ? <>{children}</> : <Navigate to="/" replace />;
};

export default AdminRoute;