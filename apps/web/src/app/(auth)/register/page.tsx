import Link from "next/link";
import { RegisterForm } from "@/components/auth/register-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";

export const metadata = {
  title: "Sign Up - Ducsigr",
  description: "Create your Ducsigr account",
};

export default function RegisterPage() {
  return (
    <>
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Ducsigr
        </h1>
        <h2 className="mt-2 text-xl text-gray-600">Create your account</h2>
      </div>

      <div className="mt-8 space-y-6">
        <OAuthButtons />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-gray-50 px-2 text-gray-500">
              Or register with email
            </span>
          </div>
        </div>

        <RegisterForm />

        <p className="text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-indigo-600 hover:text-indigo-500"
          >
            Sign in
          </Link>
        </p>
      </div>
    </>
  );
}
