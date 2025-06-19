import React from 'react';

interface AdminRouteProps {
    children: React.ReactNode;
}

const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
    // Simply render children - no authentication check needed since we simplified admin access
    return <>{children}</>;
};

export default AdminRoute;