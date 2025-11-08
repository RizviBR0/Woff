## Woff Project - Simple Shareable Spaces

This is a Next.js application for creating minimal, shareable document spaces.

### Key Technologies

- Next.js 14+ with App Router
- TypeScript for type safety
- Tailwind CSS + ShadCN/UI for styling
- Supabase for backend and database
- Server Actions for API functionality

### Project Structure

- `app/` - Next.js app directory with routes and layouts
- `components/` - React components including UI library
- `lib/` - Utilities, actions, and configuration
- `database-schema.md` - Supabase database setup instructions

### Development Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run code linting

### Environment Setup

1. Copy `.env.local` and add Supabase credentials
2. Run database schema from `database-schema.md` in Supabase
3. Start development server with `npm run dev`

The application creates short, shareable URLs for document spaces with a clean, minimal interface.
