import React, { useEffect, useState } from 'react';
import { Stack, Text, MessageBar, MessageBarType, Spinner, SpinnerSize } from '@fluentui/react';
import { getToken, getTokenClaims } from '../../authConfig';
import { useMsal } from '@azure/msal-react';

const AdminCheckPage: React.FC = () => {
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [userInfo, setUserInfo] = useState<any>(null);
    const [adminCheckResult, setAdminCheckResult] = useState<any>(null);
    const { instance } = useMsal();

    useEffect(() => {
        const checkAdmin = async () => {
            try {
                // Get user claims
                const claims = await getTokenClaims(instance);
                setUserInfo({
                    name: claims?.name,
                    email: claims?.preferred_username,
                    roles: claims?.roles || []
                });
                
                // Check admin status with backend
                const token = await getToken(instance);
                const response = await fetch('/admin/check', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    setAdminCheckResult(data);
                } else {
                    setError(`Admin check failed: ${response.status} ${response.statusText}`);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred');
            } finally {
                setLoading(false);
            }
        };
        
        checkAdmin();
    }, [instance]);

    return (
        <Stack tokens={{ childrenGap: 20 }} style={{ padding: 20 }}>
            <Text variant="xxLarge">Admin Check</Text>
            
            {error && (
                <MessageBar messageBarType={MessageBarType.error}>
                    {error}
                </MessageBar>
            )}
            
            {loading ? (
                <Spinner size={SpinnerSize.large} label="Checking admin status..." />
            ) : (
                <>
                    <Stack tokens={{ childrenGap: 10 }}>
                        <Text variant="large">User Information</Text>
                        <pre style={{ 
                            backgroundColor: 'var(--surface)', 
                            color: 'var(--text)',
                            padding: '1rem', 
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)'
                        }}>
                            {JSON.stringify(userInfo, null, 2)}
                        </pre>
                    </Stack>
                    
                    <Stack tokens={{ childrenGap: 10 }}>
                        <Text variant="large">Admin Check Result</Text>
                        <pre style={{ 
                            backgroundColor: 'var(--surface)', 
                            color: 'var(--text)',
                            padding: '1rem', 
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)'
                        }}>
                            {JSON.stringify(adminCheckResult, null, 2)}
                        </pre>
                    </Stack>
                    
                    <MessageBar messageBarType={adminCheckResult?.isAdmin ? MessageBarType.success : MessageBarType.error}>
                        {adminCheckResult?.isAdmin 
                            ? "You have admin access!" 
                            : "You do not have admin access."}
                    </MessageBar>
                </>
            )}
        </Stack>
    );
};

export default AdminCheckPage;