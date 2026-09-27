import { useQueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AppProviders } from './app-providers';

function QueryClientProbe() {
  const client = useQueryClient();
  return (
    <Text>{client.getDefaultOptions().mutations?.retry === false ? 'ready' : 'unexpected'}</Text>
  );
}

describe('AppProviders', () => {
  it('provides a query client that never auto-retries mutations', async () => {
    await render(
      <AppProviders>
        <QueryClientProbe />
      </AppProviders>,
    );
    expect(await screen.findByText('ready')).toBeTruthy();
  });
});
