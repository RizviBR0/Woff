<div align="center">

# 🟠 Woff Space

**Instant sharing for files, notes, images, and code — no sign-up required.**

[![Live](https://img.shields.io/badge/Live-woff.space-ff5a00?style=for-the-badge&logo=vercel&logoColor=white)](https://woff.space)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-Database-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)

</div>

<div align="center">
  <img src="public/screenshot_woff_light.jpeg" alt="Woff Space Homepage" width="800" />
</div>
<br/>
<div align="center">
  <img src="public/screenshot_woff_dark.jpeg" alt="Woff Space Homepage" width="800" />
</div>

---

## 📖 Overview

**Woff Space** is a minimal, zero-friction sharing platform. Create a temporary space in one click, drop in files, images, notes, or code, and share it instantly via a short room code or link. No accounts, no verification — just fast, secure sharing.

🔗 **Live**: [https://woff.space](https://woff.space)

---

## 🛠️ Tech Stack

| Layer               | Technology                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------- |
| **Framework**       | [Next.js 15](https://nextjs.org) (App Router)                                                 |
| **Language**        | [TypeScript 5](https://www.typescriptlang.org)                                                |
| **Styling**         | [Tailwind CSS 3](https://tailwindcss.com)                                                     |
| **UI Components**   | [Radix UI](https://www.radix-ui.com) + [ShadCN/UI](https://ui.shadcn.com)                     |
| **Database & Auth** | [Supabase](https://supabase.com) (PostgreSQL + Storage + RLS)                                 |
| **Animations**      | [Framer Motion](https://www.framer.com/motion/)                                               |
| **Icons**           | [Lucide React](https://lucide.dev) + [React Icons](https://react-icons.github.io/react-icons) |
| **Deployment**      | [Vercel](https://vercel.com)                                                                  |

---

## ✨ Features

- **Instant Spaces** — Create a shareable space in one click, no sign-up
- **4-Digit Room Code** — Join any space with a simple 4-digit code
- **Multi-Content Support** — Share text, images, files, PDFs, and code snippets
- **Rich Note Editor** — TipTap editor with Markdown shortcuts, versioned autosave, and offline drafts
- **Resumable Uploads** — Real byte progress, cancellation, retry, and atomic multi-file publishing
- **QR Code Sharing** — Generate and scan QR codes to share/join spaces
- **Invisible Anonymous Auth** — Secure ownership through Supabase Auth with no login UI
- **Owner Recovery** — A recovery key can restore room ownership after a session is lost
- **Dark/Light Theme** — System-aware theme with manual toggle
- **Online Notepad** — Dedicated notepad with shareable link
- **SEO Optimized** — Structured data, meta tags, sitemap, and blog
- **Responsive Design** — Works across desktop, tablet, and mobile
- **Privacy-aware Analytics** — Analytics are disabled on room and note routes

---

## 📦 Dependencies

### Core

| Package                 | Purpose                          |
| ----------------------- | -------------------------------- |
| `next`                  | React framework (App Router)     |
| `react` / `react-dom`   | UI library                       |
| `typescript`            | Type safety                      |
| `@supabase/supabase-js` | Database, auth, and file storage |

### UI & Styling

| Package                        | Purpose                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `tailwindcss`                  | Utility-first CSS                                                |
| `@radix-ui/*`                  | Accessible primitives (Dialog, Dropdown, Popover, Tooltip, etc.) |
| `class-variance-authority`     | Component variant management                                     |
| `clsx` + `tailwind-merge`      | Class name utilities                                             |
| `framer-motion`                | Animations and transitions                                       |
| `lucide-react` / `react-icons` | Icon libraries                                                   |
| `next-themes`                  | Theme management                                                 |
| `sonner`                       | Toast notifications                                              |

### Utilities

| Package                           | Purpose                    |
| --------------------------------- | -------------------------- |
| `nanoid`                          | Short unique ID generation |
| `qrcode` / `qr-scanner`           | QR generation and scanning |
| `date-fns`                        | Date formatting            |
| `html2canvas` / `jspdf` / `jszip` | Export/download utilities  |
| `@vercel/speed-insights`          | Performance monitoring     |

### Dev

| Package                         | Purpose            |
| ------------------------------- | ------------------ |
| `eslint` + `eslint-config-next` | Linting            |
| `playwright`                    | End-to-end testing |
| `postcss`                       | CSS processing     |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+
- **npm** (or yarn/pnpm)
- **Supabase** account ([supabase.com](https://supabase.com))

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/RizviBR0/Woff.git
cd Woff
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment variables**

Create a `.env.local` file in the root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_server_only_secret_or_legacy_service_role_key
CRON_SECRET=a_long_random_secret
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

4. **Set up the database**

Enable anonymous sign-ins, then apply every SQL file in
`supabase/migrations` in filename order. Together they install the tables,
restricted RPCs, private Storage policies, Row Level Security, advisor
hardening, optimized indexes, and the legacy-file compatibility migration.

5. **Start the dev server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

<div align="center">

Made with 🧡

</div>
