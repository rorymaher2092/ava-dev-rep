import React, { useEffect, useState } from 'react';
import { Stack, Text, DetailsList, DetailsListLayoutMode, IColumn, SelectionMode, Spinner, SpinnerSize, MessageBar, MessageBarType, DefaultButton, TextField, PrimaryButton } from '@fluentui/react';
import { getToken } from '../../authConfig';
import { useMsal } from '@azure/msal-react';

interface Admin {
    email: string;
    name: string;
}

const AdminPage: React.FC = () => {
    const [admins, setAdmins] = useState<Admin[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [newAdminEmail, setNewAdminEmail] = useState<string>('');
    const [newAdminName, setNewAdminName] = useState<string>('');
    const [addingAdmin, setAddingAdmin] = useState<boolean>(false);
    const { instance } = useMsal();

    const columns: IColumn[] = [
        { key: 'name', name: 'Name', fieldName: 'name', minWidth: 150, maxWidth: 200 },
        { key: 'email', name: 'Email', fieldName: 'email', minWidth: 200 },
        { key: 'actions', name: 'Actions', minWidth: 100, 
          onRender: (item: Admin) => (
            <DefaultButton 
                text="Remove" 
                onClick={() => handleRemoveAdmin(item.email)}
                styles={{
                    root: {
                        backgroundColor: 'var(--error)',
                        color: 'var(--vocus-white)',
                        border: '1px solid var(--error)'
                    },
                    rootHovered: {
                        backgroundColor: '#dc2626',
                        color: 'var(--vocus-white)'
                    }
                }}
            />
          )
        }
    ];

    const fetchAdmins = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = await getToken();
            const response = await fetch('/admin/list', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`Error fetching admins: ${response.statusText}`);
            }
            
            const data = await response.json();
            setAdmins(data.admins);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleAddAdmin = async () => {
        if (!newAdminEmail || !newAdminName) {
            setError('Email and name are required');
            return;
        }
        
        setAddingAdmin(true);
        setError(null);
        
        try {
            const token = await getToken();
            const response = await fetch('/admin/add', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: newAdminEmail,
                    name: newAdminName
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Error adding admin: ${response.statusText}`);
            }
            
            // Reset form and refresh admins
            setNewAdminEmail('');
            setNewAdminName('');
            fetchAdmins();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            setAddingAdmin(false);
        }
    };

    const handleRemoveAdmin = async (email: string) => {
        if (!confirm(`Are you sure you want to remove ${email} as an admin?`)) {
            return;
        }
        
        setError(null);
        
        try {
            const token = await getToken();
            const response = await fetch('/admin/remove', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Error removing admin: ${response.statusText}`);
            }
            
            // Refresh admins
            fetchAdmins();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred');
        }
    };

    useEffect(() => {
        fetchAdmins();
    }, []);

    return (
        <Stack tokens={{ childrenGap: 20 }} style={{ padding: 20 }}>
            <Text variant="xxLarge">Admin Management</Text>
            
            {error && (
                <MessageBar messageBarType={MessageBarType.error}>
                    {error}
                </MessageBar>
            )}
            
            <Stack tokens={{ childrenGap: 10 }}>
                <Text variant="large">Add New Admin</Text>
                <Stack horizontal tokens={{ childrenGap: 10 }}>
                    <TextField 
                        label="Email" 
                        value={newAdminEmail} 
                        onChange={(_, value) => setNewAdminEmail(value || '')}
                        styles={{ root: { width: 300 } }}
                    />
                    <TextField 
                        label="Name" 
                        value={newAdminName} 
                        onChange={(_, value) => setNewAdminName(value || '')}
                        styles={{ root: { width: 300 } }}
                    />
                    <PrimaryButton 
                        text="Add Admin" 
                        onClick={handleAddAdmin} 
                        disabled={addingAdmin || !newAdminEmail || !newAdminName}
                        styles={{ root: { marginTop: 29 } }}
                    />
                </Stack>
            </Stack>
            
            <Stack tokens={{ childrenGap: 10 }}>
                <Text variant="large">Current Admins</Text>
                {loading ? (
                    <Spinner size={SpinnerSize.large} label="Loading admins..." />
                ) : (
                    <>
                        <Text>{admins.length} admins found</Text>
                        <DetailsList
                            items={admins}
                            columns={columns}
                            layoutMode={DetailsListLayoutMode.justified}
                            selectionMode={SelectionMode.none}
                            isHeaderVisible={true}
                        />
                    </>
                )}
            </Stack>
        </Stack>
    );
};

export default AdminPage;