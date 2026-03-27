import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { api } from "@/services/api";
import { toast } from "@/hooks/use-toast";

export default function CustomerLoginPage() {
  const navigate = useNavigate();
  const { login, loading } = useCustomerAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(form.email, form.password);
      toast({ title: "Sesión iniciada", description: "Bienvenido de nuevo." });
      navigate("/account");
    } catch (err: any) {
      setError(err.message || "No se pudo iniciar sesión");
    }
  };

  const handleOAuth = async (provider: "google" | "facebook") => {
    try {
      const res = await api.customerOAuthStart(provider);
      window.location.href = res.url;
    } catch {
      toast({ title: "OAuth no disponible", description: "Configura credenciales para continuar." });
    }
  };

  return (
    <div className="container mx-auto px-4 py-10 max-w-md">
      <h1 className="text-2xl font-bold text-foreground mb-6">Iniciar sesión</h1>
      <form onSubmit={handleSubmit} className="bg-card border rounded-2xl p-6 space-y-4">
        <input className="w-full px-4 py-2.5 rounded-xl border bg-background text-sm" type="email" placeholder="Email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="w-full px-4 py-2.5 rounded-xl border bg-background text-sm" type="password" placeholder="Contraseña" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button disabled={loading} className="w-full py-3 gradient-celeste text-white rounded-xl font-semibold">
          {loading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Ingresando...</span> : "Ingresar"}
        </button>
      </form>

      <div className="grid grid-cols-2 gap-2 mt-4">
        <button onClick={() => void handleOAuth("google")} className="py-2.5 border rounded-xl text-sm">Google</button>
        <button onClick={() => void handleOAuth("facebook")} className="py-2.5 border rounded-xl text-sm">Facebook</button>
      </div>
      <p className="text-sm text-muted-foreground mt-4">
        ¿No tienes cuenta? <Link to="/register" className="text-primary">Regístrate</Link>
      </p>
    </div>
  );
}
