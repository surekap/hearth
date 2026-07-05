import Link from "next/link";
import { CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/mascot";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-xl items-center px-4">
      <Card className="w-full">
        <CardContent>
          <EmptyState
            mood="concerned"
            title="You are offline"
            description="Hearth can show pages your device has already cached, but uploads, extraction, AI answers, and sync need an internet connection."
          >
            <Button asChild>
              <Link href="/">
                <CloudOff className="size-4" />
                Try cached home
              </Link>
            </Button>
          </EmptyState>
        </CardContent>
      </Card>
    </main>
  );
}
