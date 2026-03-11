"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Shield,
  Share,
  FileText,
  Sparkles,
  ArrowRight,
  Mail,
  Heart,
  Calendar,
  Code2,
  Image as ImageIcon,
  MousePointerClick,
  Zap,
} from "lucide-react";

const steps = [
  {
    icon: MousePointerClick,
    title: "Create a Space",
    description: "One click to generate a unique, temporary workspace instantly.",
  },
  {
    icon: FileText,
    title: "Add Your Content",
    description: "Drop files, paste code snippets, or write down quick notes.",
  },
  {
    icon: Share,
    title: "Share the Link",
    description: "Send the URL or scan the QR code to let others join in real-time.",
  },
];

export function HomepageSections() {
  return (
    <>
      {/* Bento Grid Features Section */}
      <section id="features" className="py-20 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted text-foreground text-sm font-medium mb-6 border border-border">
              <Sparkles className="w-4 h-4" />
              Everything you need
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-6 tracking-tight">
              A workspace for every thought
            </h2>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Share notes, files, images, and code snippets in an instant. Woff is designed to be the quickest way to move data from A to B.
            </p>
          </div>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[minmax(180px,auto)]">
            
            {/* Wide/Tall Card - Notes */}
            <Card className="md:col-span-2 md:row-span-2 overflow-hidden border-border bg-background hover:border-primary/50 transition-colors duration-300 shadow-sm">
              <CardContent className="p-0 h-full flex flex-col">
                <div className="p-8 flex-1">
                  <div className="w-12 h-12 mb-6 rounded-xl bg-muted flex items-center justify-center border border-border">
                    <FileText className="w-6 h-6 text-foreground" />
                  </div>
                  <h3 className="text-2xl font-bold text-foreground mb-3 tracking-tight">Real-time Markdown Notes</h3>
                  <p className="text-muted-foreground leading-relaxed text-lg max-w-md">
                    Collaborate instantly with rich text support. Draft ideas, write documentation, or keep a shared scratchpad that everyone can edit at the same time.
                  </p>
                </div>
                <div className="mt-auto p-6 pt-0">
                  <div className="rounded-xl border border-border bg-muted/30 p-4 font-mono text-sm space-y-2">
                    <div className="flex items-center gap-2 text-muted-foreground"><span className="text-foreground">#</span> Project Goals</div>
                    <div className="flex items-center gap-2">- Refactor landing page</div>
                    <div className="flex items-center gap-2">- Add clean bento grid layout <span className="inline-block w-2 h-4 bg-foreground animate-pulse ml-1" /></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Small Card - Code */}
            <Card className="md:col-span-1 md:row-span-1 border-border bg-background hover:border-primary/50 transition-colors duration-300 shadow-sm">
              <CardContent className="p-8">
                <div className="w-10 h-10 mb-4 rounded-xl bg-muted flex items-center justify-center border border-border">
                  <Code2 className="w-5 h-5 text-foreground" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Code Snippets</h3>
                <p className="text-muted-foreground leading-relaxed text-sm">
                  Syntax highlighting for your favorite languages. Perfect for quick reviews.
                </p>
              </CardContent>
            </Card>

            {/* Small Card - Files & Images */}
            <Card className="md:col-span-1 md:row-span-1 border-border bg-background hover:border-primary/50 transition-colors duration-300 shadow-sm">
              <CardContent className="p-8">
                <div className="w-10 h-10 mb-4 rounded-xl bg-muted flex items-center justify-center border border-border">
                  <ImageIcon className="w-5 h-5 text-foreground" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Files & Images</h3>
                <p className="text-muted-foreground leading-relaxed text-sm">
                  Drag and drop to share assets instantly. No compression, no hassle.
                </p>
              </CardContent>
            </Card>

            {/* Small Card - Privacy */}
            <Card className="md:col-span-1 md:row-span-1 border-border bg-background hover:border-primary/50 transition-colors duration-300 shadow-sm">
              <CardContent className="p-8">
                <div className="w-10 h-10 mb-4 rounded-xl bg-muted flex items-center justify-center border border-border">
                  <Shield className="w-5 h-5 text-foreground" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Passcode Protected</h3>
                <p className="text-muted-foreground leading-relaxed text-sm">
                  Keep your shared spaces locked down. Only those with the code can enter.
                </p>
              </CardContent>
            </Card>

            {/* Wide Card - No Sign up */}
            <Card className="md:col-span-2 md:row-span-1 border-border bg-foreground text-background shadow-md">
              <CardContent className="p-8 flex flex-col sm:flex-row items-start sm:items-center gap-6 h-full text-left">
                <div className="w-16 h-16 shrink-0 rounded-2xl bg-background text-foreground flex items-center justify-center shadow-sm">
                  <Zap className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-2 tracking-tight">Zero Friction</h3>
                  <p className="text-muted/80 leading-relaxed text-base">
                    No sign-ups, no paywalls, no tracking. Create a space, share the link, and get straight to collaborating.
                  </p>
                </div>
              </CardContent>
            </Card>

          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className="py-20 relative">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-20">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-6 tracking-tight">
              Get Started in Seconds
            </h2>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
              Skip the long onboarding. Woff gets out of your way so you can focus on sharing.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 md:gap-8 relative">
            {/* Connecting Line */}
            <div className="hidden md:block absolute top-[40px] left-[15%] right-[15%] h-px bg-border" />

            {steps.map((step, index) => {
              const IconComponent = step.icon;
              return (
                <div key={index} className="relative group">
                  <div className="text-center flex flex-col items-center">
                    <div className="w-20 h-20 mb-6 relative">
                      <div className="relative w-full h-full rounded-2xl bg-background border border-border flex items-center justify-center shadow-sm z-10">
                        <IconComponent className="w-8 h-8 text-foreground" />
                        
                        {/* Step Number Badge */}
                        <div className="absolute -top-3 -right-3 w-8 h-8 bg-foreground text-background rounded-full flex items-center justify-center text-sm font-bold shadow-sm">
                          {index + 1}
                        </div>
                      </div>
                    </div>
                    
                    <h3 className="text-xl font-bold text-foreground mb-3 tracking-tight">
                      {step.title}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed max-w-xs mx-auto">
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-center mt-16">
            <Button
              size="lg"
              className="rounded-full px-8 h-12 text-base group"
            >
              Start Sharing Now
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-20 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-background text-foreground text-sm font-medium mb-6">
            <Mail className="w-4 h-4" />
            Get in Touch
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-6 tracking-tight">
            We&apos;d Love to Hear From You
          </h2>
          <p className="text-lg sm:text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
            Have questions, feedback, or just want to say hello? We&apos;re
            always happy to connect with our community.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              size="lg"
              className="rounded-full group px-8 h-12 text-base"
              onClick={() =>
                (window.location.href = "mailto:sabbirh9990@gmail.com")
              }
            >
              <Mail className="w-4 h-4 mr-2" />
              Contact Us
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="rounded-full group px-8 h-12 text-base bg-background"
              onClick={() =>
                (window.location.href = "https://calendly.com/rizvibr0/30min")
              }
            >
              <Calendar className="w-4 h-4 mr-2" />
              Schedule a Meeting
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2 text-muted-foreground font-medium">
               Made with
              <Heart className="w-5 h-5 text-red-500 fill-current" />
              by the Woff team
            </div>
            <div className="text-sm text-muted-foreground font-medium">
              © 2025 Woff. Simple shareable spaces.
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
