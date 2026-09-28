import { ApiError } from '@quickbite/api-client';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactElement } from 'react';
import CreateAccountScreen, { toE164 } from '../app/create-account';
import SplashScreen, { MIN_SPLASH_MS } from '../app/index';
import LoginScreen, { EMPTY_FIELDS_MESSAGE } from '../app/login';
import WelcomeScreen from '../app/welcome';
import { AppProviders } from '../providers/app-providers';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  Redirect: () => null,
}));

const mockSession = {
  restore: jest.fn(),
  login: jest.fn(),
  register: jest.fn(),
};
// Lazy getter: jest.mock is hoisted above the mockSession declaration.
jest.mock('../lib/api', () => ({
  get session() {
    return mockSession;
  },
}));

const renderScreen = (ui: ReactElement) => render(<AppProviders>{ui}</AppProviders>);

beforeEach(() => jest.clearAllMocks());

describe('Splash', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('goes to Welcome when there is no stored session', async () => {
    mockSession.restore.mockResolvedValue('signedOut');
    await renderScreen(<SplashScreen />);
    expect(screen.getByText('Connecting')).toBeTruthy();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(MIN_SPLASH_MS);
    });
    expect(mockRouter.replace).toHaveBeenCalledWith('/welcome');
  });

  it('goes to the signed-in area when the session is restored', async () => {
    mockSession.restore.mockResolvedValue('signedIn');
    await renderScreen(<SplashScreen />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(MIN_SPLASH_MS);
    });
    expect(mockRouter.replace).toHaveBeenCalledWith('/signed-in');
  });

  it('shows a retry state when the backend is unreachable', async () => {
    mockSession.restore.mockRejectedValueOnce(new Error('offline')).mockResolvedValue('signedOut');
    await renderScreen(<SplashScreen />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(MIN_SPLASH_MS);
    });
    expect(screen.getByText('Offline')).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Try again'));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(MIN_SPLASH_MS);
    });
    expect(mockRouter.replace).toHaveBeenCalledWith('/welcome');
  });
});

describe('Welcome', () => {
  it('routes to Create Account and Login', async () => {
    await renderScreen(<WelcomeScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Get Started' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/create-account');
    await fireEvent.press(screen.getByRole('button', { name: 'I already have an account' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/login');
  });
});

describe('Login', () => {
  it('asks for both fields before calling the API', async () => {
    await renderScreen(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByText(EMPTY_FIELDS_MESSAGE)).toBeTruthy();
    expect(mockSession.login).not.toHaveBeenCalled();
  });

  it('signs in and leaves the auth flow', async () => {
    mockSession.login.mockResolvedValue({});
    await renderScreen(<LoginScreen />);
    await fireEvent.changeText(screen.getByTestId('login-identifier'), 'ali@example.com');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'secret123');
    await fireEvent.press(screen.getByTestId('login-submit'));
    await waitFor(() => {
      expect(mockSession.login).toHaveBeenCalled();
    });
    expect(mockSession.login).toHaveBeenCalledWith({
      identifier: 'ali@example.com',
      password: 'secret123',
    });
    expect(mockRouter.replace).toHaveBeenCalledWith('/signed-in');
  });

  it('shows a generic message for invalid credentials', async () => {
    mockSession.login.mockRejectedValue(
      new ApiError(401, { code: 'AUTH_INVALID_CREDENTIALS', message: 'raw', requestId: 'req_9' }),
    );
    await renderScreen(<LoginScreen />);
    await fireEvent.changeText(screen.getByTestId('login-identifier'), 'ali@example.com');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'wrong-password');
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByText('Incorrect email/phone number or password.')).toBeTruthy();
    expect(screen.getByText('Ref: req_9')).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe('Create Account', () => {
  async function fill(overrides: Partial<Record<string, string>> = {}) {
    const values = {
      'signup-first-name': 'Ali',
      'signup-last-name': 'Khan',
      'signup-email': 'ali@example.com',
      'signup-phone': '0300 1234567',
      'signup-password': 'secret123',
      'signup-confirm-password': 'secret123',
      ...overrides,
    };
    for (const [testId, value] of Object.entries(values)) {
      await fireEvent.changeText(screen.getByTestId(testId), value);
    }
  }

  it('builds an E.164 phone number from the local number', () => {
    expect(toE164('+92', '0300 123-4567')).toBe('+923001234567');
  });

  it('requires matching passwords and accepted terms', async () => {
    await renderScreen(<CreateAccountScreen />);
    await fill({ 'signup-confirm-password': 'different1' });
    await fireEvent.press(screen.getByTestId('signup-submit'));
    expect(await screen.findByText('Passwords do not match')).toBeTruthy();
    expect(screen.getByText('Please accept the Terms of Service and Privacy Policy')).toBeTruthy();
    expect(mockSession.register).not.toHaveBeenCalled();
  });

  it('registers with the API contract fields and leaves the auth flow', async () => {
    mockSession.register.mockResolvedValue({});
    await renderScreen(<CreateAccountScreen />);
    await fill();
    await fireEvent.press(screen.getByTestId('signup-terms'));
    await fireEvent.press(screen.getByTestId('signup-submit'));
    await waitFor(() => {
      expect(mockSession.register).toHaveBeenCalled();
    });
    expect(mockSession.register).toHaveBeenCalledWith({
      firstName: 'Ali',
      lastName: 'Khan',
      email: 'ali@example.com',
      phone: '+923001234567',
      password: 'secret123',
    });
    expect(mockRouter.replace).toHaveBeenCalledWith('/signed-in');
  });

  it('shows server field errors under the matching field', async () => {
    mockSession.register.mockRejectedValue(
      new ApiError(409, { code: 'AUTH_ACCOUNT_ALREADY_EXISTS', message: 'raw' }),
    );
    await renderScreen(<CreateAccountScreen />);
    await fill();
    await fireEvent.press(screen.getByTestId('signup-terms'));
    await fireEvent.press(screen.getByTestId('signup-submit'));
    expect(
      await screen.findByText('An account with this email or phone number already exists.'),
    ).toBeTruthy();
  });
});
