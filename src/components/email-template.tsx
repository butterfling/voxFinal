import * as React from 'react';

interface EmailTemplateProps {
  roomName: string;
  summaryUrl: string;
}

export const EmailTemplate: React.FC<Readonly<EmailTemplateProps>> = ({
  roomName,
  summaryUrl,
}) => (
  <div style={{
    fontFamily: 'Arial, sans-serif',
    maxWidth: '600px',
    margin: '0 auto',
    padding: '20px',
  }}>
    <h2 style={{
      color: '#333',
      marginBottom: '20px',
    }}>Your VoxBridge Summary is Ready!</h2>
    
    <p style={{
      color: '#666',
      fontSize: '16px',
      lineHeight: '1.5',
      marginBottom: '15px',
    }}>
      The summary for your meeting "{roomName}" has been generated and is now available.
    </p>
    
    <div style={{
      marginTop: '25px',
      marginBottom: '25px',
    }}>
      <a
        href={summaryUrl}
        style={{
          backgroundColor: '#24ECA3',
          color: '#000',
          padding: '12px 24px',
          borderRadius: '5px',
          textDecoration: 'none',
          display: 'inline-block',
          fontWeight: 'bold',
        }}
      >
        View Summary
      </a>
    </div>
    
    <p style={{
      color: '#999',
      fontSize: '14px',
      marginTop: '30px',
    }}>
      This link will expire in 7 days.
    </p>
    
    <div style={{
      marginTop: '40px',
      borderTop: '1px solid #eee',
      paddingTop: '20px',
    }}>
      <p style={{
        color: '#666',
        fontSize: '14px',
        margin: '0',
      }}>
        Best regards,<br />
        The VoxBridge Team
      </p>
    </div>
  </div>
);
