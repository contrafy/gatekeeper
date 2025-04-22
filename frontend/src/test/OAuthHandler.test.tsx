import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import OAuthHandler from '../components/OAuthHandler';

describe('OAuthHandler', () => {
  it('should display error when token validation fails', () => {
    const mockValidateToken = vi.fn().mockRejectedValue(new Error('Invalid token'));
    
    render(
      <OAuthHandler
        validateToken={mockValidateToken}
        onTokenValid={() => {}}
        onTokenInvalid={() => {}}
      />
    );

    expect(screen.getByText(/error validating token/i)).toBeInTheDocument();
  });

  it('should call onTokenInvalid when token validation fails', () => {
    const mockValidateToken = vi.fn().mockRejectedValue(new Error('Invalid token'));
    const handleTokenInvalid = vi.fn();
    
    render(
      <OAuthHandler
        validateToken={mockValidateToken}
        onTokenValid={() => {}}
        onTokenInvalid={handleTokenInvalid}
      />
    );

    expect(handleTokenInvalid).toHaveBeenCalledTimes(1);
  });
}); 