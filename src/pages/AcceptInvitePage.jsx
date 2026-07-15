import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { acceptInvite, acceptOwnerRecovery } from '@/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const isOwnerRecovery = location.pathname.includes('owner-recovery');
  const token = params.get('token') || '';
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!token) return setError('This invitation link is missing its token.');
    if (password !== confirmation) return setError('Passwords do not match.');
    setBusy(true);
    try {
      await (isOwnerRecovery ? acceptOwnerRecovery : acceptInvite)({ token, name, password });
      setComplete(true);
    } catch (err) {
      setError(err.message || err.error || 'The invitation is invalid or expired.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-5">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle><h1>{isOwnerRecovery ? 'Complete owner recovery' : 'Accept institute invitation'}</h1></CardTitle><CardDescription>Set your name and a strong password. Opening this emailed link proves control of the invited address.</CardDescription></CardHeader>
        <CardContent>
          {complete ? <div className="space-y-4"><Alert className="border-emerald-200 text-emerald-800"><AlertDescription>{isOwnerRecovery ? 'Your owner account is created and email verified. Institute access still follows its current status.' : 'Your account is active and your email is verified.'}</AlertDescription></Alert><Button asChild className="w-full"><Link to="/">Sign in</Link></Button></div> : <form onSubmit={submit} className="space-y-4">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" required />
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" required />
            <Input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Confirm password" required />
            <p className="text-xs text-muted-foreground">Use at least 8 characters with uppercase, lowercase, and a number.</p>
            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
            <Button type="submit" className="w-full" disabled={busy || !token}>{busy ? 'Activating…' : 'Accept invitation'}</Button>
          </form>}
        </CardContent>
      </Card>
    </main>
  );
}
