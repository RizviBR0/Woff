"use client";

import { Button } from "@/components/ui/button";
import BentoGrid from "@/components/bento-grid";
import {
  Share,
  FileText,
  ArrowRight,
  Mail,
  Heart,
  Calendar,
  MousePointerClick,
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
      <BentoGrid />

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
