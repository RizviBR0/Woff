import { CreateSpaceButton } from "@/components/create-space-button";
import { JoinRoomSection } from "@/components/join-room-section";

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
        <div className="space-y-6">
          <CreateSpaceButton />
          
          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-border"></div>
            <span className="text-sm text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border"></div>
          </div>
          
          {/* Join Room Section */}
          <JoinRoomSection />
          
          <p className="text-sm text-muted-foreground">No signup required</p>
        </div>
      </div>
    </div>
  );
}
