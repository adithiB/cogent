import { SplitLayout } from "@/components/auth/split-layout";
import { AuthForm } from "@/components/auth/auth-form";

export default function LoginPage() {
  return (
    <SplitLayout>
      <AuthForm mode="login" />
    </SplitLayout>
  );
}
