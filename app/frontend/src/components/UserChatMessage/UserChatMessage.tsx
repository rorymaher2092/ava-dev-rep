import styles from "./UserChatMessage.module.css";

interface Props {
    message: string;
}

export const UserChatMessage = ({ message }: Props) => {
    return (
        <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: '16px'
        }}>
            <div className={styles.userMessage}>
                <div style={{
                    fontSize: '15px',
                    lineHeight: '1.4',
                    wordWrap: 'break-word'
                }}>
                    <span>{message}</span>
                </div>
                
                {/* User indicator */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    marginTop: '8px',
                    gap: '6px'
                }}>
                    <div style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(0,0,0,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        fontWeight: 'bold'
                    }}>
                        👤
                    </div>
                    <span style={{
                        fontSize: '11px',
                        fontWeight: '500',
                        opacity: 0.8
                    }}>
                        You
                    </span>
                </div>
            </div>
        </div>
    );
};