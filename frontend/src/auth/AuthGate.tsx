import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ShieldCheckmarkRegular, ArrowRightRegular, DocumentMultipleRegular, PeopleTeamRegular } from "@fluentui/react-icons";
import "./auth.css";
import { Button, MessageBar, MessageBarBody } from "@fluentui/react-components";
import { getAccessToken, initializeAuth, msal, signIn, signOut } from "./authClient";

export interface SignedInUser {
  objectId: string;
  name: string;
  username: string;
  roles: string[];
}
const AuthContext = createContext<SignedInUser | null>(null);
export function useAuth(): SignedInUser {
  const user = useContext(AuthContext);
  if (!user) throw new Error("useAuth requires AuthGate.");
  return user;
}
const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");

export default function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    async function load() {
      setBusy(true);
      setError("");
      try {
        await initializeAuth();
        if (!msal.getActiveAccount()) return;
        const token = await getAccessToken();
        const response = await fetch(`${baseUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message ?? "Sign-in verification failed.");
        if (active) setUser(body as SignedInUser);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not verify sign-in.");
      } finally {
        window.clearTimeout(timeout);
        if (active) setBusy(false);
      }
    }
    void load();
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [attempt]);
  useEffect(() => {
    const reauth = () => { setUser(null); setError("Your session needs attention. Sign in again."); };
    window.addEventListener("guardrails:reauth", reauth);
    return () => window.removeEventListener("guardrails:reauth", reauth);
  }, []);
  async function login() {
    setBusy(true);
    try { await signIn(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Sign-in failed."); setBusy(false); }
  }
  if (user) return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
  return (
    <main className="eg-login">
      <header className="eg-login-header">
        <img src="/DuPont_Logo.png" alt="DuPont" className="eg-login-logo" />
        <span className="eg-login-wordmark">Enterprise Guardrails</span>
      </header>
      <div className="eg-login-layout">
        <section className="eg-login-intro" aria-labelledby="login-title">
          <span className="eg-login-eyebrow">CONNECTED ENTERPRISE REVIEWS</span>
          <h1 id="login-title">Clarity at every<br />review stage.</h1>
          <p className="eg-login-lead">Bring architecture, security, and Responsible AI reviews together—with the decisions and evidence that support them.</p>
          <div className="eg-login-features">
            <div><ShieldCheckmarkRegular aria-hidden="true" /><span>Architecture, Security &amp; Responsible AI</span></div>
            <div><DocumentMultipleRegular aria-hidden="true" /><span>Project evidence in one place</span></div>
            <div><PeopleTeamRegular aria-hidden="true" /><span>Shared visibility for every stakeholder</span></div>
          </div>
        </section>
        <section className="eg-login-card" aria-labelledby="signin-title">
          <div className="eg-login-symbol"><ShieldCheckmarkRegular aria-hidden="true" /></div>
          <h2 id="signin-title">Welcome back</h2>
          <p>Sign in to your review workspace with your assigned Microsoft account.</p>
          {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
          <Button className="eg-login-submit" appearance="primary" size="large" disabled={busy} onClick={() => void login()} icon={<ArrowRightRegular />} iconPosition="after">
            {busy ? "Checking sign-in…" : "Sign in with Microsoft"}
          </Button>
          <div className="eg-login-recovery">
            {error && <Button disabled={busy} onClick={() => setAttempt((n) => n + 1)}>Retry verification</Button>}
            {error && msal.getActiveAccount() && <Button onClick={() => void signOut()}>Use another account</Button>}
          </div>
          <div className="eg-login-access"><strong>Access by assignment</strong><span>Need access? Contact your application administrator.</span></div>
        </section>
      </div>
      <footer className="eg-login-footer">Enterprise Guardrails · Architecture. Assurance. Accountability.</footer>
    </main>
  );
}
