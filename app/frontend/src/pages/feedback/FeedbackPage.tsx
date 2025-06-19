import React, { useEffect, useState } from 'react';
import { Stack, Text, DetailsList, DetailsListLayoutMode, IColumn, SelectionMode, Spinner, SpinnerSize, MessageBar, MessageBarType, DefaultButton, Dropdown, IDropdownOption, ProgressIndicator } from '@fluentui/react';
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
        { key: 'timestamp', name: 'Date', fieldName: 'timestamp', minWidth: 120, maxWidth: 150, 
          onRender: (item: FeedbackItem) => (
            <Text style={{ color: 'var(--text)' }}>
                {new Date(item.timestamp * 1000).toLocaleDateString()} {new Date(item.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </Text>
          )
        },
        { key: 'name', name: 'User', fieldName: 'name', minWidth: 120, maxWidth: 180,
          onRender: (item: FeedbackItem) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ 
                width: '32px', 
                height: '32px', 
                borderRadius: '50%', 
                backgroundColor: 'var(--primary)', 
                color: 'white', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontSize: '14px',
                fontWeight: 'bold'
              }}>
                {item.name ? item.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <Text style={{ color: 'var(--text)' }}>{item.name || 'Unknown'}</Text>
            </div>
          )
        },
        { key: 'feedback', name: 'Feedback', fieldName: 'feedback', minWidth: 120, maxWidth: 120,
          onRender: (item: FeedbackItem) => (
            <div style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '16px',
              backgroundColor: item.feedback === 'positive' ? 'rgba(40, 167, 69, 0.2)' : 'rgba(220, 53, 69, 0.2)',
              color: item.feedback === 'positive' ? '#28a745' : '#dc3545',
              fontSize: '14px',
              fontWeight: '500'
            }}>
              <span style={{ fontSize: '16px' }}>
                {item.feedback === 'positive' ? '👍' : '👎'}
              </span>
              {item.feedback === 'positive' ? 'Positive' : 'Negative'}
            </div>
          )
        },
        { key: 'comments', name: 'Comments', fieldName: 'comments', minWidth: 250,
          onRender: (item: FeedbackItem) => (
            <Text style={{ color: 'var(--text)' }} title={item.comments}>
              {item.comments || <em style={{ color: 'var(--text-secondary)' }}>No comments</em>}
            </Text>
          )
        },
        { key: 'responseId', name: 'Response ID', fieldName: 'responseId', minWidth: 120,
          onRender: (item: FeedbackItem) => (
            <Text style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '12px' }}>
              {item.responseId.substring(0, 8)}...
            </Text>
          )
        }
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

    // Calculate statistics
    const totalFeedback = feedback.length;
    const positiveFeedback = feedback.filter(f => f.feedback === 'positive').length;
    const negativeFeedback = feedback.filter(f => f.feedback === 'negative').length;
    const positivePercentage = totalFeedback > 0 ? (positiveFeedback / totalFeedback) : 0;

    return (
        <div style={{ 
            padding: 20, 
            backgroundColor: 'var(--background)', 
            color: 'var(--text)', 
            minHeight: '100vh' 
        }}>
            <Stack tokens={{ childrenGap: 20 }}>
                <Stack horizontal horizontalAlign="space-between">
                    <Text variant="xxLarge" style={{ color: 'var(--text)' }}>Feedback Dashboard</Text>
                    <Stack horizontal tokens={{ childrenGap: 10 }}>
                        <Dropdown
                            label="Filter by"
                            selectedKey={filterType || 'all'}
                            onChange={handleFilterChange}
                            options={filterOptions}
                            styles={{ 
                                dropdown: { width: 200 },
                                label: { color: 'var(--text)' },
                                title: { 
                                    backgroundColor: 'var(--surface)', 
                                    color: 'var(--text)', 
                                    border: '1px solid var(--border)' 
                                },
                                callout: { 
                                    backgroundColor: 'var(--surface)', 
                                    border: '1px solid var(--border)' 
                                },
                                dropdownItem: { 
                                    backgroundColor: 'var(--surface)', 
                                    color: 'var(--text)' 
                                },
                                dropdownItemHovered: { 
                                    backgroundColor: 'var(--surface-hover)', 
                                    color: 'var(--text)' 
                                }
                            }}
                        />
                        <DefaultButton 
                            text="Refresh" 
                            onClick={fetchFeedback}
                            styles={{
                                root: { 
                                    backgroundColor: 'var(--surface)', 
                                    color: 'var(--text)', 
                                    border: '1px solid var(--border)' 
                                },
                                rootHovered: { 
                                    backgroundColor: 'var(--surface-hover)', 
                                    color: 'var(--text)' 
                                }
                            }}
                        />
                    </Stack>
                </Stack>
                
                {error && (
                    <MessageBar messageBarType={MessageBarType.error}>
                        {error}
                    </MessageBar>
                )}
                
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                        <Spinner size={SpinnerSize.large} label="Loading feedback..." />
                    </div>
                ) : (
                    <>
                        {/* Statistics Cards */}
                        <Stack horizontal tokens={{ childrenGap: 20 }} wrap>
                            <div style={{
                                backgroundColor: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                padding: '20px',
                                minWidth: '200px',
                                flex: 1
                            }}>
                                <Text variant="large" style={{ color: 'var(--text)', fontWeight: '600' }}>
                                    Total Feedback
                                </Text>
                                <Text variant="xxLarge" style={{ color: 'var(--primary)', fontWeight: 'bold', display: 'block', marginTop: '8px' }}>
                                    {totalFeedback}
                                </Text>
                            </div>
                            
                            <div style={{
                                backgroundColor: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                padding: '20px',
                                minWidth: '200px',
                                flex: 1
                            }}>
                                <Text variant="large" style={{ color: 'var(--text)', fontWeight: '600' }}>
                                    Positive Feedback
                                </Text>
                                <Stack horizontal verticalAlign="end" tokens={{ childrenGap: 10 }} style={{ marginTop: '8px' }}>
                                    <Text variant="xxLarge" style={{ color: '#28a745', fontWeight: 'bold' }}>
                                        {positiveFeedback}
                                    </Text>
                                    <Text style={{ color: 'var(--text-secondary)' }}>
                                        ({Math.round(positivePercentage * 100)}%)
                                    </Text>
                                </Stack>
                            </div>
                            
                            <div style={{
                                backgroundColor: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                padding: '20px',
                                minWidth: '200px',
                                flex: 1
                            }}>
                                <Text variant="large" style={{ color: 'var(--text)', fontWeight: '600' }}>
                                    Negative Feedback
                                </Text>
                                <Stack horizontal verticalAlign="end" tokens={{ childrenGap: 10 }} style={{ marginTop: '8px' }}>
                                    <Text variant="xxLarge" style={{ color: '#dc3545', fontWeight: 'bold' }}>
                                        {negativeFeedback}
                                    </Text>
                                    <Text style={{ color: 'var(--text-secondary)' }}>
                                        ({Math.round((1 - positivePercentage) * 100)}%)
                                    </Text>
                                </Stack>
                            </div>
                        </Stack>

                        {/* Satisfaction Progress Bar */}
                        {totalFeedback > 0 && (
                            <div style={{
                                backgroundColor: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                padding: '20px'
                            }}>
                                <Text variant="large" style={{ color: 'var(--text)', fontWeight: '600', marginBottom: '12px', display: 'block' }}>
                                    User Satisfaction
                                </Text>
                                <ProgressIndicator 
                                    percentComplete={positivePercentage}
                                    description={`${Math.round(positivePercentage * 100)}% positive feedback`}
                                    styles={{
                                        progressBar: { backgroundColor: positivePercentage > 0.7 ? '#28a745' : positivePercentage > 0.5 ? '#ffc107' : '#dc3545' }
                                    }}
                                />
                            </div>
                        )}

                        <DetailsList
                            items={feedback}
                            columns={columns}
                            layoutMode={DetailsListLayoutMode.justified}
                            selectionMode={SelectionMode.none}
                            isHeaderVisible={true}
                            styles={{
                                root: { 
                                    backgroundColor: 'var(--surface)', 
                                    border: '1px solid var(--border)',
                                    borderRadius: '8px',
                                    overflow: 'hidden'
                                },
                                headerWrapper: { 
                                    backgroundColor: 'var(--surface-hover)', 
                                    borderBottom: '1px solid var(--border)'
                                },
                                contentWrapper: { backgroundColor: 'var(--surface)' }
                            }}
                        />
                        
                        {feedback.length === 0 && (
                            <div style={{ 
                                textAlign: 'center', 
                                padding: '40px',
                                backgroundColor: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px'
                            }}>
                                <Text style={{ color: 'var(--text-secondary)', fontSize: '18px' }}>
                                    No feedback found
                                </Text>
                                <Text style={{ color: 'var(--text-secondary)', display: 'block', marginTop: '8px' }}>
                                    Feedback will appear here once users start rating responses
                                </Text>
                            </div>
                        )}
                    </>
                )}
            </Stack>
        </div>
    );
};

export default FeedbackPage;