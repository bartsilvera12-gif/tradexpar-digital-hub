import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logoIcon from "@/assets/logo-x-flat.png";
import {
  ADMIN_FORM_CONTROL,
  ADMIN_FORM_FIELD,
  ADMIN_FORM_LABEL,
  ADMIN_PANEL,
} from "@/lib/adminModuleLayout";
import { tradexpar } from "@/services/tradexpar";
import { cn } from "@/lib/utils";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await tradexpar.adminLogin({ email, password });
      if (res.token) {
        sessionStorage.setItem("tradexpar_admin_token", res.token);
        sessionStorage.setItem("tradexpar_admin", "true");
        navigate("/admin/dashboard");
        return;
      }
      setError("Credenciales inválidas");
    } catch (err: any) {
      setError(err.message || "Credenciales inválidas");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-3 px-3 py-2 rounded-xl bg-white/5 ring-1 ring-white/10">
            <img src={logoIcon} alt="Tradexpar" className="w-8 h-8 shrink-0" width={32} height={32} />
            <h1 className="text-[30px] leading-none font-extrabold tracking-tight text-white">
              TRADE<span className="text-cyan-400">XPAR</span>
            </h1>
          </div>
          <p className="text-white/65 text-sm">Panel de Administración</p>
        </div>

        <form onSubmit={handleSubmit} className={cn(ADMIN_PANEL, "p-8 space-y-5")}>
          <div className={ADMIN_FORM_FIELD}>
            <Label htmlFor="admin-email" className={ADMIN_FORM_LABEL}>
              Email
            </Label>
            <Input
              id="admin-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={ADMIN_FORM_CONTROL}
              placeholder="admin@tradexpar.com"
            />
          </div>
          <div className={ADMIN_FORM_FIELD}>
            <Label htmlFor="admin-password" className={ADMIN_FORM_LABEL}>
              Contraseña
            </Label>
            <Input
              id="admin-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={ADMIN_FORM_CONTROL}
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 gradient-celeste text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Iniciar sesión
          </button>
          <p className="text-xs text-center text-muted-foreground">Acceso solo para panel administrador.</p>
        </form>
      </div>
    </div>
  );
}
