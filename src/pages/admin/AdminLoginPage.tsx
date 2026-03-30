import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
          <div className="w-12 h-12 rounded-xl gradient-celeste mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white">TRADEXPAR</h1>
          <p className="text-white/60 text-sm mt-1">Panel de Administración</p>
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
