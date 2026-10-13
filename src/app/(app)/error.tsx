"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Error state for the signed-in area. Never renders error details. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <Alert tone="danger">We could not load this page. Your virtual balance is safe; please try again.</Alert>
      <Button onClick={reset} variant="secondary">
        Try again
      </Button>
    </div>
  );
}
