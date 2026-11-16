"use client";

import Link from "next/link";
import AuthFrame from "../components/AuthFrame";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { login } from "../lib/store";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = login(email, password);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(nextPath);
  }

  return (
    <AuthFrame title="Welcome back" subtitle="Log in to keep browsing your group deals.">

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <label className="block text-sm font-bold">
            Email
            <input
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 font-normal outline-none transition focus:border-brand-500"
              required
            />
          </label>

          <label className="block text-sm font-bold">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 font-normal outline-none transition focus:border-brand-500"
              required
            />
          </label>

          {error && <p className="text-sm font-semibold text-danger">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-xl bg-brand-500 py-3.5 font-bold text-white shadow-md shadow-brand-200 transition hover:bg-brand-600"
          >
            Log in
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-muted">
          New to GroupBuy?{" "}
          <Link href="/register" className="font-bold text-brand-500 hover:text-brand-600">
            Create an account
          </Link>
        </p>
    </AuthFrame>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-canvas">
          <p className="text-sm text-muted">Loading...</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
