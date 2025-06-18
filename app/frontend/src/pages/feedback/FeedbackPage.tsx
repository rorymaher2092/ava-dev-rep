import React, { useEffect, useState } from 'react';
import { Stack, Text, DetailsList, DetailsListLayoutMode, IColumn, SelectionMode, Spinner, SpinnerSize, MessageBar, MessageBarType, DefaultButton, Dropdown, IDropdownOption } from '@fluentui/react';
import { getToken } from '../../authConfig';
import { useMsal } from '@azure/msal-react';

interface FeedbackItem {
    id: string;
    responseId: string;
    feedback: string;
    comments: string;
    timestamp: number;
    userId: string;
    username: string;
    name: string;
}

const FeedbackPage: React.FC = () => {
    const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<string | undefined>(undefined);
    const { instance } = useMsal();

    const columns: IColumn[] = [
        { key: 'timestamp', name: 'Date', fieldName: 'timestamp', minWidth: 100, maxWidth: 150, 
          onRender: (item: FeedbackItem) => new Date(item.timestamp * 1000).toLocaleString() },
        { key: 'name', name: 'User', fieldName: 'name', minWidth: 100, maxWidth: 200 },
        { key: 'feedback', name: 'Feedback', fieldName: 'feedback', minWidth: 100, maxWidth: 100,
          onRender: (item: FeedbackItem) => (
            <Text style={{ color: item.feedback === 'positive' ? 'green' : 'red' }}>
                {item.feedback === 'positive' ? '👍 Positive' : '👎 Negative'}
            </Text>
          )
        },
        { key: 'comments', name: 'Comments', fieldName: 'comments', minWidth: 200 },
        { key: 'responseId', name: 'Response ID', fieldName: 'responseId', minWidth: 150 }
    ];

    const filterOptions: IDropdownOption[] = [
        { key: 'all', text: 'All Feedback' },
        { key: 'positive', text: 'Positive Only' },
        { key: 'negative', text: 'Negative Only' }
    ];

    const fetchFeedback = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = await getToken(instance);
            let url = '/feedback/list?limit=100';
            if (filterType && filterType !== 'all') {
                url += `&type=${filterType}`;
            }
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`Error fetching feedback: ${response.statusText}`);
            }
            
            const data = await response.json();
            setFeedback(data.items);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFeedback();
    }, [filterType]);

    const handleFilterChange = (_: React.FormEvent<HTMLDivElement>, option?: IDropdownOption) => {
        setFilterType(option?.key as string);
    };

    return (
        <Stack tokens={{ childrenGap: 20 }} style={{ padding: 20 }}>
            <Stack horizontal horizontalAlign="space-between">
                <Text variant="xxLarge">Feedback Dashboard</Text>
                <Stack horizontal tokens={{ childrenGap: 10 }}>
                    <Dropdown
                        label="Filter by"
                        selectedKey={filterType || 'all'}
                        onChange={handleFilterChange}
                        options={filterOptions}
                        styles={{ dropdown: { width: 200 } }}
                    />
                    <DefaultButton text="Refresh" onClick={fetchFeedback} />
                </Stack>
            </Stack>
            
            {error && (
                <MessageBar messageBarType={MessageBarType.error}>
                    {error}
                </MessageBar>
            )}
            
            {loading ? (
                <Spinner size={SpinnerSize.large} label="Loading feedback..." />
            ) : (
                <>
                    <Text>{feedback.length} feedback items found</Text>
                    <DetailsList
                        items={feedback}
                        columns={columns}
                        layoutMode={DetailsListLayoutMode.justified}
                        selectionMode={SelectionMode.none}
                        isHeaderVisible={true}
                    />
                </>
            )}
        </Stack>
    );
};

export default FeedbackPage;