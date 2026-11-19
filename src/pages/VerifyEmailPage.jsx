import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { verifyEmail } from '@/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [status, setStatus] = useState(token ? 'verifying' : 'error');
  const [message, setMessage] = useState(token ? 'Verifying your email...' : 'This verification link is missing its token.');

  useEffect(() => {
    let active = true;

    if (!token) {
      return () => {
        active = false;
      };
    }

    verifyEmail(token)
      .then((result) => {
        if (!active) return;
        setStatus('complete');
        setMessage(result.message || 'Email verified successfully.');
      })
      .catch((error) => {
        if (!active) return;
        setStatus('error');
        setMessage(error.message || error.error || 'This verification link is invalid or expired.');
      });

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-5">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle><h1>Verify your email</h1></CardTitle>
          <CardDescription>Email verification protects institute activation and owner access.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant={status === 'error' ? 'destructive' : undefined} className={status === 'complete' ? 'border-emerald-200 text-emerald-800' : undefined}>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
          {status === 'complete' ? <Button asChild className="w-full"><Link to="/">Continue to sign in</Link></Button> : null}
          {status === 'error' ? <Button asChild variant="outline" className="w-full"><Link to="/">Return to sign in</Link></Button> : null}
        </CardContent>
      </Card>
    </main>
  );
}
