import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080d1c]">
      <Suspense fallback={<div className="text-white">Loading sign-up...</div>}>
        <SignUp />
      </Suspense>
    </div>
  );
}
