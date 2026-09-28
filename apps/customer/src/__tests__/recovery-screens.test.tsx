import { ApiError } from '@quickbite/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactElement } from 'react';
import ForgotPasswordScreen from '../app/forgot-password';
import ResetPasswordScreen from '../app/reset-password';
import VerifyEmailScreen from '../app/verify-email';
import VerifyPhoneScreen from '../app/verify-phone';
import { useRecoveryStore } from '../lib/auth/recovery';
import { useSessionStore } from '../lib/auth/session';
import { AppProviders } from '../providers/app-providers';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  Redirect: () => null,
}));

const mockSession = { me: jest.fn(), login: jest.fn(), logout: jest.fn() };
const mockAuthApi = { verifyPhone: jest.fn(), resendPhoneVerification: jest.fn() };
const mockPublicAuthApi = {
  verifyEmail: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
};
// Lazy getters: jest.mock is hoisted above the mock declarations.
jest.mock('../lib/api', () => ({
  get session() {
    return mockSession;
  },
  get authApi() {
    return mockAuthApi;
  },
  get publicAuthApi() {
    return mockPublicAuthApi;
  },
}));

const pendingUser = {
  id: '5b1c1f0e-2f5d-4b7a-9c1e-2d3f4a5b6c7d',
  email: 'ali@example.com',
  phone: '+923001234567',
  roles: ['CUSTOMER'],
  status: 'PENDING_VERIFICATION',
};

const renderScreen = (ui: ReactElement) => render(<AppProviders>{ui}</AppProviders>);

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockSession.me.mockResolvedValue(pendingUser);
  useSessionStore.setState({ status: 'signedIn' });
  useRecoveryStore.setState({ identifier: null });
});

