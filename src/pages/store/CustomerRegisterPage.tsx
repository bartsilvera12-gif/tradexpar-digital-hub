import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { toast } from "@/hooks/use-toast";

export default function CustomerRegisterPage() {
  const navigate = useNavigate();
  const { register, loading } = useCustomerAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await register(form.name, form.email, form.password);
      toast({ title: "Cuenta creada", description: "Ya puedes comprar y guardar favoritos." });
      navigate("/account");
    } catch (err: any) {
      setError(err.message || "No se pudo registrar");
    }
  };

  return (
    <div className="container mx-auto px-4 py-10 max-w-md">
      <h1 className="text-2xl font-bold text-foreground mb-6">Registro cliente</h1>
      <form onSubmit={handleSubmit} className="bg-card border rounded-2xl p-6 space-y-4">
        <input className="w-full px-4 py-2.5 rounded-xl border bg-background text-sm" type="text" placeholder="Nombre" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="w-full px-4 py-2.5 rounded-xl border bg-background text-sm" type="email" placeholder="Email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="w-full px-4 py-2.5 rounded-xl border bg-background text-sm" type="password" placeholder="Contraseña" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button disabled={loading} className="w-full py-3 gradient-celeste text-white rounded-xl font-semibold">
          {loading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Creando...</span> : "Crear cuenta"}
        </button>
      </form>
      <p className="text-sm text-muted-foreground mt-4">
        ¿Ya tienes cuenta? <Link to="/login" className="text-primary">Inicia sesión</Link>
      </p>
    </div>
  );
}
