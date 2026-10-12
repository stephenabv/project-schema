import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-sm text-muted">The page you are looking for does not exist.</p>
      <ButtonLink href="/">Go home</ButtonLink>
    </main>
  );
}
