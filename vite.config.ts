import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Verify environment variables at build time
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  console.log('='.repeat(60));
  console.log('🔧 Vite Build Configuration');
  console.log('='.repeat(60));
  console.log('Mode:', mode);
  console.log('VITE_SUPABASE_URL:', supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : '❌ NOT DEFINED');
  console.log('VITE_SUPABASE_PUBLISHABLE_KEY:', supabaseKey ? `${supabaseKey.substring(0, 30)}...` : '❌ NOT DEFINED');
  console.log('='.repeat(60));

  if (mode === 'production' && (!supabaseUrl || !supabaseKey)) {
    console.error('❌ ERROR: Missing required environment variables for production build!');
    console.error('Please set the following in your deployment platform:');
    console.error('  - VITE_SUPABASE_URL');
    console.error('  - VITE_SUPABASE_PUBLISHABLE_KEY');
  }

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
