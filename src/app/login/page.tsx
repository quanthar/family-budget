"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet, ShieldCheck, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/toast";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@family.ru");
  const [password, setPassword] = useState("demo123");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Simple email/password check for local development
    setTimeout(() => {
      setLoading(false);
      toast.success("Добро пожаловать в Семейный Бюджет!");
      router.push("/");
    }, 600);
  };

  return (
    <div className="min-h-screen bg-bg-app flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-sm space-y-6 animate-fade-in-up">
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-accent/20 text-accent rounded-[var(--radius-xl)] flex items-center justify-center mx-auto border border-accent/30 shadow-lg">
            <Wallet size={24} />
          </div>
          <h1 className="text-2xl font-bold text-fg-primary">
            Семейный Бюджет
          </h1>
          <p className="text-xs text-fg-muted">
            Удобный финансовый контроль для двоих
          </p>
        </div>

        {/* Login form */}
        <Card className="p-6 space-y-4 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
                Электронная почта
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)] outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="text-xs text-fg-tertiary uppercase tracking-wider block mb-1.5">
                Пароль
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-10 px-3 text-sm bg-bg-surface text-fg-primary border border-border-default rounded-[var(--radius-lg)] outline-none focus:border-accent"
              />
            </div>

            <Button
              type="submit"
              fullWidth
              size="lg"
              disabled={loading}
              className="mt-2"
            >
              {loading ? (
                <Loader2 className="animate-spin mr-2" size={16} />
              ) : (
                <ArrowRight className="mr-2" size={16} />
              )}
              Войти в семью
            </Button>
          </form>

          <div className="pt-2 text-center text-xs text-fg-muted border-t border-border-default/40">
            Локальный режим: демо-аккаунт подготовлен автоматически
          </div>
        </Card>
      </div>
    </div>
  );
}
