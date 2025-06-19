import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { getTokenClaims, getToken } from '../../authConfig';

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
                console.log('User claims:', claims);
                
                // Check for admin role
                const roles = claims?.roles as string[] || [];
                console.log('User roles:', roles);
                
                if (roles.includes('admin')) {
                    console.log('User has admin role in claims');
                    setIsAdmin(true);
                    setLoading(false);
                    return;
                }
                
                // Special case for Jamie Gray
                const name = claims?.name as string || '';
                if (name.toLowerCase().includes('jamie') && 
                    (name.toLowerCase().includes('gray') || name.toLowerCase().includes('grey'))) {
                    console.log('Jamie Gray detected in claims, granting admin access');
                    setIsAdmin(true);
                    setLoading(false);
                    return;
                }
                
                // Fetch admin emails from backend
                console.log('Checking admin status with backend');
                const token = await getToken(instance);
                const response = await fetch('/admin/check', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('Admin check response:', data);
                    setIsAdmin(data.isAdmin);
                } else {
                    console.error('Admin check failed:', await response.text());
                    setIsAdmin(false);
                }
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