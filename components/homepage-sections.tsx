"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Zap,
  Shield,
  Share,
  Users,
  Lock,
  QrCode,
  FileText,
  Sparkles,
  ArrowRight,
  Github,
  Mail,
  Heart,
  Link,
} from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Create and share spaces instantly with no sign-up required",
  },
  {
    icon: Shield,
    title: "Privacy First",
    description: "Your content is secure with optional passcode protection",
  },
  {
    icon: Share,
    title: "Easy Sharing",
    description: "Share with simple URLs or QR codes for instant access",
  },
  {
    icon: Users,
    title: "Real-time Collaboration",
    description: "Work together seamlessly with live updates",
  },
];

const steps = [
  {
    icon: FileText,
    title: "Create a Space",
    description:
      "Click 'Create New Space' to start your collaborative document",
  },
  {
    icon: QrCode,
    title: "Share with Others",
    description: "Use the shareable link or QR code to invite collaborators",
  },
  {
    icon: Lock,
    title: "Protect if Needed",
    description: "Add a passcode to keep your content secure and private",
  },
];

export function HomepageSections() {
  return (
    <>
      {/* About Section */}
      <section id="about" className="py-20 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4" />
              About Woff
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-6">
              Simple Shareable Spaces
            </h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Woff makes it incredibly easy to create, share, and collaborate on
              documents. Whether you&apos;re brainstorming ideas, taking notes,
              or working on a project, our minimal interface gets out of your
              way so you can focus on what matters.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <Card
                  key={index}
                  className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border-border/50 bg-background/50 backdrop-blur-sm"
                >
                  <CardContent className="p-6 text-center">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <IconComponent className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-sm font-medium mb-6">
              <ArrowRight className="w-4 h-4" />
              How it Works
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-6">
              Get Started in Seconds
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Creating and sharing collaborative spaces has never been easier.
              Follow these simple steps to get started.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, index) => {
              const IconComponent = step.icon;
              return (
                <div key={index} className="relative">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                      <IconComponent className="w-8 h-8 text-primary" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">
                      {index + 1}
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-3">
                      {step.title}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                  {index < steps.length - 1 && (
                    <div className="hidden md:block absolute top-8 -right-4 w-8 h-0.5 bg-gradient-to-r from-primary/50 to-transparent" />
                  )}
                </div>
              );
            })}
          </div>

          <div className="text-center mt-12">
            <Button
              size="lg"
              className="rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
            >
              Try Woff Now
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-20 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-sm font-medium mb-6">
            <Mail className="w-4 h-4" />
            Get in Touch
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-6">
            We&apos;d Love to Hear From You
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Have questions, feedback, or just want to say hello? We&apos;re
            always happy to connect with our community.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              onClick={() =>
                window.open("https://github.com/rizvibr0", "_blank")
              }
              variant="outline"
              size="lg"
              className="rounded-full group"
            >
              <Github className="w-4 h-4 mr-2" />
              GitHub
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button size="lg" className="rounded-full group">
              <Mail className="w-4 h-4 mr-2" />
              Contact Us
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border/50 bg-background/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>Made with</span>
              <Heart className="w-4 h-4 text-red-500 fill-current" />
              <span>by the Woff team</span>
            </div>
            <div className="text-sm text-muted-foreground">
              © 2025 Woff. Simple shareable spaces.
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
