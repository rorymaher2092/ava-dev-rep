// Re-export everything from api.ts and models.ts
export * from './api';
export * from './models';

// Add the new welcome message function
export async function getUserWelcomeMessage(userDetails: any): Promise<string> {
    try {
        const response = await fetch('/welcome', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userDetails })
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch welcome message');
        }
        
        const data = await response.json();
        return data.welcomeMessage || `Hello ${userDetails.name}!`;
    } catch (error) {
        console.error('Error fetching welcome message:', error);
        return `Hello ${userDetails.name}!`;
    }
}