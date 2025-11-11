# MODUS OPERANDI
- Your task is to help me build my appointment booking and WhatsApp management application conceive-do
- Avoid feature creep at all cost. Avoid over-engineering and overthinking.
- Always prioritize writing clean, simple, and modular code.
- do what the user asks for, exactly are precisely. nothing more, nothing less.
- Execute exactly what is requested, nothing more.
- Check that you've implemented every requirement fully & completely.
- Prioritize simplicity and minimalism in your solutions.
- Use simple & easy-to-understand language. Write in short sentences.
- keep our codebase simple: resist creating new files unless it really makes sense.


# TECH STACK
- Frontend: React 18 with TypeScript
- Build tool: Vite
- UI Components: shadcn-ui with Radix UI primitives
- Styling: Tailwind CSS
- State Management: TanStack React Query (@tanstack/react-query)
- Routing: React Router DOM
- Forms: React Hook Form with Zod validation
- Backend: Supabase (PostgreSQL database, Edge Functions, Authentication)
- WhatsApp Integration: Evolution API
- Date handling: date-fns
- Charts: recharts
- Icons: lucide-react
- Deployment: Vercel


----

# CURRENT FILE STRUCTURE
.
├── src/
│   ├── components/          # React components
│   │   ├── ui/             # shadcn-ui components
│   │   ├── availability/   # Availability management components
│   │   ├── messages/       # Message-related components
│   │   ├── AppSidebar.tsx
│   │   ├── ConnectionStatus.tsx
│   │   ├── DeleteAccountDialog.tsx
│   │   ├── Navbar.tsx
│   │   └── QRCodeDisplay.tsx
│   ├── pages/              # Application pages
│   │   ├── Appointments.tsx
│   │   ├── Auth.tsx
│   │   ├── Dashboard.tsx
│   │   ├── ForgotPassword.tsx
│   │   ├── Index.tsx
│   │   ├── Informations.tsx
│   │   ├── Messages.tsx
│   │   ├── NotFound.tsx
│   │   └── ResetPassword.tsx
│   ├── hooks/              # Custom React hooks
│   │   ├── useAppointments.ts
│   │   ├── useAvailabilities.ts
│   │   ├── useConversations.ts
│   │   ├── useEvolutionInstance.ts
│   │   ├── useMessages.ts
│   │   ├── useUserInformations.ts
│   │   ├── use-mobile.tsx
│   │   └── use-toast.ts
│   ├── integrations/       # Third-party integrations
│   │   └── supabase/      # Supabase client and queries
│   ├── lib/               # Utility functions
│   │   └── utils.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── supabase/
│   ├── functions/         # Supabase Edge Functions
│   │   ├── ai-auto-reply/
│   │   ├── check-instance-status/
│   │   ├── check-late-clients/
│   │   ├── create-evolution-instance/
│   │   ├── delete-account/
│   │   ├── diagnose-webhook/
│   │   ├── evolution-webhook-handler/
│   │   ├── merge-conversations/
│   │   ├── process-evolution-queue/
│   │   ├── refresh-qr-codes/
│   │   ├── reset-current-instance/
│   │   ├── sanitize-jids/
│   │   ├── send-access-info/
│   │   ├── send-provider-notification/
│   │   ├── send-whatsapp-message/
│   │   ├── set-webhook/
│   │   └── test-webhook/
│   ├── migrations/        # Database migrations
│   └── sql/              # SQL scripts
├── public/               # Static assets
├── scripts/              # Utility scripts
└── Configuration files (package.json, tsconfig.json, vite.config.ts, etc.)

----

# IMPORTANT
- Always prioritize writing clean, simple, and modular code.
- Use simple & easy-to-understand language. Write in short sentences.


# COMMENTS
- Write lots of comments in your code. explain exactly what you are doing in your comments.
- but be strategic, do not explain obvious syntax - instead explain your thought process at the time of writing the code!
- NEVER delete explanatory comments from the code you're editing (unless they are wrong/obsolete)
- focus on explaining the non-obvious stuff in the comments, the nuances / details
- DO NOT delete comments currently in our code. If the comment is obsolete, or wrong, then update it - but NEVER mindlessly remove comments without reason.


# UI DESIGN PRINCIPLES
- Follow shadcn-ui design patterns and best practices
- Use Tailwind CSS utility classes for styling
- Maintain consistent spacing and typography
- Use Radix UI primitives for accessible components
- Ensure mobile responsiveness with responsive design patterns
- Use lucide-react icons for consistent iconography
- Follow the existing color scheme and theming (supports dark mode via next-themes)
- Keep UI clean, minimal, and user-friendly


# HEADER COMMENTS
- EVERY file HAS TO start with 3 comments!
- the first comment needs to be the exact location of the file, for example: location/location/file-name.tsx (or .py or .md etc)
- the 2nd and 3rd comment should be a clear description of what this file was created to do. what IS and ISN'T the purpose of this file.
- NEVER delete these "header comments" from the files you're editing.


# IMPORTANT
- BE VERY SUSPICIOUS OF EVERY COMPLICATION in our code. SIMPLE = GOOD, COMPLEX = BAD.
- Always prioritize writing clean, simple, and modular code.
- do not add unnecessary complications.
- Implement precisely what the user asks for, without additional features or complexity.
- Prioritize simplicity and minimalism in your solutions.
