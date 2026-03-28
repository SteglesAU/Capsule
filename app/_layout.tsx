import '../global.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoot } from '../src/screens/AppRoot';

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRoot />
    </QueryClientProvider>
  );
}
