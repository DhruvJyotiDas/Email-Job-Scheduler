import { Navigate, Route, Routes } from 'react-router-dom';
import { useMe } from './lib/auth';
import Login from './pages/Login';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Compose from './pages/Compose';
import EmailDetail from './pages/EmailDetail';
import Senders from './pages/Senders';
import Analytics from './pages/Analytics';

export default function App() {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <div className="grid h-full place-items-center text-xs text-ink-muted">Loading…</div>;
  if (!me) return <Routes><Route path="*" element={<Login />} /></Routes>;
  return (
    <Routes>
      <Route element={<Layout me={me} />}>
        <Route path="/" element={<Navigate to="/scheduled" replace />} />
        <Route path="/scheduled" element={<Dashboard tab="scheduled" />} />
        <Route path="/sent" element={<Dashboard tab="sent" />} />
        <Route path="/senders" element={<Senders />} />
        <Route path="/analytics" element={<Analytics />} />
      </Route>
      <Route path="/compose" element={<Compose />} />
      <Route path="/email/:id" element={<EmailDetail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
