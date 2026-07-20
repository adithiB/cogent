/** cogent-ui-implementation-spec.md §1.5: /login and /signup render outside
 * the shell — no tabs, no org switcher. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-bg">{children}</div>;
}
