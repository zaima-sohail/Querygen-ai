import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080d1c]">
      <Suspense fallback={<div className="text-white">Loading sign-in...</div>}>
        <SignIn />
      </Suspense>
    </div>
  );
}