describe('Verify Phone', () => {
  it('shows the number from the backend and verifies the 6-digit code', async () => {
    mockAuthApi.verifyPhone.mockResolvedValue({ ...pendingUser, status: 'ACTIVE' });
    await renderScreen(<VerifyPhoneScreen />);
    expect(await screen.findByText('+923001234567')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('phone-code'), '12a3456');
    await fireEvent.press(screen.getByTestId('phone-verify'));
    await waitFor(() => {
      expect(mockAuthApi.verifyPhone).toHaveBeenCalledWith({ code: '123456' });
    });
    expect(mockRouter.replace).toHaveBeenCalledWith('/verify-email');
  });

  it('keeps Verify disabled until all 6 digits are entered', async () => {
    await renderScreen(<VerifyPhoneScreen />);
    await fireEvent.changeText(screen.getByTestId('phone-code'), '123');
    await fireEvent.press(screen.getByTestId('phone-verify'));
    expect(mockAuthApi.verifyPhone).not.toHaveBeenCalled();
  });

  it('explains an invalid code', async () => {
    mockAuthApi.verifyPhone.mockRejectedValue(
      new ApiError(400, { code: 'AUTH_VERIFICATION_CODE_INVALID', message: 'raw' }),
    );
    await renderScreen(<VerifyPhoneScreen />);
    await fireEvent.changeText(screen.getByTestId('phone-code'), '000000');
    await fireEvent.press(screen.getByTestId('phone-verify'));
    expect(await screen.findByText("That code isn't right. Check it and try again.")).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('requests a new code', async () => {
    mockAuthApi.resendPhoneVerification.mockResolvedValue(undefined);
    await renderScreen(<VerifyPhoneScreen />);
    await fireEvent.press(screen.getByTestId('phone-resend'));
    expect(await screen.findByText('A new code is on its way.')).toBeTruthy();
    expect(mockAuthApi.resendPhoneVerification).toHaveBeenCalledTimes(1);
  });
});

describe('Verify Email', () => {
  it('verifies automatically when opened from the email link', async () => {
    mockParams = { token: 'link-token' };
    mockPublicAuthApi.verifyEmail.mockResolvedValue(undefined);
    await renderScreen(<VerifyEmailScreen />);
    expect(await screen.findByText('Email confirmed')).toBeTruthy();
    expect(mockPublicAuthApi.verifyEmail).toHaveBeenCalledWith({ token: 'link-token' });
    expect(mockPublicAuthApi.verifyEmail).toHaveBeenCalledTimes(1);
  });

  it('verifies a pasted code', async () => {
    mockPublicAuthApi.verifyEmail.mockResolvedValue(undefined);
    await renderScreen(<VerifyEmailScreen />);
    await fireEvent.changeText(screen.getByTestId('email-code'), '  pasted-token ');
    await fireEvent.press(screen.getByTestId('email-verify'));
    await waitFor(() => {
      expect(mockPublicAuthApi.verifyEmail).toHaveBeenCalledWith({ token: 'pasted-token' });
    });
  });

  it('lets the customer continue without verifying (email does not gate ordering)', async () => {
    await renderScreen(<VerifyEmailScreen />);
    await fireEvent.press(screen.getByTestId('email-skip'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/signed-in');
    expect(mockPublicAuthApi.verifyEmail).not.toHaveBeenCalled();
  });
});

describe('Forgot Password', () => {
  it('rejects an invalid email before calling the API', async () => {
    await renderScreen(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByTestId('forgot-identifier'), 'not-an-email');
    await fireEvent.press(screen.getByTestId('forgot-submit'));
    expect(await screen.findByText('Enter a valid email address')).toBeTruthy();
    expect(mockPublicAuthApi.forgotPassword).not.toHaveBeenCalled();
  });

  it('sends the E.164 phone on the SMS tab and continues to Reset Password', async () => {
    mockPublicAuthApi.forgotPassword.mockResolvedValue(undefined);
    await renderScreen(<ForgotPasswordScreen />);
    await fireEvent.press(screen.getByTestId('forgot-tab-phone'));
    await fireEvent.changeText(screen.getByTestId('forgot-identifier'), '0300 1234567');
    await fireEvent.press(screen.getByTestId('forgot-submit'));
    await waitFor(() => {
      expect(mockPublicAuthApi.forgotPassword).toHaveBeenCalledWith({
        identifier: '+923001234567',
      });
    });
    expect(mockRouter.push).toHaveBeenCalledWith('/reset-password');
    // Kept in memory for the reset screen, never in the URL.
    expect(useRecoveryStore.getState().identifier).toBe('+923001234567');
  });
});

describe('Reset Password', () => {
  async function fill(password: string, confirm: string, code = 'reset-token') {
    await fireEvent.changeText(screen.getByTestId('reset-code'), code);
    await fireEvent.changeText(screen.getByTestId('reset-password'), password);
    await fireEvent.changeText(screen.getByTestId('reset-confirm'), confirm);
  }

  it('requires matching passwords', async () => {
    await renderScreen(<ResetPasswordScreen />);
    await fill('newpass123', 'different');
    await fireEvent.press(screen.getByTestId('reset-submit'));
    expect(await screen.findByText('Passwords do not match.')).toBeTruthy();
    expect(mockPublicAuthApi.resetPassword).not.toHaveBeenCalled();
  });

  it('resets, then signs in with the identifier from Forgot Password', async () => {
    useRecoveryStore.setState({ identifier: 'ali@example.com' });
    mockPublicAuthApi.resetPassword.mockResolvedValue(undefined);
    mockSession.login.mockResolvedValue({ ...pendingUser, status: 'ACTIVE' });
    await renderScreen(<ResetPasswordScreen />);
    await fill('newpass123', 'newpass123');
    await fireEvent.press(screen.getByTestId('reset-submit'));
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith('/signed-in');
    });
    expect(mockPublicAuthApi.resetPassword).toHaveBeenCalledWith({
      token: 'reset-token',
      newPassword: 'newpass123',
    });
    expect(mockSession.login).toHaveBeenCalledWith({
      identifier: 'ali@example.com',
      password: 'newpass123',
    });
    expect(useRecoveryStore.getState().identifier).toBeNull();
  });

  it('uses the link token and sends the customer to Login when the identifier is unknown', async () => {
    mockParams = { token: 'link-token' };
    mockPublicAuthApi.resetPassword.mockResolvedValue(undefined);
    await renderScreen(<ResetPasswordScreen />);
    expect(screen.queryByTestId('reset-code')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('reset-password'), 'newpass123');
    await fireEvent.changeText(screen.getByTestId('reset-confirm'), 'newpass123');
    await fireEvent.press(screen.getByTestId('reset-submit'));
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/login',
        params: { reset: 'done' },
      });
    });
    expect(mockPublicAuthApi.resetPassword).toHaveBeenCalledWith({
      token: 'link-token',
      newPassword: 'newpass123',
    });
    expect(mockSession.login).not.toHaveBeenCalled();
  });

  it('explains an invalid or expired reset code', async () => {
    mockPublicAuthApi.resetPassword.mockRejectedValue(
      new ApiError(400, { code: 'AUTH_PASSWORD_RESET_INVALID', message: 'raw' }),
    );
    await renderScreen(<ResetPasswordScreen />);
    await fill('newpass123', 'newpass123', 'stale-token');
    await fireEvent.press(screen.getByTestId('reset-submit'));
    expect(
      await screen.findByText('This reset code is invalid or has expired. Request a new one.'),
    ).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
