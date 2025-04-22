import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ResponseContainer from '../components/ResponseContainer';

describe('ResponseContainer', () => {
  it('should disable buttons when policy is being applied', () => {
    render(
      <ResponseContainer
        policy={{ content: '{}' }}
        onApplyPolicy={() => {}}
        onRegeneratePolicy={() => {}}
        isApplying={true}
        isRegenerating={false}
      />
    );

    const applyButton = screen.getByRole('button', { name: /apply policy/i });
    const regenerateButton = screen.getByRole('button', { name: /regenerate/i });

    expect(applyButton).toBeDisabled();
    expect(regenerateButton).toBeDisabled();
  });

  it('should enable buttons when policy application is complete', () => {
    render(
      <ResponseContainer
        policy={{ content: '{}' }}
        onApplyPolicy={() => {}}
        onRegeneratePolicy={() => {}}
        isApplying={false}
        isRegenerating={false}
      />
    );

    const applyButton = screen.getByRole('button', { name: /apply policy/i });
    const regenerateButton = screen.getByRole('button', { name: /regenerate/i });

    expect(applyButton).not.toBeDisabled();
    expect(regenerateButton).not.toBeDisabled();
  });

  it('should call onApplyPolicy when apply button is clicked', () => {
    const handleApply = vi.fn();
    render(
      <ResponseContainer
        policy={{ content: '{}' }}
        onApplyPolicy={handleApply}
        onRegeneratePolicy={() => {}}
        isApplying={false}
        isRegenerating={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /apply policy/i }));
    expect(handleApply).toHaveBeenCalledTimes(1);
  });

  it('should call onRegeneratePolicy when regenerate button is clicked', () => {
    const handleRegenerate = vi.fn();
    render(
      <ResponseContainer
        policy={{ content: '{}' }}
        onApplyPolicy={() => {}}
        onRegeneratePolicy={handleRegenerate}
        isApplying={false}
        isRegenerating={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));
    expect(handleRegenerate).toHaveBeenCalledTimes(1);
  });
}); 