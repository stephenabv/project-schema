import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignedInRedirect } from "@/components/auth/signed-in-redirect";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <SignedInRedirect />
      <AuthCard
        title="Sign in"
        footer={
          <>
            New here?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </>
        }
      >
        <Suspense fallback={<Skeleton className="h-64" />}>
          <LoginForm />
        </Suspense>
      </AuthCard>
    </>
  );
}
