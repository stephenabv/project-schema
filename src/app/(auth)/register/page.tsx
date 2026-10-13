import type { Metadata } from "next";
import Link from "next/link";
import { SignedInRedirect } from "@/components/auth/signed-in-redirect";
import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <>
      <SignedInRedirect />
      <AuthCard
        title="Create your account"
        footer={
          <>
            Already registered?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </>
        }
      >
        <RegisterForm />
      </AuthCard>
    </>
  );
}
