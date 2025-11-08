# Woff - Simple Shareable Spaces

Woff is a minimal document sharing application where users can create spaces for text, images, PDFs, and other files. Each space gets a unique short URL for easy sharing.

## Features

- **Instant Spaces**: Visit woff.space to automatically create a new space
- **Short URLs**: Each space gets a unique short URL like `woff.space/r/7aB9K`
- **Multiple Content Types**: Share text, images, PDFs, and files
- **Minimal Design**: Clean, distraction-free interface using ShadCN/UI
- **Real-time Updates**: See new entries appear instantly (planned)
- **Device-based Authentication**: No signup required, spaces are tied to your device

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd woff
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:
   Copy `.env.local` and add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

4. Set up the database:

- Run the SQL commands from `database-schema.md` in your Supabase SQL editor
- This will create all necessary tables and Row Level Security policies

5. Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

## Architecture

### Frontend

- **Next.js 14+** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **ShadCN/UI** for component library
- **Lucide React** for icons

### Backend

- **Supabase** for database and authentication
- **Server Actions** for API endpoints
- **Row Level Security** for data protection

### Database Schema

The application uses these main tables:

- `spaces` - Individual shareable spaces
- `entries` - Content items within spaces (text, images, files)
- `assets` - File metadata and storage references
- `views` - Analytics data
- `device_sessions` - Device-based authentication

## Routes

- `GET /` - Creates new space and redirects to `/r/:slug`
- `GET /r/:slug` - View and interact with a space
- `GET /v/:slug` - Read-only view for public sharing (planned)

## Usage

1. **Creating a Space**: Visit the root URL to automatically create a new space
2. **Adding Content**: Use the composer to add text, or click the plus icon for files
3. **Sharing**: Use the Share button to copy the space URL
4. **Settings**: Use Options to control visibility and posting permissions

## Development

### Project Structure

```
app/
├── globals.css          # Global styles
├── layout.tsx          # Root layout
├── page.tsx            # Homepage (redirects to new space)
└── r/[slug]/page.tsx   # Space view page

components/
├── ui/                 # ShadCN/UI components
├── space-container.tsx # Main space interface
├── composer.tsx        # Text/file input component
└── entry-card.tsx      # Individual content display

lib/
├── actions.ts          # Server actions
├── supabase.ts         # Supabase client
├── slug.ts             # URL generation utilities
└── utils.ts            # General utilities
```

### Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Deployment

The application is designed to be deployed on Vercel with minimal configuration:

1. Connect your repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Roadmap

- [ ] File upload functionality
- [ ] Real-time updates with Supabase Realtime
- [ ] PDF thumbnail generation
- [ ] Image optimization
- [ ] Public sharing improvements
- [ ] User authentication (optional)
- [ ] Custom domains
- [ ] Analytics dashboard
