/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Settings } from '@/components/Settings';

describe('Settings Component', () => {
  describe('Rendering', () => {
    it('should render settings sections', () => {
      render(<Settings />);

      expect(screen.getByRole('heading', { name: /LLM Providers/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Gmail Connection/i })).toBeInTheDocument();
    });

    it('should show provider selection', () => {
      render(<Settings />);

      expect(screen.getByText(/openai/i)).toBeInTheDocument();
      expect(screen.getByText(/anthropic/i)).toBeInTheDocument();
      expect(screen.getByText(/google/i)).toBeInTheDocument();
    });
  });

  describe('API Key Management', () => {
    it('should allow entering API key', () => {
      render(<Settings />);

      const inputs = screen.getAllByPlaceholderText(/api key/i);
      expect(inputs.length).toBeGreaterThan(0);
    });

    it('should call onSaveApiKey when save is clicked', () => {
      const onSave = vi.fn();
      render(<Settings onSaveApiKey={onSave} />);

      const input = screen.getAllByPlaceholderText(/api key/i)[0];
      fireEvent.change(input, { target: { value: 'sk-test-123' } });

      const saveButtons = screen.getAllByRole('button').filter(btn => /save/i.test(btn.textContent || ''));
      expect(saveButtons.length).toBeGreaterThan(0);

      fireEvent.click(saveButtons[0]);
      expect(onSave).toHaveBeenCalled();
    });
  });

  describe('Gmail Connection', () => {
    it('should show not connected status', () => {
      render(<Settings isAuthenticated={false} />);

      expect(screen.getByText(/not connected/i)).toBeInTheDocument();
    });

    it('should show connected status', () => {
      render(<Settings isAuthenticated email="user@gmail.com" />);

      expect(screen.getByText(/connected/i)).toBeInTheDocument();
      expect(screen.getByText(/user@gmail.com/i)).toBeInTheDocument();
    });

    it('should call onConnect when connect button clicked', () => {
      const onConnect = vi.fn();
      render(<Settings isAuthenticated={false} onConnect={onConnect} />);

      const connectButton = screen.getByRole('button', { name: /connect/i });
      fireEvent.click(connectButton);

      expect(onConnect).toHaveBeenCalled();
    });
  });
});
