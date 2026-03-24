import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

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
    // TODO: Este endpoint debe ser implementado en backend (POST /api/admin/login)
    // Mock login for UI demonstration
    setTimeout(() => {
      if (email && password) {
        sessionStorage.setItem("tradexpar_admin", "true");
        navigate("/admin/dashboard");
      } else {
        setError("Credenciales inválidas");
      }
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl gradient-celeste mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white">TRADEXPAR</h1>
          <p className="text-white/60 text-sm mt-1">Panel de Administración</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card rounded-2xl shadow-card p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Email</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="admin@tradexpar.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Contraseña</label>
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
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
          <p className="text-xs text-center text-muted-foreground">
            Este endpoint debe ser implementado en backend
          </p>
        </form>
      </div>
    </div>
  );
}
