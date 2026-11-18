import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/web/auth";
import { Button, Input } from "@/web/components/ui";
import { api, errorMessage } from "@/web/lib/api";
import { Turnstile, type TurnstileHandle } from "@/web/components/turnstile";
import { AuthSurface } from "./login";

export function SignupPage() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const turnstileRef = useRef<TurnstileHandle>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(
      [...form.entries()].filter(([, value]) => typeof value !== "string" || value.trim() !== ""),
    );
    try {
      await api("/auth/signup", { method: "POST", body: JSON.stringify(payload) });
      await refresh();
      navigate("/inbox");
    } catch (reason) {
      setError(errorMessage(reason, "Error al crear el espacio de trabajo."));
      turnstileRef.current?.reset();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSurface>
      <div className="auth-heading">
        <h1>Comenzá con una cola limpia.</h1>
        <p>Creá tu espacio de trabajo e invitá a tu equipo cuando estés listo.</p>
      </div>
      <form onSubmit={submit} className="auth-form">
        <label>
          Tu nombre completo
          <Input name="name" autoComplete="name" placeholder="Antony Monge Lopez" required />
        </label>
        <label>
          Correo de trabajo
          <Input name="email" type="email" autoComplete="email" placeholder="admin@cvmeld.com" required />
        </label>
        <label>
          Nombre de la organización / empresa
          <Input name="organizationName" placeholder="CVMeld" required />
        </label>
        <label>
          URL del espacio (slug)
          <Input name="organizationSlug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="cvmeld" required />
        </label>
        <label>
          Contraseña
          <Input name="password" type="password" minLength={12} autoComplete="new-password" required />
          <small className="auth-hint">Al menos 12 caracteres.</small>
        </label>
        <label>
          Correo de soporte (opcional)
          <Input name="supportEmail" type="email" placeholder="soporte@cvmeld.com" />
          <small className="auth-hint">
            La dirección donde escribirán tus clientes. Podés configurarla luego en Configuración.
          </small>
        </label>
        <Turnstile ref={turnstileRef} />
        {error && <p className="auth-error">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creando espacio…" : "Crear espacio de trabajo"}
        </Button>
      </form>
      <div className="auth-footer">
        <span>¿Ya tenés una cuenta?</span>
        <Link to="/login">
          Iniciar sesión <ArrowRight size={14} />
        </Link>
      </div>
    </AuthSurface>
  );
}
