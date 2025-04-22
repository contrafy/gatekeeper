import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorAlert from '../components/ErrorAlert';

describe('ErrorAlert', () => {
  it('should not render when there is no error', () => {
    render(<ErrorAlert error={null} onClose={() => {}} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should display error message when error exists', () => {
    const errorMessage = 'Test error message';
    render(<ErrorAlert error={errorMessage} onClose={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent(errorMessage);
  });

  it('should call onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(<ErrorAlert error="Test error" onClose={handleClose} />);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
}); 