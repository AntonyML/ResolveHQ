import { DeploymentStatus } from "@/web/components/deployment-status";
import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth, type Session } from "@/web/auth";
import { api, errorMessage } from "@/web/lib/api";
import { safeNext } from "@/web/lib/next";
import { Button, Input } from "@/web/components/ui";
import { Turnstile, type TurnstileHandle } from "@/web/components/turnstile";

export function LoginPage() {
  const { session, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const destination = safeNext(params.get("next"));
  if (session) return <Navigate to={destination} replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      await api<Session>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          turnstileToken: form.get("turnstileToken") || undefined,
        }),
      });
      await refresh();
      navigate(destination);
    } catch (reason) {
      setError(errorMessage(reason, "Error al iniciar sesión."));
      turnstileRef.current?.reset();
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <AuthSurface>
      <div className="auth-heading">
        <h1>Iniciar sesión en AegisResolveDesk</h1>
        <p>Accedé al panel operativo y de soporte de tu equipo.</p>
      </div>
      <form onSubmit={submit} className="auth-form">
        <label>
          Correo electrónico
          <Input name="email" type="email" autoComplete="email" required autoFocus />
        </label>
        <label>
          <span className="auth-password-label">
            <span>Contraseña</span>
            <Link to="/forgot-password">¿La olvidaste?</Link>
          </span>
          <Input name="password" type="password" autoComplete="current-password" required />
        </label>
        <Turnstile ref={turnstileRef} />
        {error && <p className="auth-error">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Iniciando sesión…" : "Iniciar sesión"}
        </Button>
      </form>
      <div className="auth-footer">
        <span>¿Primera vez en AegisResolveDesk?</span>
        <Link to="/signup">
          Crear espacio de trabajo <ArrowRight size={14} />
        </Link>
      </div>
    </AuthSurface>
  );
}

export function AuthSurface({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-surface">
      <header className="auth-header">
        <span className="auth-brand">
          <span className="auth-logo">A</span>
          <strong>AegisResolveDesk</strong>
        </span>
        <DeploymentStatus />
      </header>
      <main className="auth-card">{children}</main>
    </div>
  );
}
