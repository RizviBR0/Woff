"use client";

import { useState, useEffect } from "react";
import { Copy, Download, QrCode, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface NoteViewerProps {
  publicCode: string;
}

interface PublicNote {
  id: string;
  title: string;
  content: string;
  visibility: "public" | "unlisted" | "private";
  fontFamily: "system" | "serif" | "mono";
  createdAt: string;
  updatedAt: string;
}

export function NoteViewer({ publicCode }: NoteViewerProps) {
  const [note, setNote] = useState<PublicNote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPrivate, setIsPrivate] = useState(false);
  const [showQRDialog, setShowQRDialog] = useState(false);

  // Mock note data - in real app, fetch from API
  useEffect(() => {
    const loadNote = async () => {
      setIsLoading(true);
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Simulate private note
      if (publicCode === "private") {
        setIsPrivate(true);
        setIsLoading(false);
        return;
      }

      const mockNote: PublicNote = {
        id: "note-123",
        title: "My Awesome Note",
        content: `
          <h1>Welcome to My Note</h1>
          <p>This is a sample note with rich content. You can see how headings, paragraphs, and other elements are rendered.</p>
          
          <h2>Features</h2>
          <ul>
            <li>Rich text formatting</li>
            <li>Public sharing</li>
            <li>Clean, minimal design</li>
          </ul>
          
          <h3>Code Example</h3>
          <pre><code>function hello() {
  console.log("Hello, world!");
}</code></pre>
          
          <blockquote>
            <p>This is a quote block to show how different content types are rendered.</p>
          </blockquote>
          
          <p>Thanks for reading! 🎉</p>
        `,
        visibility: "public",
        fontFamily: "system",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setNote(mockNote);
      setIsLoading(false);
    };

    loadNote();
  }, [publicCode]);

  // Copy functions
  const copyLink = () => {
    navigator.clipboard.writeText(`https://woff.space/v/${publicCode}`);
  };

  const copyMarkdown = () => {
    if (!note) return;
    // Convert HTML to Markdown (simplified)
    const markdown = note.content
      .replace(/<h1>(.*?)<\/h1>/g, "# $1")
      .replace(/<h2>(.*?)<\/h2>/g, "## $1")
      .replace(/<h3>(.*?)<\/h3>/g, "### $1")
      .replace(/<h4>(.*?)<\/h4>/g, "#### $1")
      .replace(/<p>(.*?)<\/p>/g, "$1\n")
      .replace(/<li>(.*?)<\/li>/g, "- $1")
      .replace(/<blockquote><p>(.*?)<\/p><\/blockquote>/g, "> $1")
      .replace(/<pre><code>(.*?)<\/code><\/pre>/g, "```\n$1\n```")
      .replace(/<[^>]*>/g, ""); // Remove remaining HTML tags

    navigator.clipboard.writeText(`# ${note.title}\n\n${markdown}`);
  };

  const exportPDF = () => {
    // Add print styles to exclude top bar
    const style = document.createElement("style");
    style.textContent = `
      @media print {
        .print\\:hidden { display: none !important; }
        body { background: white !important; }
        .printable-note { 
          margin: 0 !important; 
          padding: 2rem !important;
          max-width: none !important;
        }
      }
    `;
    document.head.appendChild(style);

    window.print();

    // Cleanup
    setTimeout(() => {
      document.head.removeChild(style);
    }, 1000);
  };

  // Generate QR code URL (using a simple QR service)
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
    `https://woff.space/v/${publicCode}`
  )}`;

  // Font family options
  const fontFamilies = {
    system: "font-sans",
    serif: "font-serif",
    mono: "font-mono",
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (isPrivate) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-semibold mb-2">This note is private</h1>
          <p className="text-muted-foreground mb-6">
            This note is not publicly accessible. Only the owner can view it.
          </p>
          <Button onClick={() => (window.location.href = "/")}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2">Note not found</h1>
          <p className="text-muted-foreground mb-4">
            This note doesn&apos;t exist or is no longer available.
          </p>
          <Button onClick={() => (window.location.href = "/")}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar - hidden from print */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b print:hidden">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">{note.title}</h1>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copyLink}
              className="gap-2"
            >
              <Copy className="h-3 w-3" />
              Copy Link
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={copyMarkdown}
              className="gap-2"
            >
              <FileText className="h-3 w-3" />
              Copy Markdown
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={exportPDF}
              className="gap-2"
            >
              <Download className="h-3 w-3" />
              Export PDF
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowQRDialog(true)}
              className="gap-2"
            >
              <QrCode className="h-3 w-3" />
              QR
            </Button>
          </div>
        </div>
      </div>

      {/* Content - printable */}
      <article className="max-w-4xl mx-auto px-4 py-8 printable-note">
        <div
          className={cn(
            "prose prose-lg max-w-none",
            fontFamilies[note.fontFamily],
            "prose-headings:scroll-mt-16 prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-h4:text-lg",
            "prose-p:leading-relaxed prose-li:my-1",
            "prose-headings:group prose-headings:relative",
            "dark:prose-invert"
          )}
          style={{
            wordBreak: "break-word",
            overflowWrap: "break-word",
          }}
          dangerouslySetInnerHTML={{ __html: note.content }}
        />
      </article>

      {/* QR Dialog */}
      <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>QR Code</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center space-y-4">
            <img
              src={qrCodeUrl}
              alt="QR Code"
              className="w-48 h-48 border rounded-lg"
            />
            <p className="text-sm text-muted-foreground text-center">
              Scan this QR code to open the note on your mobile device
            </p>
            <Button onClick={copyLink} variant="outline" className="w-full">
              Copy Link
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
