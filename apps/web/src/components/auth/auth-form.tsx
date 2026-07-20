"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, login, signup } from "@/lib/api-client";

interface FieldErrors {
  email?: string;
  password?: string;
  orgName?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * cogent-ui-implementation-spec.md §2.1. One component drives both `/login`
 * and `/signup` — the org-name field, its helper text, and the submit copy
 * are the only things that differ by mode.
 */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const isSignup = mode === "signup";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  // Increments on every failed submit, even if the message text repeats (e.g.
  // the same wrong password twice) — a `useEffect` keyed on `formError` alone
  // would not re-fire for an identical consecutive message.
  const [errorNonce, setErrorNonce] = useState(0);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const orgNameRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!email.trim()) errors.email = "Email is required.";
    else if (!EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address.";

    if (!password) errors.password = "Password is required.";
    else if (isSignup && password.length < 12) {
      errors.password = "Password must be at least 12 characters.";
    }

    if (isSignup && !orgName.trim()) errors.orgName = "Organization name is required.";

    return errors;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const errors = validate();
    setFieldErrors(errors);
    if (errors.email) {
      emailRef.current?.focus();
      return;
    }
    if (errors.password) {
      passwordRef.current?.focus();
      return;
    }
    if (errors.orgName) {
      orgNameRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      if (isSignup) {
        await signup({ email, password, orgName });
      } else {
        await login({ email, password });
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
      );
      setErrorNonce((n) => n + 1);
    } finally {
      setSubmitting(false);
    }
  }

  // Runs after the banner has actually committed to the DOM — a fire-and-
  // forget `requestAnimationFrame` call from inside the submit handler raced
  // the disabled-button-loses-focus-to-body browser behavior and sometimes
  // lost the race.
  useEffect(() => {
    if (errorNonce > 0) bannerRef.current?.focus();
  }, [errorNonce]);

  return (
    <div className="mx-auto w-full max-w-[340px]">
      <h1 className="text-page-title font-medium text-text">
        {isSignup ? "Create your organization" : "Log in"}
      </h1>
      <p className="mt-1 text-body text-text-muted">
        {isSignup
          ? "Set up your account and your organization's statement."
          : "Welcome back to your statement."}
      </p>

      {formError && (
        <div
          ref={bannerRef}
          role="alert"
          tabIndex={-1}
          className="mt-4 flex items-start gap-2 rounded-md bg-danger-tint px-3 py-2 text-body text-danger-ink outline-none"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{formError}</span>
        </div>
      )}

      <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
        {isSignup && (
          <div>
            <label htmlFor="orgName" className="text-secondary font-medium text-text">
              Organization name
            </label>
            <Input
              id="orgName"
              ref={orgNameRef}
              value={orgName}
              onChange={(e) => {
                setOrgName(e.target.value);
                if (fieldErrors.orgName) setFieldErrors((f) => ({ ...f, orgName: undefined }));
              }}
              className="mt-1"
              aria-describedby="orgName-helper orgName-error"
              aria-invalid={!!fieldErrors.orgName}
              autoComplete="organization"
            />
            <p id="orgName-helper" className="mt-1 text-meta text-text-faint">
              This creates your organization — your data is scoped to it.
            </p>
            {fieldErrors.orgName && (
              <p
                id="orgName-error"
                className="mt-1 flex items-center gap-1 text-meta text-danger-ink"
              >
                <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
                {fieldErrors.orgName}
              </p>
            )}
          </div>
        )}

        <div>
          <label htmlFor="email" className="text-secondary font-medium text-text">
            Email
          </label>
          <Input
            id="email"
            type="email"
            ref={emailRef}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
            }}
            className="mt-1"
            aria-describedby="email-error"
            aria-invalid={!!fieldErrors.email}
            autoComplete="email"
          />
          {fieldErrors.email && (
            <p id="email-error" className="mt-1 flex items-center gap-1 text-meta text-danger-ink">
              <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="text-secondary font-medium text-text">
            Password
          </label>
          <div className="relative mt-1">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              ref={passwordRef}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
              }}
              className="pr-9"
              aria-describedby="password-error"
              aria-invalid={!!fieldErrors.password}
              autoComplete={isSignup ? "new-password" : "current-password"}
            />
            <button
              type="button"
              aria-pressed={showPassword}
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-text-faint hover:text-text"
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {fieldErrors.password && (
            <p
              id="password-error"
              className="mt-1 flex items-center gap-1 text-meta text-danger-ink"
            >
              <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
              {fieldErrors.password}
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          )}
          {isSignup ? "Create organization" : "Log in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-body text-text-muted">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-accent hover:underline">
              Log in
            </Link>
          </>
        ) : (
          <>
            Need an organization?{" "}
            <Link href="/signup" className="text-accent hover:underline">
              Create one
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
