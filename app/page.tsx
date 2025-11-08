import { CreateSpaceButton } from "@/components/create-space-button";

export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-8 max-w-lg mx-auto px-4">
        {/* Logo/Brand */}
        <div className="space-y-4">
          <h1 className="text-5xl font-bold tracking-tight">WoFF</h1>
          <p className="text-lg text-muted-foreground">
            Simple shareable spaces
          </p>
        </div>

        {/* CTA Section */}
        <div className="space-y-3">
          <CreateSpaceButton />
          <p className="text-sm text-muted-foreground">No signup required</p>
        </div>
      </div>
    </div>
  );
}
