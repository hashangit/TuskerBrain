/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Onboarding } from '@/components/Onboarding';

describe('Onboarding Component', () => {
  describe('Step 1: Welcome', () => {
    it('should render welcome screen with connect button', () => {
      render(<Onboarding />);

      expect(screen.getByRole('heading', { name: /welcome/i })).toBeInTheDocument();
      expect(screen.getByText(/tuskerbrain/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /connect.*gmail/i })).toBeInTheDocument();
    });

    it('should call onConnectGmail when connect button clicked', () => {
      const onConnect = vi.fn();
      render(<Onboarding onConnectGmail={onConnect} />);

      fireEvent.click(screen.getByRole('button', { name: /connect.*gmail/i }));
      expect(onConnect).toHaveBeenCalled();
    });

    it('should show loading state while connecting', () => {
      render(<Onboarding isConnecting />);

      expect(screen.getByText(/connecting/i)).toBeInTheDocument();
    });
  });

  describe('Step 2: Preferences', () => {
    it('should show preferences after Gmail connected', () => {
      render(<Onboarding gmailConnected email="user@gmail.com" />);

      expect(screen.getByText(/setup preferences/i)).toBeInTheDocument();
    });

    it('should allow selecting lookback period', () => {
      render(<Onboarding gmailConnected email="user@gmail.com" />);

      expect(screen.getByLabelText(/lookback/i)).toBeInTheDocument();
    });

    it('should allow selecting sync interval', () => {
      render(<Onboarding gmailConnected email="user@gmail.com" />);

      expect(screen.getByLabelText(/sync interval/i)).toBeInTheDocument();
    });

    it('should call onSetPreferences when continuing', () => {
      const onSetPrefs = vi.fn();
      render(
        <Onboarding
          gmailConnected
          email="user@gmail.com"
          onSetPreferences={onSetPrefs}
        />
      );

      const continueButton = screen.getByRole('button', { name: /continue/i });
      fireEvent.click(continueButton);

      expect(onSetPrefs).toHaveBeenCalled();
    });
  });

  describe('Step 3: LLM Provider', () => {
    it('should show LLM provider selection after preferences set', () => {
      render(<Onboarding gmailConnected preferencesSet />);

      expect(screen.getByText(/choose.*llm.*provider/i)).toBeInTheDocument();
    });

    it('should show provider options', () => {
      render(<Onboarding gmailConnected preferencesSet />);

      expect(screen.getByText(/openai/i)).toBeInTheDocument();
      expect(screen.getByText(/anthropic/i)).toBeInTheDocument();
      expect(screen.getByText(/google/i)).toBeInTheDocument();
    });

    it('should allow entering API key', () => {
      render(<Onboarding gmailConnected preferencesSet />);

      expect(screen.getByPlaceholderText(/api key/i)).toBeInTheDocument();
    });

    it('should call onSaveApiKey when saving', () => {
      const onSave = vi.fn();
      render(
        <Onboarding
          gmailConnected
          preferencesSet
          onSaveApiKey={onSave}
        />
      );

      const input = screen.getByPlaceholderText(/api key/i);
      fireEvent.change(input, { target: { value: 'sk-test-123' } });

      const saveButton = screen.getByRole('button', { name: /save.*key/i });
      fireEvent.click(saveButton);

      expect(onSave).toHaveBeenCalledWith(expect.any(String), 'sk-test-123');
    });

    it('should show validation state', () => {
      render(<Onboarding gmailConnected preferencesSet isValidatingKey />);

      expect(screen.getByText(/validating/i)).toBeInTheDocument();
    });

    it('should show key valid state', () => {
      render(<Onboarding gmailConnected preferencesSet keyValid />);

      expect(screen.getByText(/api key is valid/i)).toBeInTheDocument();
    });

    it('should show key invalid state', () => {
      render(<Onboarding gmailConnected preferencesSet keyInvalid />);

      expect(screen.getByText(/invalid/i)).toBeInTheDocument();
    });
  });

  describe('Step 4: Complete', () => {
    it('should show completion screen when all setup done', () => {
      render(<Onboarding gmailConnected preferencesSet setupComplete />);

      expect(screen.getByText(/ready.*start/i)).toBeInTheDocument();
    });

    it('should call onStartProcessing when start button clicked', () => {
      const onStart = vi.fn();
      render(
        <Onboarding
          gmailConnected
          preferencesSet
          setupComplete
          onStartProcessing={onStart}
        />
      );

      const startButton = screen.getByRole('button', { name: /start.*processing/i });
      fireEvent.click(startButton);

      expect(onStart).toHaveBeenCalled();
    });
  });

  describe('Navigation', () => {
    it('should show back button on steps after welcome', () => {
      render(<Onboarding gmailConnected email="user@gmail.com" />);

      expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    });

    it('should go back to previous step when back clicked', () => {
      const onBack = vi.fn();
      render(
        <Onboarding
          gmailConnected
          email="user@gmail.com"
          onGoBack={onBack}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /back/i }));
      expect(onBack).toHaveBeenCalled();
    });
  });
});
