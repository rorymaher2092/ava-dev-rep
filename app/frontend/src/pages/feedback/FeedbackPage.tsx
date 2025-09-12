import React, { useEffect, useState } from 'react';
import { Stack, Text, DetailsList, DetailsListLayoutMode, IColumn, SelectionMode, Spinner, SpinnerSize, MessageBar, MessageBarType, DefaultButton, Dropdown, IDropdownOption, ProgressIndicator } from '@fluentui/react';
import { getToken } from '../../authConfig';
import { useMsal } from '@azure/msal-react';
import styles from './FeedbackPage.module.css';

interface FeedbackItem {
    id: string;
    responseId: string;
    feedback: string;
    comments: string;
    timestamp: number;
    userId: string;
    username: string;
    name: string;
    botId?: string;
    artifact?: string;
    question?: string;
    answer?: string;
}

const FeedbackPage: React.FC = () => {
    const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<string | undefined>(undefined);
    const [filterBot, setFilterBot] = useState<string | undefined>(undefined);
    const { instance } = useMsal();

    const columns: IColumn[] = [
        { key: 'botId', name: 'Bot', fieldName: 'botId', minWidth: 120, maxWidth: 150,
          onRender: (item: FeedbackItem) => (
            <Text style={{ color: '#e2e8f0' }}>
                {item.botId === 'ava' ? 'Ava-Search' : 
                 item.botId === 'ba' ? 'Accelerate Assistant' :
                 item.botId === 'tender' ? 'Tender Wizard' :
                 item.botId || 'Unknown'}
            </Text>
          )
        },
        { key: 'artifact', name: 'Artifact', fieldName: 'artifact', minWidth: 120, maxWidth: 180,
          onRender: (item: FeedbackItem) => (
            <Text style={{ color: '#e2e8f0' }}>
                {item.artifact ? item.artifact.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 
                 <em style={{ color: '#94a3b8' }}>None</em>}
            </Text>
          )
        },
        { key: 'timestamp', name: 'Date', fieldName: 'timestamp', minWidth: 120, maxWidth: 150, 
          onRender: (item: FeedbackItem) => (
            <Text style={{ color: '#e2e8f0' }}>
                {new Date(item.timestamp * 1000).toLocaleDateString()} {new Date(item.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </Text>
          )
        },
        { key: 'name', name: 'User', fieldName: 'name', minWidth: 120, maxWidth: 180,
          onRender: (item: FeedbackItem) => (
            <Text style={{ color: '#e2e8f0' }}>{item.name || 'Unknown'}</Text>
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
            <Text style={{ color: '#e2e8f0' }} title={item.comments}>
              {item.comments || <em style={{ color: '#94a3b8' }}>No comments</em>}
            </Text>
          )
        },
        { key: 'responseId', name: 'Response ID', fieldName: 'responseId', minWidth: 120,
          onRender: (item: FeedbackItem) => (
            <Text style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: '12px' }}>
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

    const botFilterOptions: IDropdownOption[] = [
        { key: 'all', text: 'All Bots' },
        { key: 'ava', text: 'Ava-Search' },
        { key: 'ba', text: 'Accelerate Assistant' },
        { key: 'tender', text: 'Tender Wizard' }
    ];

    const fetchFeedback = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = await getToken();
            let url = '/feedback/list?limit=100';
            if (filterType && filterType !== 'all') {
                url += `&type=${filterType}`;
            }
            if (filterBot && filterBot !== 'all') {
                url += `&bot=${filterBot}`;
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
    }, [filterType, filterBot]);

    const handleFilterChange = (_: React.FormEvent<HTMLDivElement>, option?: IDropdownOption) => {
        setFilterType(option?.key as string);
    };

    const handleBotFilterChange = (_: React.FormEvent<HTMLDivElement>, option?: IDropdownOption) => {
        setFilterBot(option?.key as string);
    };

    const exportToCSV = () => {
        const headers = ['Bot', 'Artifact', 'Date', 'User', 'Feedback', 'Comments', 'Response ID'];
        const csvData = filteredFeedback.map(item => [
            item.botId === 'ava' ? 'Ava-Search' : 
            item.botId === 'ba' ? 'Accelerate Assistant' :
            item.botId === 'tender' ? 'Tender Wizard' :
            item.botId || 'Unknown',
            item.artifact ? item.artifact.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'None',
            new Date(item.timestamp * 1000).toLocaleDateString() + ' ' + new Date(item.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
            item.name || 'Unknown',
            item.feedback === 'positive' ? 'Positive' : 'Negative',
            item.comments || '',
            item.responseId
        ]);
        
        const csvContent = [headers, ...csvData]
            .map(row => row.map(field => `"${field.toString().replace(/"/g, '""')}"`).join(','))
            .join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `feedback-export-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Calculate statistics based on current filters
    const filteredFeedback = feedback.filter(item => {
        const typeMatch = !filterType || filterType === 'all' || item.feedback === filterType;
        const botMatch = !filterBot || filterBot === 'all' || item.botId === filterBot;
        return typeMatch && botMatch;
    });
    
    const totalFeedback = filteredFeedback.length;
    const positiveFeedback = filteredFeedback.filter(f => f.feedback === 'positive').length;
    const negativeFeedback = filteredFeedback.filter(f => f.feedback === 'negative').length;
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
                            label="Filter by Bot"
                            selectedKey={filterBot || 'all'}
                            onChange={handleBotFilterChange}
                            options={botFilterOptions}
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
                                }
                            }}
                        />
                        <Dropdown
                            label="Filter by Type"
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
                                }
                            }}
                        />
                        <DefaultButton 
                            text="Export CSV" 
                            onClick={exportToCSV}
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

                        <div className={styles.feedbackTable}>
                            <DetailsList
                                items={filteredFeedback}
                                columns={columns}
                                layoutMode={DetailsListLayoutMode.justified}
                                selectionMode={SelectionMode.none}
                                isHeaderVisible={true}
                            />
                        </div>
                        
                        {filteredFeedback.length === 0 && (
                            <div style={{ 
                                textAlign: 'center', 
                                padding: '40px',
                                backgroundColor: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px'
                            }}>
                                <Text style={{ color: 'var(--text-secondary)', fontSize: '18px' }}>
                                    {feedback.length === 0 ? 'No feedback found' : 'No feedback matches current filters'}
                                </Text>
                                <Text style={{ color: 'var(--text-secondary)', display: 'block', marginTop: '8px' }}>
                                    {feedback.length === 0 ? 'Feedback will appear here once users start rating responses' : 'Try adjusting your filters to see more results'}
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