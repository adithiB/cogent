import { SplitLayout } from "@/components/auth/split-layout";
import { AuthForm } from "@/components/auth/auth-form";

export default function SignupPage() {
  return (
    <SplitLayout>
      <AuthForm mode="signup" />
    </SplitLayout>
  );
}
