export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/50">
      <div className="w-full max-w-md p-4 animate-fade-in">
        {children}
      </div>
    </div>
  );
}
