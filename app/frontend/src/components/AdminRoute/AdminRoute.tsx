import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { LoginContext } from '../../loginContext';

interface AdminRouteProps {
    children: React.ReactNode;
}

const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
    const { loggedIn } = useContext(LoginContext);
    
    return loggedIn ? <>{children}</> : <Navigate to="/" replace />;
};

export default AdminRoute;